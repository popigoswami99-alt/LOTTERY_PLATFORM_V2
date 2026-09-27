import { AccountKind, BetStatus, TransactionType } from '@prisma/client';
import { GAMES, formatX100 } from '@lp/shared';
import { prisma } from '../../db/prisma.js';
import { getOrCreateUserAccount } from '../ledger/ledger.service.js';

/**
 * Profile data.
 *
 * Everything here is COMPUTED from the tables that already exist — bets,
 * instant bets, crash bets and the ledger. Nothing is a stored counter that
 * could drift out of step with what actually happened.
 */

// ---------------------------------------------------------------------------
// VIP
// ---------------------------------------------------------------------------

/**
 * VIP tier from lifetime turnover (total staked), in minor units.
 * Turnover rather than deposits, so it reflects play and not just funding.
 */
export const VIP_TIERS: Array<{ level: number; minTurnover: bigint }> = [
  { level: 0, minTurnover: 0n },
  { level: 1, minTurnover: 1_000_00n }, // ₹1,000
  { level: 2, minTurnover: 10_000_00n }, // ₹10,000
  { level: 3, minTurnover: 50_000_00n }, // ₹50,000
  { level: 4, minTurnover: 200_000_00n }, // ₹2,00,000
  { level: 5, minTurnover: 1_000_000_00n }, // ₹10,00,000
];

export function vipFor(turnover: bigint) {
  let current = VIP_TIERS[0];
  for (const t of VIP_TIERS) if (turnover >= t.minTurnover) current = t;
  const next = VIP_TIERS.find((t) => t.level === current.level + 1) ?? null;
  return {
    level: current.level,
    turnover,
    nextLevel: next?.level ?? null,
    nextAt: next?.minTurnover ?? null,
    /** 0-100 progress toward the next tier; 100 when already at the top. */
    progress: next
      ? Number(((turnover - current.minTurnover) * 100n) / (next.minTurnover - current.minTurnover))
      : 100,
  };
}

// ---------------------------------------------------------------------------
// Turnover / statistics
// ---------------------------------------------------------------------------

async function totals(userId: bigint) {
  const [periodAgg, instantAgg, crashAgg] = await Promise.all([
    prisma.bet.aggregate({ where: { userId }, _sum: { stake: true, payout: true }, _count: true }),
    prisma.instantBet.aggregate({
      where: { userId },
      _sum: { stake: true, payout: true },
      _count: true,
    }),
    prisma.crashBet.aggregate({
      where: { userId },
      _sum: { stake: true, payout: true },
      _count: true,
    }),
  ]);

  const staked =
    (periodAgg._sum.stake ?? 0n) + (instantAgg._sum.stake ?? 0n) + (crashAgg._sum.stake ?? 0n);
  const won =
    (periodAgg._sum.payout ?? 0n) + (instantAgg._sum.payout ?? 0n) + (crashAgg._sum.payout ?? 0n);
  const count = periodAgg._count + instantAgg._count + crashAgg._count;

  return { staked, won, count };
}

