import { AccountKind, TransactionType, type Prisma } from '@prisma/client';
import { GAME_TZ_OFFSET_MIN } from '@lp/shared';
import { prisma } from '../../db/prisma.js';
import {
  getOrCreateSystemAccount,
  getOrCreateUserAccount,
  postTransaction,
} from '../ledger/ledger.service.js';

/**
 * The agency (referral commission) engine.
 *
 * Every player carries the account that invited them, so the tree has existed
 * since the first user was created. This turns that tree into money.
 *
 * MODEL
 * -----
 * Commission is a REBATE ON TURNOVER, not on losses: an agent earns a fixed
 * share of everything their team stakes, whether the team wins or loses. That
 * keeps the agent's incentive independent of any individual player's results
 * and makes the cost predictable.
 *
 * Rates fall away with depth, six levels deep. The total across all levels is
 * 1.29% of team turnover, against a 2% house rake — so a fully populated tree
 * still leaves the operator ahead. That relationship is the constraint to
 * respect when changing these numbers: SUM(rates) must stay below the rake, or
 * the platform pays out more than it earns.
 */

/** Rebate per level, in basis points of turnover. */
export const REBATE_RATES_BPS: number[] = [70, 30, 15, 8, 4, 2];
export const MAX_LEVEL = REBATE_RATES_BPS.length;
export const BPS = 10_000n;

/** How far back a first settlement will reach, to bound the work. */
const MAX_BACKFILL_DAYS = 30;

// ---------------------------------------------------------------------------
// Day boundaries
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const TZ_OFFSET_MS = GAME_TZ_OFFSET_MIN * 60_000;

/** Midnight of the day containing `ms`, in the game timezone. */
export function dayStart(ms: number): number {
  return Math.floor((ms + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS;
}

export function today(): number {
  return dayStart(Date.now());
}

export function yesterday(): number {
  return today() - DAY_MS;
}

// ---------------------------------------------------------------------------
// The team
// ---------------------------------------------------------------------------

export interface TeamLevel {
  level: number;
  userIds: bigint[];
}

/**
 * Walks the referral tree downward, one level at a time.
 *
 * Breadth-first rather than recursive SQL: each level is a single `IN` query,
 * and the depth is capped, so the number of round trips is bounded by
 * MAX_LEVEL regardless of how wide the tree gets.
 */
export async function getTeam(userId: bigint, maxLevel = MAX_LEVEL): Promise<TeamLevel[]> {
  const levels: TeamLevel[] = [];
  let frontier = [userId];
  const seen = new Set<string>([userId.toString()]);

  for (let level = 1; level <= maxLevel; level += 1) {
    if (frontier.length === 0) break;

    const rows = await prisma.user.findMany({
      where: { invitedById: { in: frontier } },
      select: { id: true },
    });

    // Guard against a cycle ever being introduced by bad data.
    const ids = rows.map((r) => r.id).filter((id) => !seen.has(id.toString()));
    ids.forEach((id) => seen.add(id.toString()));

    if (ids.length === 0) break;
    levels.push({ level, userIds: ids });
    frontier = ids;
  }

  return levels;
}

// ---------------------------------------------------------------------------
// Turnover
// ---------------------------------------------------------------------------

/** Total staked by a set of users within a time window, across all engines. */
async function turnoverFor(userIds: bigint[], fromMs: number, toMs: number): Promise<bigint> {
  if (userIds.length === 0) return 0n;
  const where = {
    userId: { in: userIds },
    createdAt: { gte: new Date(fromMs), lt: new Date(toMs) },
  };

  const [a, b, c] = await Promise.all([
    prisma.bet.aggregate({ where, _sum: { stake: true } }),
    prisma.instantBet.aggregate({ where, _sum: { stake: true } }),
    prisma.crashBet.aggregate({ where, _sum: { stake: true } }),
  ]);

  return (a._sum.stake ?? 0n) + (b._sum.stake ?? 0n) + (c._sum.stake ?? 0n);
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

export interface LevelBreakdown {
  level: number;
  users: number;
  turnover: string;
  rateBps: number;
  amount: string;
}

/**
 * Settles one whole day for one agent. Idempotent through the unique key on
 * (userId, forDate) — a second attempt finds the record and does nothing.
 */
async function settleDay(userId: bigint, dayMs: number): Promise<bigint> {
  const existing = await prisma.commissionRecord.findUnique({
    where: { userId_forDate: { userId, forDate: new Date(dayMs) } },
    select: { amount: true },
  });
  if (existing) return existing.amount;

  const team = await getTeam(userId);
  const breakdown: LevelBreakdown[] = [];
  let total = 0n;
  let totalTurnover = 0n;

  for (const { level, userIds } of team) {
    const rateBps = REBATE_RATES_BPS[level - 1] ?? 0;
    const turnover = await turnoverFor(userIds, dayMs, dayMs + DAY_MS);
    const amount = (turnover * BigInt(rateBps)) / BPS;

    totalTurnover += turnover;
    total += amount;
    breakdown.push({
      level,
      users: userIds.length,
      turnover: turnover.toString(),
      rateBps,
      amount: amount.toString(),
    });
  }

  // A zero day is still recorded, so it is never recomputed.
  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.commissionRecord.create({
        data: {
          userId,
          forDate: new Date(dayMs),
          turnover: totalTurnover,
          amount: total,
          levels: breakdown as unknown as Prisma.InputJsonValue,
        },
      });

      if (total > 0n) {
        const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
        const house = await getOrCreateSystemAccount(tx, AccountKind.HOUSE);

        const posted = await postTransaction(tx, {
          type: TransactionType.COMMISSION,
          idempotencyKey: `commission:${userId}:${dayMs}`,
          referenceType: 'COMMISSION',
          referenceId: record.id,
          memo: `agency rebate ${new Date(dayMs).toISOString().slice(0, 10)}`,
          legs: [
            { accountId: house, amount: -total },
            { accountId: userAccount, amount: total },
          ],
        });

        await tx.commissionRecord.update({
          where: { id: record.id },
          data: { txId: posted.id },
        });
      }
    });
  } catch (err) {
    // Another request settled this day first — that is the expected outcome
    // of the unique key doing its job, not an error.
    if (isUniqueViolation(err)) return 0n;
    throw err;
  }

  return total;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}

