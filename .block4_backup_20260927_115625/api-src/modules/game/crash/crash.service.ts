import { randomBytes } from 'node:crypto';
import { AccountKind, BetStatus, CrashPhase, TransactionType } from '@prisma/client';
import {
  CRASH_HOLD_MS,
  CRASH_WAIT_MS,
  MAX_CRASH_X100,
  MIN_CRASH_X100,
  X100,
  crashPayout,
  crashPointFromValue,
  multiplierAtX100,
  roundDurationMs,
} from '@lp/shared';
import { prisma } from '../../../db/prisma.js';
import { badRequest, conflict, notFound } from '../../../lib/errors.js';
import {
  getOrCreateSystemAccount,
  getOrCreateUserAccount,
  postTransaction,
} from '../../ledger/ledger.service.js';
import { deriveRaw52, hashSeed } from '../draw.js';

export const CRASH_MIN_STAKE = 1_000n; // ₹10
export const CRASH_MAX_STAKE = 10_000_000n; // ₹100,000

/**
 * Crash round lifecycle.
 *
 * The single most important property here: THE SERVER'S CLOCK DECIDES
 * EVERYTHING. A cashout is priced from `startedAt` and the server's own
 * `Date.now()`, never from a multiplier the client sends. A client that lies
 * about when it clicked gains nothing, because the number it sends is not an
 * input to the payout at all.
 *
 * The crash point is committed before the round opens (hash published, seed
 * revealed after the bust), so it cannot be moved once bets are in.
 */

/** The round players are currently looking at, creating one if none is live. */
export async function currentRound() {
  const live = await prisma.crashRound.findFirst({
    where: { phase: { in: [CrashPhase.WAITING, CrashPhase.RUNNING, CrashPhase.CRASHED] } },
    orderBy: { roundNo: 'desc' },
  });
  if (live) return live;
  return createRound();
}

export async function createRound() {
  const last = await prisma.crashRound.findFirst({
    orderBy: { roundNo: 'desc' },
    select: { roundNo: true },
  });
  const roundNo = (last?.roundNo ?? 0n) + 1n;

  const serverSeed = randomBytes(32).toString('hex');
  // The bust point is fixed HERE — before the round is visible, before any bet
  // exists. Only its hash is public until the round ends.
  const crashPointX100 = crashPointFromValue(deriveRaw52(serverSeed, roundNo.toString()));

  try {
    return await prisma.crashRound.create({
      data: {
        roundNo,
        serverSeed,
        serverSeedHash: hashSeed(serverSeed),
        crashPointX100,
        phase: CrashPhase.WAITING,
        waitingEndsAt: new Date(Date.now() + CRASH_WAIT_MS),
      },
    });
  } catch {
    // Another worker created this round number first — take theirs.
    const raced = await prisma.crashRound.findUnique({ where: { roundNo } });
    if (raced) return raced;
    throw new Error('failed to create crash round');
  }
}

/** Live multiplier for a running round, from the server clock only. */
export function liveMultiplierX100(
  round: { phase: CrashPhase; startedAt: Date | null; crashPointX100: number },
  now = Date.now(),
): number {
  if (round.phase === CrashPhase.WAITING || !round.startedAt) return X100;
  if (round.phase !== CrashPhase.RUNNING) return round.crashPointX100;

  const m = multiplierAtX100(now - round.startedAt.getTime());
  // Never display past the bust, even if a tick lands late.
  return Math.min(m, round.crashPointX100);
}

/** The instant a running round busts. */
export function bustAtMs(round: { startedAt: Date | null; crashPointX100: number }): number {
  if (!round.startedAt) return Number.POSITIVE_INFINITY;
  return round.startedAt.getTime() + roundDurationMs(round.crashPointX100);
}

// ---------------------------------------------------------------------------
// Betting
// ---------------------------------------------------------------------------

export interface PlaceCrashBetInput {
  userId: bigint;
  stake: bigint;
  autoCashoutX100?: number | null;
  /** Bet panel 1 or 2. */
  slot?: number;
}

