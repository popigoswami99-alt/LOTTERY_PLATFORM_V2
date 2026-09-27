import { randomInt } from 'node:crypto';
import { AccountKind, BonusType, TransactionType, type Prisma } from '@prisma/client';
import { prisma, type Tx } from '../../db/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import {
  getOrCreateSystemAccount,
  getOrCreateUserAccount,
  postTransaction,
} from '../ledger/ledger.service.js';
import { dayStart, getTeam, today } from '../agency/agency.service.js';
import { deriveInstant } from '../game/draw.js';
import { getActiveSeedPair, claimNonce } from '../game/instant/seed.service.js';

/**
 * Activity centre — every bonus a player can earn.
 *
 * All of them share one claim table and one rule: a claim is identified by
 * (userId, type, scope), and the unique index makes it impossible to grant
 * twice. `scope` is the date for daily bonuses, the code for a gift, the spin
 * number for the wheel.
 *
 * Every payout is posted through the ledger from the HOUSE account, so bonus
 * money is as auditable as bet money and the global conservation check still
 * has to hold.
 *
 * COST DISCIPLINE. The house rake is 2% of turnover. Agency commission already
 * claims up to 1.29% of it. The self-rebate below takes 0.20%, leaving room —
 * that inequality is the constraint to respect when tuning any of these.
 */

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

/** Grants a bonus exactly once. Returns null if it was already claimed. */
async function grant(
  userId: bigint,
  type: BonusType,
  scope: string,
  amount: bigint,
  memo: string,
  meta?: Prisma.InputJsonValue,
): Promise<{ amount: bigint; balance: bigint } | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const claim = await tx.bonusClaim.create({
        data: { userId, type, scope, amount, meta },
      });

      if (amount <= 0n) return { amount: 0n, balance: await cashBalance(tx, userId) };

      const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
      const house = await getOrCreateSystemAccount(tx, AccountKind.HOUSE);

      const posted = await postTransaction(tx, {
        type: TransactionType.BONUS_GRANT,
        idempotencyKey: `bonus:${claim.id}`,
        referenceType: 'BONUS',
        referenceId: claim.id,
        memo,
        legs: [
          { accountId: house, amount: -amount },
          { accountId: userAccount, amount },
        ],
      });

      await tx.bonusClaim.update({ where: { id: claim.id }, data: { txId: posted.id } });

      await tx.user.update({
        where: { id: userId },
        data: { wagerRequirement: { increment: 3n * amount } },
      });

      return { amount, balance: posted.balancesAfter.get(userAccount) ?? 0n };
    });
  } catch (err) {
    // The unique index caught a repeat claim — that is the rule working.
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}

async function cashBalance(tx: Tx, userId: bigint): Promise<bigint> {
  const id = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
  const row = await tx.ledgerAccount.findUniqueOrThrow({
    where: { id },
    select: { balance: true },
  });
  return row.balance;
}

