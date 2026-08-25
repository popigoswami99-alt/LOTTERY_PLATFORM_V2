import { AccountKind, BetStatus, PeriodStatus, TransactionType } from '@prisma/client';
import { InvalidBetError } from '@lp/shared';
import { prisma } from '../../db/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import {
  getOrCreateSystemAccount,
  getOrCreateUserAccount,
  postTransaction,
} from '../ledger/ledger.service.js';
import { currentPeriod, roomOrThrow, rulesOrThrow } from './period.service.js';

/** Stake limits, in minor units. 1 INR = 100. */
export const MIN_UNIT_AMOUNT = 100n; // ₹1
export const MAX_STAKE = 10_000_000n; // ₹100,000 per bet
export const MAX_MULTIPLIER = 1000;

export interface PlaceBetInput {
  userId: bigint;
  roomKey: string;
  betType: string;
  selection: string;
  unitAmount: bigint;
  multiplier: number;
}

/**
 * Places a bet: validates it against the owning game's rules, debits the stake
 * through the ledger, and records it — all in one DB transaction, so a bet can
 * never exist without its debit and a debit can never exist without its bet.
 */
export async function placeBet(input: PlaceBetInput) {
  const { userId, roomKey, betType, selection, unitAmount, multiplier } = input;

  const room = roomOrThrow(roomKey);
  const rules = rulesOrThrow(roomKey);

  try {
    rules.validateSelection(betType, selection);
  } catch (err) {
    if (err instanceof InvalidBetError) throw badRequest('BAD_SELECTION', err.message);
    throw err;
  }

  if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > MAX_MULTIPLIER) {
    throw badRequest('BAD_MULTIPLIER', `Quantity must be between 1 and ${MAX_MULTIPLIER}`);
  }
  if (unitAmount < MIN_UNIT_AMOUNT) {
    throw badRequest('AMOUNT_TOO_SMALL', 'Bet amount is below the minimum');
  }

  const stake = unitAmount * BigInt(multiplier);
  if (stake > MAX_STAKE) throw badRequest('AMOUNT_TOO_LARGE', 'Bet amount is above the maximum');

  const { period, isLocked } = await currentPeriod(roomKey);
  if (isLocked || period.status !== PeriodStatus.OPEN) {
    throw conflict('BETTING_CLOSED', 'Betting is closed for this period');
  }

  const odds = rules.displayOdds(betType, selection);

  return prisma.$transaction(async (tx) => {
    // Re-check inside the transaction: the period may have locked between the
    // read above and this write.
    const fresh = await tx.gamePeriod.findUniqueOrThrow({ where: { id: period.id } });
    if (fresh.status !== PeriodStatus.OPEN || Date.now() >= fresh.lockAt.getTime()) {
      throw conflict('BETTING_CLOSED', 'Betting is closed for this period');
    }

    const bet = await tx.bet.create({
      data: {
        userId,
        periodId: period.id,
        gameCode: room.gameCode,
        betType,
        selection,
        unitAmount,
        multiplier,
        stake,
        oddsNum: odds.num,
        oddsDen: odds.den,
        status: BetStatus.PENDING,
      },
    });

    const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
    const houseAccount = await getOrCreateSystemAccount(tx, AccountKind.HOUSE);

    // Stake leaves the player and lands with the house. Throws
    // INSUFFICIENT_FUNDS (rolling back the bet row) if the balance is short.
    const posted = await postTransaction(tx, {
      type: TransactionType.BET_STAKE,
      idempotencyKey: `bet-stake:${bet.id}`,
      referenceType: 'BET',
      referenceId: bet.id,
      memo: `${roomKey} ${fresh.periodNo} ${betType}:${selection}`,
      legs: [
        { accountId: userAccount, amount: -stake },
        { accountId: houseAccount, amount: stake },
      ],
    });

    await tx.bet.update({ where: { id: bet.id }, data: { stakeTxId: posted.id } });

    return {
      bet: { ...bet, stakeTxId: posted.id },
      periodNo: fresh.periodNo,
      balance: posted.balancesAfter.get(userAccount) ?? 0n,
    };
  });
}

/**
 * Pays out every pending bet on a drawn period, using the owning game's rules.
 *
 * Each bet settles in its own transaction with an idempotency key derived from
 * its id, so this is safe to re-run after a crash: already-paid bets are
 * skipped, unpaid ones complete.
 */
export async function settlePeriod(periodId: bigint): Promise<{
  settled: number;
  totalPayout: bigint;
  winners: bigint[];
}> {
  const period = await prisma.gamePeriod.findUnique({ where: { id: periodId } });
  if (!period) throw notFound('Period not found');
  if (period.resultData === null) {
    throw conflict('NOT_DRAWN', 'Period has not been drawn yet');
  }

  const rules = rulesOrThrow(period.roomKey);
  const result = period.resultData;

  let settled = 0;
  let totalPayout = 0n;
  const winners = new Set<string>();

  // Work in batches so a busy period does not hold one giant transaction open.
  for (;;) {
    const batch = await prisma.bet.findMany({
      where: { periodId, status: BetStatus.PENDING },
      orderBy: { id: 'asc' },
      take: 200,
    });
    if (batch.length === 0) break;

    for (const bet of batch) {
      const outcome = rules.resolve(
        { betType: bet.betType, selection: bet.selection, stake: bet.stake },
        result,
      );

      await prisma.$transaction(async (tx) => {
        // Guard against a concurrent settler having taken this bet already.
        const claimed = await tx.bet.updateMany({
          where: { id: bet.id, status: BetStatus.PENDING },
          data: {
            status: outcome.won ? BetStatus.WON : BetStatus.LOST,
            payout: outcome.payout,
            oddsNum: outcome.won ? outcome.odds.num : bet.oddsNum,
            oddsDen: outcome.won ? outcome.odds.den : bet.oddsDen,
            settledAt: new Date(),
          },
        });
        if (claimed.count === 0) return;

        if (outcome.won && outcome.payout > 0n) {
          const userAccount = await getOrCreateUserAccount(tx, bet.userId, AccountKind.USER_CASH);
          const houseAccount = await getOrCreateSystemAccount(tx, AccountKind.HOUSE);

          const posted = await postTransaction(tx, {
            type: TransactionType.BET_PAYOUT,
            idempotencyKey: `bet-payout:${bet.id}`,
            referenceType: 'BET',
            referenceId: bet.id,
            memo: `win ${period.roomKey} ${period.periodNo}`,
            legs: [
              { accountId: houseAccount, amount: -outcome.payout },
              { accountId: userAccount, amount: outcome.payout },
            ],
          });

          await tx.bet.update({ where: { id: bet.id }, data: { payoutTxId: posted.id } });
        }
      });

      settled += 1;
      if (outcome.won) {
        totalPayout += outcome.payout;
        winners.add(bet.userId.toString());
      }
    }
  }

  await prisma.gamePeriod.updateMany({
    where: { id: periodId, status: { not: PeriodStatus.SETTLED } },
    data: { status: PeriodStatus.SETTLED, settledAt: new Date() },
  });

  return { settled, totalPayout, winners: [...winners].map((id) => BigInt(id)) };
}

/** A player's bet history, newest first. */
export async function listMyBets(userId: bigint, roomKey?: string, take = 30) {
  return prisma.bet.findMany({
    where: { userId, ...(roomKey ? { period: { roomKey } } : {}) },
    orderBy: { id: 'desc' },
    take,
    include: {
      period: {
        select: { periodNo: true, roomKey: true, resultNumber: true, resultData: true },
      },
    },
  });
}