export async function placeCrashBet(input: PlaceCrashBetInput) {
  const { userId, stake, autoCashoutX100 } = input;
  const slot = input.slot ?? 1;

  if (slot !== 1 && slot !== 2) throw badRequest('BAD_SLOT', 'Slot must be 1 or 2');

  if (stake < CRASH_MIN_STAKE) throw badRequest('AMOUNT_TOO_SMALL', 'Bet is below the minimum');
  if (stake > CRASH_MAX_STAKE) throw badRequest('AMOUNT_TOO_LARGE', 'Bet is above the maximum');

  if (autoCashoutX100 != null) {
    if (!Number.isInteger(autoCashoutX100) || autoCashoutX100 <= X100) {
      throw badRequest('BAD_AUTO_CASHOUT', 'Auto cash out must be above 1.00x');
    }
    if (autoCashoutX100 > MAX_CRASH_X100) {
      throw badRequest('BAD_AUTO_CASHOUT', 'Auto cash out is too high');
    }
  }

  const round = await currentRound();
  if (round.phase !== CrashPhase.WAITING) {
    throw conflict('BETTING_CLOSED', 'Round already started — wait for the next one');
  }

  return prisma.$transaction(async (tx) => {
    // Re-check inside the transaction: the round may have started between the
    // read above and this write.
    const fresh = await tx.crashRound.findUniqueOrThrow({ where: { id: round.id } });
    if (fresh.phase !== CrashPhase.WAITING || Date.now() >= fresh.waitingEndsAt.getTime()) {
      throw conflict('BETTING_CLOSED', 'Round already started — wait for the next one');
    }

    const already = await tx.crashBet.findUnique({
      where: { roundId_userId_slot: { roundId: fresh.id, userId, slot } },
      select: { id: true },
    });
    if (already) throw conflict('ALREADY_BET', 'That panel already has a bet on this round');

    const bet = await tx.crashBet.create({
      data: {
        userId,
        roundId: fresh.id,
        slot,
        stake,
        autoCashoutX100: autoCashoutX100 ?? null,
        status: BetStatus.PENDING,
      },
    });

    const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
    const houseAccount = await getOrCreateSystemAccount(tx, AccountKind.HOUSE);

    const posted = await postTransaction(tx, {
      type: TransactionType.BET_STAKE,
      idempotencyKey: `crash-stake:${bet.id}`,
      referenceType: 'CRASH_BET',
      referenceId: bet.id,
      memo: `crash round ${fresh.roundNo} slot ${slot}`,
      legs: [
        { accountId: userAccount, amount: -stake },
        { accountId: houseAccount, amount: stake },
      ],
    });

    await tx.crashBet.update({ where: { id: bet.id }, data: { stakeTxId: posted.id } });

    await tx.$executeRaw`UPDATE users SET wagerRequirement = GREATEST(0, CAST(wagerRequirement AS SIGNED) - ${stake}) WHERE id = ${userId}`;

    return {
      bet: { ...bet, stakeTxId: posted.id },
      roundNo: fresh.roundNo,
      balance: posted.balancesAfter.get(userAccount) ?? 0n,
    };
  });
}

// ---------------------------------------------------------------------------
// Cashing out
// ---------------------------------------------------------------------------

/**
 * Cashes a player out at the multiplier the SERVER says is current.
 *
 * `atX100` is optional and used only by the auto-cashout sweeper, which passes
 * the player's exact target so an auto-cashout pays the number the player
 * chose rather than whatever the sweeper tick happened to land on. It is
 * always clamped to the live multiplier, so it can never pay above the curve.
 */
export async function cashOut(userId: bigint, slot = 1, atX100?: number) {
  if (slot !== 1 && slot !== 2) throw badRequest('BAD_SLOT', 'Slot must be 1 or 2');
  const round = await prisma.crashRound.findFirst({
    where: { phase: CrashPhase.RUNNING },
    orderBy: { roundNo: 'desc' },
  });
  if (!round) throw conflict('NOT_RUNNING', 'No round is running');

  const now = Date.now();
  if (now >= bustAtMs(round)) {
    throw conflict('TOO_LATE', 'The round already crashed');
  }

  const live = liveMultiplierX100(round, now);
  const payX100 = Math.min(atX100 ?? live, live);

  if (payX100 <= X100) throw conflict('TOO_EARLY', 'Multiplier has not moved yet');
  if (payX100 >= round.crashPointX100) throw conflict('TOO_LATE', 'The round already crashed');

  return prisma.$transaction(async (tx) => {
    // Claim the bet. updateMany with a status guard means two concurrent
    // cashout requests cannot both succeed.
    const claimed = await tx.crashBet.updateMany({
      where: { roundId: round.id, userId, slot, status: BetStatus.PENDING, cashedOutX100: null },
      data: { cashedOutX100: payX100, status: BetStatus.WON, settledAt: new Date() },
    });
    if (claimed.count === 0) {
      throw conflict('NOTHING_TO_CASH', 'No open bet on that panel');
    }

    const bet = await tx.crashBet.findUniqueOrThrow({
      where: { roundId_userId_slot: { roundId: round.id, userId, slot } },
    });

    const payout = crashPayout(bet.stake, payX100);

    const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
    const houseAccount = await getOrCreateSystemAccount(tx, AccountKind.HOUSE);

    const posted = await postTransaction(tx, {
      type: TransactionType.BET_PAYOUT,
      idempotencyKey: `crash-payout:${bet.id}`,
      referenceType: 'CRASH_BET',
      referenceId: bet.id,
      memo: `crash round ${round.roundNo} slot ${slot} @ ${payX100 / X100}x`,
      legs: [
        { accountId: houseAccount, amount: -payout },
        { accountId: userAccount, amount: payout },
      ],
    });

    await tx.crashBet.update({
      where: { id: bet.id },
      data: { payout, payoutTxId: posted.id },
    });

    return {
      betId: bet.id,
      slot,
      multiplierX100: payX100,
      payout,
      balance: posted.balancesAfter.get(userAccount) ?? 0n,
    };
  });
}