export async function getStats(userId: bigint) {
  const { staked, won, count } = await totals(userId);

  const [periodWins, instantWins, crashWins] = await Promise.all([
    prisma.bet.count({ where: { userId, status: BetStatus.WON } }),
    prisma.instantBet.count({ where: { userId, status: BetStatus.WON } }),
    prisma.crashBet.count({ where: { userId, status: BetStatus.WON } }),
  ]);
  const wins = periodWins + instantWins + crashWins;

  // Per-game breakdown, so the player can see where the money actually went.
  const [byPeriodGame, byInstantGame] = await Promise.all([
    prisma.bet.groupBy({
      by: ['gameCode'],
      where: { userId },
      _sum: { stake: true, payout: true },
      _count: true,
    }),
    prisma.instantBet.groupBy({
      by: ['gameCode'],
      where: { userId },
      _sum: { stake: true, payout: true },
      _count: true,
    }),
  ]);
  const crashTotals = await prisma.crashBet.aggregate({
    where: { userId },
    _sum: { stake: true, payout: true },
    _count: true,
  });

  const byGame = [
    ...byPeriodGame.map((g) => ({
      gameCode: g.gameCode,
      label: GAMES[g.gameCode]?.label ?? g.gameCode,
      bets: g._count,
      staked: g._sum.stake ?? 0n,
      won: g._sum.payout ?? 0n,
    })),
    ...byInstantGame.map((g) => ({
      gameCode: g.gameCode,
      label: prettyGame(g.gameCode),
      bets: g._count,
      staked: g._sum.stake ?? 0n,
      won: g._sum.payout ?? 0n,
    })),
    ...(crashTotals._count > 0
      ? [
          {
            gameCode: 'CRASH',
            label: 'Aviator',
            bets: crashTotals._count,
            staked: crashTotals._sum.stake ?? 0n,
            won: crashTotals._sum.payout ?? 0n,
          },
        ]
      : []),
  ].sort((a, b) => (b.staked > a.staked ? 1 : b.staked < a.staked ? -1 : 0));

  return {
    bets: count,
    wins,
    losses: count - wins,
    winRate: count > 0 ? Math.round((wins / count) * 1000) / 10 : 0,
    staked,
    won,
    net: won - staked,
    byGame,
  };
}

const GAME_LABELS: Record<string, string> = {
  DICE: 'Dice',
  LIMBO: 'Limbo',
  MINES: 'Mines',
  PLINKO: 'Plinko',
  KENO: 'Keno',
  HILO: 'Hi-Lo',
  ANDARBAHAR: 'Andar Bahar',
  DRAGONTIGER: 'Dragon Tiger',
  CRASH: 'Aviator',
};

function prettyGame(code: string): string {
  return GAME_LABELS[code] ?? GAMES[code]?.label ?? code;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getProfile(userId: bigint) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      phone: true,
      email: true,
      inviteCode: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  const cashId = await getOrCreateUserAccount(prisma, userId, AccountKind.USER_CASH);
  const cash = await prisma.ledgerAccount.findUniqueOrThrow({
    where: { id: cashId },
    select: { balance: true },
  });

  const safe = await prisma.ledgerAccount.findFirst({
    where: { ownerId: userId, kind: AccountKind.USER_SAFE },
    select: { balance: true },
  });

  const { staked } = await totals(userId);
  const referrals = await prisma.user.count({ where: { invitedById: userId } });

  return {
    // A stable, human-quotable id for support — the row id, zero-padded.
    uid: user.id.toString().padStart(8, '0'),
    nickname: user.nickname,
    phone: user.phone,
    email: user.email,
    inviteCode: user.inviteCode,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    memberSince: user.createdAt,
    balance: cash.balance,
    safeBalance: safe?.balance ?? 0n,
    referrals,
    vip: vipFor(staked),
  };
}

// ---------------------------------------------------------------------------
// Unified game history
// ---------------------------------------------------------------------------

export interface GameHistoryRow {
  id: string;
  kind: 'lottery' | 'instant' | 'crash';
  gameCode: string;
  label: string;
  detail: string;
  stake: bigint;
  payout: bigint;
  status: string;
  multiplier: string | null;
  createdAt: Date;
}

/**
 * One list across all three engines.
 *
 * Each engine stores bets in its own table with its own shape, so this fetches
 * a window from each, normalises them, and merges by time. Over-fetching a
 * little from each side is what keeps the merged page correct.
 */