/** YYYY-MM-DD in the game timezone — the scope key for daily bonuses. */
function dateKey(ms: number): string {
  return new Date(dayStart(ms) + 12 * 3_600_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Daily check-in (attendance)
// ---------------------------------------------------------------------------

/** Reward per consecutive day, in minor units. Day 8+ stays at the top rung. */
export const CHECKIN_LADDER: bigint[] = [
  100n, // ₹1
  200n, // ₹2
  500n, // ₹5
  1_000n, // ₹10
  2_000n, // ₹20
  5_000n, // ₹50
  10_000n, // ₹100
];

export function checkinReward(streakDay: number): bigint {
  const i = Math.min(Math.max(streakDay, 1), CHECKIN_LADDER.length) - 1;
  return CHECKIN_LADDER[i];
}

/**
 * Current streak, counted backwards from today.
 *
 * A gap resets it. Today counts only if already claimed — so an unclaimed
 * today shows the streak the player is about to extend, not one they have.
 */
export async function getCheckinState(userId: bigint) {
  const claims = await prisma.bonusClaim.findMany({
    where: { userId, type: BonusType.CHECKIN },
    orderBy: { scope: 'desc' },
    take: 40,
    select: { scope: true, amount: true },
  });

  const claimed = new Set(claims.map((c) => c.scope));
  const todayKey = dateKey(Date.now());
  const claimedToday = claimed.has(todayKey);

  let streak = 0;
  // Start from today if claimed, otherwise from yesterday.
  let cursor = claimedToday ? today() : today() - DAY_MS;
  while (claimed.has(dateKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }

  const nextDay = claimedToday ? streak + 1 : streak + 1;

  return {
    streak,
    claimedToday,
    nextDay: Math.min(nextDay, CHECKIN_LADDER.length),
    nextReward: checkinReward(nextDay).toString(),
    ladder: CHECKIN_LADDER.map((v, i) => ({ day: i + 1, amount: v.toString() })),
    history: claims.slice(0, 10).map((c) => ({ date: c.scope, amount: c.amount.toString() })),
  };
}

export async function claimCheckin(userId: bigint) {
  const state = await getCheckinState(userId);
  if (state.claimedToday) throw conflict('ALREADY_CLAIMED', 'Already checked in today');

  const amount = checkinReward(state.nextDay);
  const result = await grant(
    userId,
    BonusType.CHECKIN,
    dateKey(Date.now()),
    amount,
    `daily check-in day ${state.nextDay}`,
    { day: state.nextDay },
  );
  if (!result) throw conflict('ALREADY_CLAIMED', 'Already checked in today');

  return { ...result, day: state.nextDay, streak: state.streak + 1 };
}

// ---------------------------------------------------------------------------
// Betting rebate — a share of the player's OWN turnover, settled daily
// ---------------------------------------------------------------------------

export const SELF_REBATE_BPS = 20n; // 0.20%
const BPS = 10_000n;
const MAX_REBATE_BACKFILL_DAYS = 14;

async function ownTurnover(userId: bigint, fromMs: number, toMs: number): Promise<bigint> {
  const where = {
    userId,
    createdAt: { gte: new Date(fromMs), lt: new Date(toMs) },
  };
  const [a, b, c] = await Promise.all([
    prisma.bet.aggregate({ where, _sum: { stake: true } }),
    prisma.instantBet.aggregate({ where, _sum: { stake: true } }),
    prisma.crashBet.aggregate({ where, _sum: { stake: true } }),
  ]);
  return (a._sum.stake ?? 0n) + (b._sum.stake ?? 0n) + (c._sum.stake ?? 0n);
}

// settleSelfRebates lives at the bottom of this file, next to the overview
// that triggers it.

// ---------------------------------------------------------------------------
// Gift codes
// ---------------------------------------------------------------------------

export async function redeemGiftCode(userId: bigint, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw badRequest('BAD_CODE', 'That code is not valid');

  const gift = await prisma.giftCode.findUnique({ where: { code } });
  if (!gift || !gift.active) throw notFound('That code does not exist');
  if (gift.expiresAt && gift.expiresAt < new Date()) {
    throw conflict('EXPIRED', 'That code has expired');
  }
  if (gift.redeemed >= gift.maxRedemptions) {
    throw conflict('EXHAUSTED', 'That code has been fully redeemed');
  }

  // Reserve a slot first. The conditional update is what stops two players
  // racing past the last remaining redemption.
  const reserved = await prisma.giftCode.updateMany({
    where: { id: gift.id, redeemed: { lt: gift.maxRedemptions } },
    data: { redeemed: { increment: 1 } },
  });
  if (reserved.count === 0) throw conflict('EXHAUSTED', 'That code has been fully redeemed');

  const result = await grant(
    userId,
    BonusType.GIFT_CODE,
    code,
    gift.amount,
    `gift code ${code}`,
    { code },
  );

  if (!result) {
    // This player already used it — hand the slot back.
    await prisma.giftCode.update({
      where: { id: gift.id },
      data: { redeemed: { decrement: 1 } },
    });
    throw conflict('ALREADY_CLAIMED', 'You have already redeemed that code');
  }

  return result;
}

// --- gift-code administration (operator) -----------------------------------

const GIFT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

function generateGiftCode(): string {
  let out = '';
  for (let i = 0; i < 10; i += 1) out += GIFT_ALPHABET[randomInt(GIFT_ALPHABET.length)];
  return out;
}

export async function listGiftCodesAdmin(take: number) {
  const rows = await prisma.giftCode.findMany({ orderBy: { id: 'desc' }, take });
  return rows.map((g) => ({
    id: g.id.toString(),
    code: g.code,
    amount: g.amount.toString(),
    maxRedemptions: g.maxRedemptions,
    redeemed: g.redeemed,
    active: g.active,
    expiresAt: g.expiresAt,
    createdAt: g.createdAt,
  }));
}

export async function createGiftCodeAdmin(input: {
  code?: string;
  amount: bigint;
  maxRedemptions: number;
  expiresAt?: Date | null;
}) {
  if (input.amount <= 0n) throw badRequest('BAD_AMOUNT', 'Amount must be positive');
  if (input.maxRedemptions < 1) throw badRequest('BAD_MAX', 'Redemptions must be at least 1');

  const code = (input.code?.trim().toUpperCase() || generateGiftCode()).slice(0, 32);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw badRequest('BAD_CODE', 'That code is not valid');

  const clash = await prisma.giftCode.findUnique({ where: { code } });
  if (clash) throw conflict('CODE_EXISTS', 'That code already exists');

  const gift = await prisma.giftCode.create({
    data: {
      code,
      amount: input.amount,
      maxRedemptions: input.maxRedemptions,
      expiresAt: input.expiresAt ?? null,
    },
  });
  return {
    id: gift.id.toString(),
    code: gift.code,
    amount: gift.amount.toString(),
    maxRedemptions: gift.maxRedemptions,
    redeemed: gift.redeemed,
    active: gift.active,
    expiresAt: gift.expiresAt,
    createdAt: gift.createdAt,
  };
}

export async function setGiftCodeActive(id: bigint, active: boolean) {
  const gift = await prisma.giftCode.findUnique({ where: { id } });
  if (!gift) throw notFound('Gift code not found');
  await prisma.giftCode.update({ where: { id }, data: { active } });
  return { id: id.toString(), active };
}

// ---------------------------------------------------------------------------
// First deposit bonus — single reward, sized by which bracket the FIRST
// deposit reaches
//
// Corrected per explicit spec: this is NOT a cumulative ladder where every
// crossed threshold pays separately. There is exactly ONE reward per account,
// and it is sized by the highest bracket the player's first deposit reaches —
// depositing ₹10,000 qualifies for the ₹10,000 bracket only; the ₹5,000
// bracket it also cleared is silently superseded ("skipped"), not paid in
// addition. The bonus at every bracket is a uniform 10% of that bracket's own
// threshold. Brackets run ₹500 to ₹5,00,000; a first deposit under ₹500
// qualifies for nothing.
// ---------------------------------------------------------------------------

/** Uniform rate applied to every bracket's own threshold to get its bonus. */
export const FIRST_DEPOSIT_RATE_BPS = 1_000n; // 10%

const FIRST_DEPOSIT_THRESHOLDS_MINOR: bigint[] = [
  50_000n, // ₹500
  100_000n, // ₹1,000
  500_000n, // ₹5,000
  1_000_000n, // ₹10,000
  2_000_000n, // ₹20,000
  5_000_000n, // ₹50,000
  10_000_000n, // ₹1,00,000
  20_000_000n, // ₹2,00,000
  30_000_000n, // ₹3,00,000
  40_000_000n, // ₹4,00,000
  50_000_000n, // ₹5,00,000
];

export interface FirstDepositTier {
  threshold: bigint;
  bonus: bigint;
}

export const FIRST_DEPOSIT_TIERS: FirstDepositTier[] = FIRST_DEPOSIT_THRESHOLDS_MINOR.map(
  (threshold) => ({ threshold, bonus: (threshold * FIRST_DEPOSIT_RATE_BPS) / BPS }),
);

/** The single highest bracket a deposit amount qualifies for, or null. */
export function firstDepositTierFor(depositAmount: bigint): FirstDepositTier | null {
  return FIRST_DEPOSIT_TIERS.reduce<FirstDepositTier | null>(
    (acc, t) => (depositAmount >= t.threshold ? t : acc),
    null,
  );
}

export async function getFirstDepositState(userId: bigint) {
  const accountId = await getOrCreateUserAccount(prisma, userId, AccountKind.USER_CASH);
  const [first, claimedRow] = await Promise.all([
    prisma.ledgerEntry.findFirst({
      where: {
        accountId,
        amount: { gt: 0 },
        transaction: { is: { type: TransactionType.DEPOSIT } },
      },
      orderBy: { id: 'asc' },
      select: { amount: true },
    }),
    prisma.bonusClaim.findFirst({
      where: { userId, type: BonusType.FIRST_DEPOSIT },
      select: { id: true },
    }),
  ]);

  const firstDepositAmount = first?.amount ?? null;
  const qualifiedTier = firstDepositAmount !== null ? firstDepositTierFor(firstDepositAmount) : null;

  return {
    firstDepositAmount: firstDepositAmount?.toString() ?? null,
    qualifiedThreshold: qualifiedTier?.threshold.toString() ?? null,
    qualifiedBonus: qualifiedTier?.bonus.toString() ?? null,
    claimed: claimedRow !== null,
    ratePct: Number(FIRST_DEPOSIT_RATE_BPS) / 100,
    tiers: FIRST_DEPOSIT_TIERS.map((t) => ({
      threshold: t.threshold.toString(),
      bonus: t.bonus.toString(),
      // The one tier the player's own reward is sized by.
      qualified: qualifiedTier !== null && t.threshold === qualifiedTier.threshold,
      // A lower bracket their deposit also cleared, superseded by the higher one.
      skipped:
        firstDepositAmount !== null &&
        firstDepositAmount >= t.threshold &&
        (qualifiedTier === null || t.threshold !== qualifiedTier.threshold),
    })),
  };
}

/** Awards the single first-deposit bonus, sized by the bracket it reached. */
export async function claimFirstDeposit(userId: bigint) {
  const accountId = await getOrCreateUserAccount(prisma, userId, AccountKind.USER_CASH);

  const first = await prisma.ledgerEntry.findFirst({
    where: {
      accountId,
      amount: { gt: 0 },
      transaction: { is: { type: TransactionType.DEPOSIT } },
    },
    orderBy: { id: 'asc' },
    select: { amount: true },
  });
  if (!first) throw conflict('NO_DEPOSIT', 'Make a deposit first');

  const tier = firstDepositTierFor(first.amount);
  if (!tier) {
    throw conflict(
      'BELOW_MIN',
      `Your first deposit must be at least ₹${(FIRST_DEPOSIT_TIERS[0].threshold / 100n).toString()}`,
    );
  }

  const result = await grant(
    userId,
    BonusType.FIRST_DEPOSIT,
    'once',
    tier.bonus,
    `first deposit bonus (₹${(tier.threshold / 100n).toString()} bracket)`,
    { depositAmount: first.amount.toString(), threshold: tier.threshold.toString() },
  );
  if (!result) throw conflict('ALREADY_CLAIMED', 'First deposit bonus already claimed');

  return result;
}

// ---------------------------------------------------------------------------
// Invite wheel
// ---------------------------------------------------------------------------

/** Prize ladder and weights. Weights are relative, not percentages. */
export const WHEEL_PRIZES: Array<{ amount: bigint; weight: number }> = [
  { amount: 200n, weight: 40 }, // ₹2
  { amount: 500n, weight: 25 }, // ₹5
  { amount: 1_000n, weight: 18 }, // ₹10
  { amount: 2_000n, weight: 10 }, // ₹20
  { amount: 5_000n, weight: 5 }, // ₹50
  { amount: 20_000n, weight: 2 }, // ₹200
];

const WHEEL_TOTAL_WEIGHT = WHEEL_PRIZES.reduce((a, p) => a + p.weight, 0);

/** One spin per successful invite. */
export async function getWheelState(userId: bigint) {
  const [invites, used] = await Promise.all([
    prisma.user.count({ where: { invitedById: userId } }),
    prisma.bonusClaim.count({ where: { userId, type: BonusType.WHEEL } }),
  ]);

  return {
    earned: invites,
    used,
    available: Math.max(0, invites - used),
    prizes: WHEEL_PRIZES.map((p) => ({
      amount: p.amount.toString(),
      chance: Math.round((p.weight / WHEEL_TOTAL_WEIGHT) * 1000) / 10,
    })),
  };
}

/**
 * Spins the wheel. The outcome comes from the player's own seed pair, so a
 * wheel prize is verifiable exactly like a game round rather than being a
 * number the server simply asserts.
 */
export async function spinWheel(userId: bigint) {
  const state = await getWheelState(userId);
  if (state.available <= 0) {
    throw conflict('NO_SPINS', 'Invite a player to earn a spin');
  }

  const pair = await getActiveSeedPair(userId);
  const nonce = await prisma.$transaction((tx) => claimNonce(tx, pair.id));

  const roll = deriveInstant(pair.serverSeed, pair.clientSeed, nonce) % WHEEL_TOTAL_WEIGHT;
  let acc = 0;
  let prize = WHEEL_PRIZES[0];
  for (const p of WHEEL_PRIZES) {
    acc += p.weight;
    if (roll < acc) {
      prize = p;
      break;
    }
  }

  const spinNo = state.used + 1;
  const result = await grant(
    userId,
    BonusType.WHEEL,
    `spin-${spinNo}`,
    prize.amount,
    `invite wheel spin ${spinNo}`,
    { nonce, roll, prize: prize.amount.toString() },
  );
  if (!result) throw conflict('ALREADY_CLAIMED', 'That spin was already used');

  return {
    ...result,
    prize: prize.amount.toString(),
    index: WHEEL_PRIZES.indexOf(prize),
    spinsLeft: state.available - 1,
  };
}

// ---------------------------------------------------------------------------
// VIP levels — one-off reward each time cumulative turnover crosses a tier
//
// Rewards are sized against the rake budget: the level-up bonuses to reach the
// top tier total ~0.36% of that tier's turnover, inside the ~0.51% the rake has
// left after agency commission (1.29%) and the self-rebate (0.20%).
// ---------------------------------------------------------------------------

export interface VipLevel {
  level: number;
  name: string;
  /** Cumulative turnover required, minor units. */
  turnover: bigint;
  /** One-off reward on reaching this level, minor units. */
  reward: bigint;
}

export const VIP_LEVELS: VipLevel[] = [
  { level: 1, name: 'Bronze', turnover: 100_000n, reward: 200n },
  { level: 2, name: 'Silver', turnover: 500_000n, reward: 1_000n },
  { level: 3, name: 'Gold', turnover: 2_000_000n, reward: 5_000n },
  { level: 4, name: 'Platinum', turnover: 5_000_000n, reward: 12_000n },
  { level: 5, name: 'Diamond', turnover: 15_000_000n, reward: 40_000n },
  { level: 6, name: 'Master', turnover: 50_000_000n, reward: 120_000n },
  { level: 7, name: 'Grandmaster', turnover: 150_000_000n, reward: 400_000n },
  { level: 8, name: 'Legend', turnover: 500_000_000n, reward: 1_200_000n },
];

/** Cumulative lifetime turnover — every stake the player has ever placed. */
async function lifetimeTurnover(userId: bigint): Promise<bigint> {
  const where = { userId };
  const [a, b, c] = await Promise.all([
    prisma.bet.aggregate({ where, _sum: { stake: true } }),
    prisma.instantBet.aggregate({ where, _sum: { stake: true } }),
    prisma.crashBet.aggregate({ where, _sum: { stake: true } }),
  ]);
  return (a._sum.stake ?? 0n) + (b._sum.stake ?? 0n) + (c._sum.stake ?? 0n);
}

export async function getVipState(userId: bigint) {
  const [turnover, claims] = await Promise.all([
    lifetimeTurnover(userId),
    prisma.bonusClaim.findMany({
      where: { userId, type: BonusType.VIP },
      select: { scope: true },
    }),
  ]);

  const claimed = new Set(claims.map((c) => c.scope)); // scope = "level-N"

  const reachedLevel = VIP_LEVELS.reduce(
    (acc, l) => (turnover >= l.turnover ? l.level : acc),
    0,
  );
  const current = VIP_LEVELS.find((l) => l.level === reachedLevel) ?? null;
  const next = VIP_LEVELS.find((l) => l.turnover > turnover) ?? null;

  const floor = current?.turnover ?? 0n;
  const ceil = next?.turnover ?? current?.turnover ?? 1n;
  const span = ceil - floor;
  const progressPct =
    next === null ? 100 : Number(((turnover - floor) * 100n) / (span === 0n ? 1n : span));

  const levels = VIP_LEVELS.map((l) => ({
    level: l.level,
    name: l.name,
    turnover: l.turnover.toString(),
    reward: l.reward.toString(),
    reached: turnover >= l.turnover,
    claimed: claimed.has(`level-${l.level}`),
  }));

  const claimable = VIP_LEVELS.filter(
    (l) => turnover >= l.turnover && !claimed.has(`level-${l.level}`),
  );
  const claimableTotal = claimable.reduce((a, l) => a + l.reward, 0n);

  return {
    turnover: turnover.toString(),
    level: reachedLevel,
    levelName: current?.name ?? 'Unranked',
    next: next
      ? { level: next.level, name: next.name, turnover: next.turnover.toString() }
      : null,
    toNext: next ? (next.turnover - turnover).toString() : '0',
    progressPct: Math.max(0, Math.min(100, progressPct)),
    levels,
    claimableLevels: claimable.map((l) => l.level),
    claimableTotal: claimableTotal.toString(),
  };
}

/** Claims every reached-but-unclaimed VIP level in one go. */
export async function claimVip(userId: bigint) {
  const turnover = await lifetimeTurnover(userId);
  const eligible = VIP_LEVELS.filter((l) => turnover >= l.turnover);
  if (eligible.length === 0) {
    throw conflict('NO_VIP', 'Place some bets to reach your first VIP level');
  }

  let claimedAmount = 0n;
  let lastBalance: bigint | null = null;
  const claimedLevels: number[] = [];

  for (const l of eligible) {
    const result = await grant(
      userId,
      BonusType.VIP,
      `level-${l.level}`,
      l.reward,
      `VIP ${l.name} (level ${l.level}) reward`,
      { level: l.level, turnover: turnover.toString() },
    );
    if (result) {
      claimedAmount += result.amount;
      lastBalance = result.balance;
      claimedLevels.push(l.level);
    }
  }

  if (claimedLevels.length === 0) {
    throw conflict('ALREADY_CLAIMED', 'All reached VIP rewards are already claimed');
  }

  return {
    claimedLevels,
    amount: claimedAmount.toString(),
    balance: (lastBalance ?? 0n).toString(),
  };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getActivityOverview(userId: bigint) {
  await settleSelfRebates(userId);

  const startOfToday = new Date(today());

  const [todayAgg, totalAgg, checkin, wheel, firstDeposit] = await Promise.all([
    prisma.bonusClaim.aggregate({
      where: { userId, createdAt: { gte: startOfToday } },
      _sum: { amount: true },
    }),
    prisma.bonusClaim.aggregate({ where: { userId }, _sum: { amount: true } }),
    getCheckinState(userId),
    getWheelState(userId),
    getFirstDepositState(userId),
  ]);

  return {
    todayBonus: (todayAgg._sum.amount ?? 0n).toString(),
    totalBonus: (totalAgg._sum.amount ?? 0n).toString(),
    checkin,
    wheel,
    firstDeposit,
    rebateRate: Number(SELF_REBATE_BPS) / 100,
  };
}

export async function getBonusHistory(userId: bigint, take = 50) {
  const rows = await prisma.bonusClaim.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    take,
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    type: r.type,
    scope: r.scope,
    amount: r.amount.toString(),
    createdAt: r.createdAt,
  }));
}

/**
 * Settles the player's own betting rebate for every complete unsettled day.
 * Separate from the agency commission, which pays on a TEAM's turnover.
 */
export async function settleSelfRebates(userId: bigint): Promise<void> {
  const last = await prisma.bonusClaim.findFirst({
    where: { userId, type: BonusType.REBATE },
    orderBy: { scope: 'desc' },
    select: { scope: true },
  });

  const earliest = today() - MAX_REBATE_BACKFILL_DAYS * DAY_MS;
  let cursor = earliest;
  if (last) {
    const lastMs = dayStart(new Date(`${last.scope}T12:00:00Z`).getTime());
    cursor = Math.max(lastMs + DAY_MS, earliest);
  }

  const end = today() - DAY_MS;
  for (let day = cursor; day <= end; day += DAY_MS) {
    const turnover = await ownTurnover(userId, day, day + DAY_MS);
    const amount = (turnover * SELF_REBATE_BPS) / BPS;
    // Recorded even at zero so the day is never recomputed.
    await grant(userId, BonusType.REBATE, dateKey(day), amount, `betting rebate ${dateKey(day)}`, {
    });
  }
}

// --- Promotions ------------------------------------------------------------

export async function getPromotionState(userId: bigint) {
  const levels = await getTeam(userId);
  const subIds = levels.flatMap((l) => l.userIds);

  let subDeposit = 0n;
  if (subIds.length > 0) {
    const dep = await prisma.depositOrder.aggregate({
      where: { userId: { in: subIds }, status: 'SUCCESS' },
      _sum: { amount: true },
    });
    subDeposit = dep._sum.amount ?? 0n;
  }

  let subBet = 0n;
  if (subIds.length > 0) {
    const instant = await prisma.instantBet.aggregate({
      where: { userId: { in: subIds }, status: { in: ['WON', 'LOST'] } },
      _sum: { stake: true },
    });
    const crash = await prisma.crashBet.aggregate({
      where: { userId: { in: subIds }, status: { in: ['WON', 'LOST'] } },
      _sum: { stake: true },
    });
    const lottery = await prisma.bet.aggregate({
      where: { userId: { in: subIds }, status: { in: ['WON', 'LOST'] } },
      _sum: { stake: true },
    });
    subBet = (instant._sum.stake ?? 0n) + (crash._sum.stake ?? 0n) + (lottery._sum.stake ?? 0n);
  }

  const claims = await prisma.promoBoxClaim.findMany({
    where: { userId },
    select: { level: true, boxGroup: true },
  });

  return { subDeposit: subDeposit.toString(), subBet: subBet.toString(), claims };
}

export async function claimPromotionBox(userId: bigint, level: number, boxGroup: number) {
  const state = await getPromotionState(userId);
  const subDeposit = BigInt(state.subDeposit);
  const subBet = BigInt(state.subBet);

  let requiredDeposit = 0n;
  let requiredBet = 0n;
  let totalBonus = 0n;

  if (level === 1) {
    requiredDeposit = 50000n; // 500 INR
    requiredBet = 500000n; // 5000 INR
    totalBonus = 60000n; // 600 INR
  } else if (level === 2) {
    requiredDeposit = 200000n; // 2000 INR
    requiredBet = 2000000n; // 20000 INR
    totalBonus = 100000n; // 1000 INR
  } else if (level === 3) {
    requiredDeposit = 500000n; // 5000 INR
    requiredBet = 5000000n; // 50000 INR
    totalBonus = 300000n; // 3000 INR
  } else {
    throw badRequest('INVALID_LEVEL', 'Invalid promotion level');
  }

  if (subDeposit < requiredDeposit || subBet < requiredBet) {
    throw badRequest('REQUIREMENTS_NOT_MET', 'Promotion requirements not met');
  }

  if (boxGroup < 1 || boxGroup > 19) {
    throw badRequest('INVALID_BOX', 'Invalid box group');
  }

  // Calculate box amount
  const boxAmount = totalBonus / 100n;
  let claimAmount = boxAmount;
  if (boxGroup > 10) {
    claimAmount = boxAmount * 10n; // Groups of 10
  }

  // Attempt to claim
  return await prisma.$transaction(async (tx) => {
    const existing = await tx.promoBoxClaim.findUnique({
      where: { userId_level_boxGroup: { userId, level, boxGroup } },
    });
    if (existing) throw conflict('ALREADY_CLAIMED', 'You have already claimed this box');

    const claim = await tx.promoBoxClaim.create({
      data: { userId, level, boxGroup, amount: claimAmount },
    });

    const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
    const house = await getOrCreateSystemAccount(tx, AccountKind.HOUSE);

    const posted = await postTransaction(tx, {
      type: TransactionType.BONUS_GRANT,
      idempotencyKey: `promo-box:${claim.id}`,
      referenceType: 'PROMO_BOX',
      referenceId: claim.id,
      memo: `promotion level ${level} box ${boxGroup}`,
      legs: [
        { accountId: house, amount: -claimAmount },
        { accountId: userAccount, amount: claimAmount },
      ],
    });

    const u = await tx.user.findUnique({ where: { id: userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        wagerRequirement: { increment: 3n * claimAmount },
        promoLevel: Math.max(level, u?.promoLevel || 0),
      },
    });

    return { amount: claimAmount.toString(), balance: posted.balancesAfter.get(userAccount)?.toString() ?? '0' };
  });
}