/**
 * Fires auto-cashouts whose target the multiplier has now passed.
 * Called by the loop each tick while a round is running.
 */
export async function sweepAutoCashouts(roundId: bigint, liveX100: number) {
  const due = await prisma.crashBet.findMany({
    where: {
      roundId,
      status: BetStatus.PENDING,
      cashedOutX100: null,
      autoCashoutX100: { not: null, lte: liveX100 },
    },
    select: { userId: true, slot: true, autoCashoutX100: true },
    take: 200,
  });

  const done: Array<{ userId: bigint; multiplierX100: number; payout: bigint }> = [];
  for (const b of due) {
    try {
      const r = await cashOut(b.userId, b.slot, b.autoCashoutX100!);
      done.push({ userId: b.userId, multiplierX100: r.multiplierX100, payout: r.payout });
    } catch {
      // Round busted mid-sweep, or the player cashed manually first. Either
      // way the bet is already resolved — nothing to do.
    }
  }
  return done;
}

/**
 * Marks every bet that never cashed out as lost.
 *
 * Deliberately does NOT move the round to SETTLED. The round has to linger in
 * CRASHED for the hold window so players actually see the bust — `currentRound`
 * ignores SETTLED rounds, so closing it here would make the next round appear
 * instantly and the crash screen would never render.
 *
 * Idempotent: safe to re-run after a process restart.
 */
export async function markLosers(roundId: bigint) {
  const round = await prisma.crashRound.findUnique({ where: { id: roundId } });
  if (!round) throw notFound('Round not found');

  const lost = await prisma.crashBet.updateMany({
    where: { roundId, status: BetStatus.PENDING },
    data: { status: BetStatus.LOST, payout: 0n, settledAt: new Date() },
  });

  return { lost: lost.count };
}

/** Closes the round once the bust has been on screen long enough. */
export async function closeRound(roundId: bigint) {
  await markLosers(roundId);
  await prisma.crashRound.updateMany({
    where: { id: roundId, phase: { not: CrashPhase.SETTLED } },
    data: { phase: CrashPhase.SETTLED, settledAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function recentCrashHistory(take = 24) {
  const rows = await prisma.crashRound.findMany({
    where: { phase: CrashPhase.SETTLED },
    orderBy: { roundNo: 'desc' },
    take,
    select: {
      roundNo: true,
      crashPointX100: true,
      serverSeed: true,
      serverSeedHash: true,
      crashedAt: true,
    },
  });
  return rows;
}

export async function myCrashBets(userId: bigint, take = 30) {
  return prisma.crashBet.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    take,
    include: { round: { select: { roundNo: true, crashPointX100: true } } },
  });
}

/** The caller's bets on the current round — used to restore both panels. */
export async function myBetsOnRound(userId: bigint, roundId: bigint) {
  return prisma.crashBet.findMany({
    where: { roundId, userId },
    orderBy: { slot: 'asc' },
  });
}

/**
 * Everyone's bets on a round, for the live "All Bets" list.
 * Nicknames are masked — a player list should not leak full identities.
 */
export async function roundBets(roundId: bigint, take = 100) {
  const rows = await prisma.crashBet.findMany({
    where: { roundId },
    orderBy: [{ stake: 'desc' }, { id: 'asc' }],
    take,
    include: { user: { select: { nickname: true } } },
  });

  return rows.map((b) => ({
    id: b.id.toString(),
    name: maskName(b.user.nickname),
    stake: b.stake,
    cashedOutX100: b.cashedOutX100,
    payout: b.payout,
    status: b.status,
  }));
}

function maskName(nickname: string): string {
  if (nickname.length <= 2) return `${nickname[0]}***`;
  return `${nickname[0]}***${nickname[nickname.length - 1]}`;
}

export { CRASH_HOLD_MS, MIN_CRASH_X100 };