export async function getGameHistory(userId: bigint, take = 40): Promise<GameHistoryRow[]> {
  const perSource = Math.min(take, 100);

  const [periodBets, instantBets, crashBets] = await Promise.all([
    prisma.bet.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      take: perSource,
      include: { period: { select: { periodNo: true, roomKey: true, resultNumber: true } } },
    }),
    prisma.instantBet.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      take: perSource,
    }),
    prisma.crashBet.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      take: perSource,
      include: { round: { select: { roundNo: true, crashPointX100: true } } },
    }),
  ]);

  const rows: GameHistoryRow[] = [
    ...periodBets.map((b) => ({
      id: `L${b.id}`,
      kind: 'lottery' as const,
      gameCode: b.gameCode,
      label: prettyGame(b.gameCode),
      detail: `${b.period.roomKey} · ${b.period.periodNo} · ${b.betType.toLowerCase()} ${b.selection}`,
      stake: b.stake,
      payout: b.payout,
      status: b.status,
      multiplier: b.status === BetStatus.WON ? `${b.oddsNum / b.oddsDen}x` : null,
      createdAt: b.createdAt,
    })),
    ...instantBets.map((b) => ({
      id: `I${b.id}`,
      kind: 'instant' as const,
      gameCode: b.gameCode,
      label: prettyGame(b.gameCode),
      detail: describeInstant(b.gameCode, b.params),
      stake: b.stake,
      payout: b.payout,
      status: b.status,
      multiplier: b.multiplierX100 > 0 ? `${formatX100(b.multiplierX100)}x` : null,
      createdAt: b.createdAt,
    })),
    ...crashBets.map((b) => ({
      id: `C${b.id}`,
      kind: 'crash' as const,
      gameCode: 'CRASH',
      label: 'Aviator',
      detail:
        `round ${b.round.roundNo} · panel ${b.slot} · busted ${formatX100(b.round.crashPointX100)}x` +
        (b.autoCashoutX100 ? ` · auto ${formatX100(b.autoCashoutX100)}x` : ''),
      stake: b.stake,
      payout: b.payout,
      status: b.status,
      multiplier: b.cashedOutX100 ? `${formatX100(b.cashedOutX100)}x` : null,
      createdAt: b.createdAt,
    })),
  ];

  return rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, take);
}

function describeInstant(gameCode: string, params: unknown): string {
  const p = (params ?? {}) as Record<string, unknown>;
  switch (gameCode) {
    case 'DICE':
      return `${String(p.direction ?? '')} ${Number(p.target ?? 0) / 100}`;
    case 'LIMBO':
      return `target ${formatX100(Number(p.targetX100 ?? 100))}x`;
    case 'MINES':
      return `${p.mines ?? '?'} mines`;
    case 'PLINKO':
      return `${p.rows ?? '?'} rows · ${p.risk ?? ''}`;
    case 'KENO':
      return `${(p.picks as number[] | undefined)?.length ?? 0} picks`;
    case 'ANDARBAHAR':
    case 'DRAGONTIGER':
      return `backed ${p.side ?? '—'}`;
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Money history
// ---------------------------------------------------------------------------

const MONEY_FILTERS: Record<string, TransactionType[]> = {
  all: [
    TransactionType.DEPOSIT,
    TransactionType.WITHDRAWAL,
    TransactionType.ADJUSTMENT,
    TransactionType.BONUS_GRANT,
    TransactionType.SAFE_IN,
    TransactionType.SAFE_OUT,
    TransactionType.SAFE_INTEREST,
    TransactionType.BET_STAKE,
    TransactionType.BET_PAYOUT,
    TransactionType.BET_REFUND,
  ],
  deposit: [TransactionType.DEPOSIT],
  withdraw: [TransactionType.WITHDRAWAL],
};

/** Ledger movements on the player's cash account, optionally filtered. */
export async function getMoneyHistory(userId: bigint, filter = 'all', take = 50) {
  const types = MONEY_FILTERS[filter] ?? MONEY_FILTERS.all;
  const accountId = await getOrCreateUserAccount(prisma, userId, AccountKind.USER_CASH);

  const entries = await prisma.ledgerEntry.findMany({
    where: { accountId, transaction: { type: { in: types } } },
    orderBy: { id: 'desc' },
    take,
    include: { transaction: { select: { type: true, memo: true, createdAt: true } } },
  });

  return entries.map((e) => ({
    id: e.id.toString(),
    type: e.transaction.type,
    amount: e.amount,
    balanceAfter: e.balanceAfter,
    memo: e.transaction.memo,
    createdAt: e.createdAt,
  }));
}