/**
 * Brings an agent's commission up to date, settling every complete day that
 * has not been settled yet.
 *
 * Lazy, like the Safe: driven on read rather than by a cron, so there is no
 * job to fall behind or double-run, and a platform that was offline simply
 * catches up the next time the page is opened. Only whole past days settle —
 * today is still accumulating.
 */
export async function settleUpToYesterday(userId: bigint): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { createdAt: true },
  });

  const last = await prisma.commissionRecord.findFirst({
    where: { userId },
    orderBy: { forDate: 'desc' },
    select: { forDate: true },
  });

  const earliestAllowed = today() - MAX_BACKFILL_DAYS * DAY_MS;
  let cursor = last
    ? last.forDate.getTime() + DAY_MS
    : Math.max(dayStart(user.createdAt.getTime()), earliestAllowed);
  cursor = Math.max(cursor, earliestAllowed);

  const end = yesterday();
  for (let day = cursor; day <= end; day += DAY_MS) {
    await settleDay(userId, day);
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface SideStats {
  registers: number;
  depositors: number;
  depositAmount: string;
  firstDepositors: number;
}

/** Registration / deposit stats for a set of users. */
async function statsFor(userIds: bigint[]): Promise<SideStats> {
  if (userIds.length === 0) {
    return { registers: 0, depositors: 0, depositAmount: '0', firstDepositors: 0 };
  }

  const accounts = await prisma.ledgerAccount.findMany({
    where: { ownerId: { in: userIds }, kind: AccountKind.USER_CASH },
    select: { id: true, ownerId: true },
  });
  const accountIds = accounts.map((a) => a.id);

  const deposits = await prisma.ledgerEntry.groupBy({
    by: ['accountId'],
    where: {
      accountId: { in: accountIds },
      transaction: { type: TransactionType.DEPOSIT },
      amount: { gt: 0 },
    },
    _sum: { amount: true },
    _count: true,
  });

  const depositAmount = deposits.reduce((acc, d) => acc + (d._sum.amount ?? 0n), 0n);

  return {
    registers: userIds.length,
    // Distinct accounts that have ever received a deposit.
    depositors: deposits.length,
    depositAmount: depositAmount.toString(),
    // Everyone who has deposited has, by definition, made a first deposit.
    firstDepositors: deposits.length,
  };
}

export async function getAgencyOverview(userId: bigint) {
  await settleUpToYesterday(userId);

  const team = await getTeam(userId);
  const direct = team.find((l) => l.level === 1)?.userIds ?? [];
  const all = team.flatMap((l) => l.userIds);

  const [directStats, teamStats] = await Promise.all([statsFor(direct), statsFor(all)]);

  const yDay = new Date(yesterday());
  const [yesterdayRec, totalAgg, weekAgg] = await Promise.all([
    prisma.commissionRecord.findUnique({
      where: { userId_forDate: { userId, forDate: yDay } },
      select: { amount: true },
    }),
    prisma.commissionRecord.aggregate({ where: { userId }, _sum: { amount: true } }),
    prisma.commissionRecord.aggregate({
      where: { userId, forDate: { gte: new Date(today() - 7 * DAY_MS) } },
      _sum: { amount: true },
    }),
  ]);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { inviteCode: true },
  });

  return {
    inviteCode: user.inviteCode,
    yesterdayCommission: (yesterdayRec?.amount ?? 0n).toString(),
    weekCommission: (weekAgg._sum.amount ?? 0n).toString(),
    totalCommission: (totalAgg._sum.amount ?? 0n).toString(),
    direct: directStats,
    team: teamStats,
    levels: team.map((l) => ({
      level: l.level,
      users: l.userIds.length,
      rateBps: REBATE_RATES_BPS[l.level - 1] ?? 0,
    })),
  };
}

/** Subordinates with their own turnover, for the "Subordinate data" screen. */
export async function getSubordinates(userId: bigint, level = 1, take = 50) {
  const team = await getTeam(userId);
  const ids = team.find((l) => l.level === level)?.userIds ?? [];
  if (ids.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, nickname: true, createdAt: true },
    orderBy: { id: 'desc' },
    take,
  });

  // Lifetime turnover per subordinate, across all three engines.
  const pick = users.map((u) => u.id);
  const [a, b, c] = await Promise.all([
    prisma.bet.groupBy({ by: ['userId'], where: { userId: { in: pick } }, _sum: { stake: true } }),
    prisma.instantBet.groupBy({
      by: ['userId'],
      where: { userId: { in: pick } },
      _sum: { stake: true },
    }),
    prisma.crashBet.groupBy({
      by: ['userId'],
      where: { userId: { in: pick } },
      _sum: { stake: true },
    }),
  ]);

  const turnover = new Map<string, bigint>();
  for (const g of [...a, ...b, ...c]) {
    const k = g.userId.toString();
    turnover.set(k, (turnover.get(k) ?? 0n) + (g._sum.stake ?? 0n));
  }

  return users.map((u) => ({
    // Nickname is masked: an upline should see activity, not identities.
    name: `${u.nickname.slice(0, 1)}***${u.nickname.slice(-1)}`,
    uid: u.id.toString().padStart(8, '0'),
    joinedAt: u.createdAt,
    turnover: (turnover.get(u.id.toString()) ?? 0n).toString(),
  }));
}

export async function getCommissionHistory(userId: bigint, take = 30) {
  await settleUpToYesterday(userId);

  const rows = await prisma.commissionRecord.findMany({
    where: { userId },
    orderBy: { forDate: 'desc' },
    take,
  });

  return rows.map((r) => ({
    date: r.forDate,
    turnover: r.turnover.toString(),
    amount: r.amount.toString(),
    levels: r.levels as unknown as LevelBreakdown[],
  }));
}

/** The published rebate table, for the "Rebate ratio" screen. */
export function getRebateTable() {
  return {
    rates: REBATE_RATES_BPS.map((bps, i) => ({
      level: i + 1,
      rateBps: bps,
      ratePercent: bps / 100,
    })),
    totalBps: REBATE_RATES_BPS.reduce((a, b) => a + b, 0),
    houseRakeBps: 200,
  };
}
