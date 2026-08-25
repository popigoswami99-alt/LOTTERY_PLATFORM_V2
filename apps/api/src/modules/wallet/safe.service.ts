import { AccountKind, TransactionType } from '@prisma/client';
import { prisma, type Tx } from '../../db/prisma.js';
import { badRequest, conflict } from '../../lib/errors.js';
import {
  getOrCreateSystemAccount,
  getOrCreateUserAccount,
  postTransaction,
} from '../ledger/ledger.service.js';

/**
 * The Safe — a vault the player can park funds in.
 *
 * Funds in the Safe are NOT stakeable: bets debit USER_CASH only, so anything
 * moved here is out of reach of the games until it is moved back. That is the
 * whole point of the feature.
 *
 * INTEREST IS ACCRUED LAZILY. Rather than a cron sweeping every account, the
 * balance is brought up to date whenever it is read or written. A process that
 * was down for a day simply catches up on the next look, and there is no job
 * to fall behind or double-run.
 */

/** 0.1% per day, in basis points. */
export const SAFE_DAILY_RATE_BPS = 10n;
export const BPS = 10_000n;
const MS_PER_DAY = 86_400_000n;

/** Interest is computed per minute, matching what the UI advertises. */
export const ACCRUAL_INTERVAL_MS = 60_000;

export const SAFE_MIN_TRANSFER = 100n; // ₹1

/**
 * Interest earned on `balance` over `elapsedMs`, floored to whole paise.
 *
 * Kept as one integer expression so a long elapsed time cannot drift, and so
 * sub-paise amounts simply do not accrue rather than rounding up in the
 * player's favour every minute.
 */
export function interestFor(balance: bigint, elapsedMs: bigint): bigint {
  if (balance <= 0n || elapsedMs <= 0n) return 0n;
  return (balance * SAFE_DAILY_RATE_BPS * elapsedMs) / (BPS * MS_PER_DAY);
}

interface SafeAccountRow {
  id: bigint;
  balance: bigint;
  interestAccruedAt: Date | null;
}

async function safeAccount(tx: Tx, userId: bigint): Promise<SafeAccountRow> {
  const id = await getOrCreateUserAccount(tx, userId, AccountKind.USER_SAFE);
  const row = await tx.ledgerAccount.findUniqueOrThrow({
    where: { id },
    select: { id: true, balance: true, interestAccruedAt: true },
  });

  // First touch: start the clock rather than back-paying from account creation.
  if (row.interestAccruedAt === null) {
    await tx.ledgerAccount.update({
      where: { id },
      data: { interestAccruedAt: new Date() },
    });
    return { ...row, interestAccruedAt: new Date() };
  }
  return row;
}

/**
 * Brings a Safe balance up to date, posting any interest earned since the last
 * accrual. Returns the current balance.
 */
export async function accrueInterest(tx: Tx, userId: bigint, now = new Date()): Promise<bigint> {
  const account = await safeAccount(tx, userId);
  const last = account.interestAccruedAt ?? now;
  const elapsed = BigInt(now.getTime() - last.getTime());

  // Only accrue on whole intervals, so the advertised "once every minute" is
  // literally what happens.
  if (elapsed < BigInt(ACCRUAL_INTERVAL_MS)) return account.balance;

  const intervals = elapsed / BigInt(ACCRUAL_INTERVAL_MS);
  const settledMs = intervals * BigInt(ACCRUAL_INTERVAL_MS);
  const interest = interestFor(account.balance, settledMs);

  /*
   * When the interest floors to zero, LEAVE THE CLOCK ALONE so the elapsed
   * window keeps growing until it is worth at least one paise.
   *
   * Advancing it here would silently discard that time — and because a minute
   * of 0.1%/day only reaches one paise at a balance of ~₹14,400, every smaller
   * safe would earn nothing at all, forever, while the UI advertised a rate.
   * Letting the window accumulate means ₹5,000 pays its paise after about
   * three minutes, which is exactly 0.1% a day.
   */
  if (interest <= 0n) return account.balance;

  const accruedAt = new Date(last.getTime() + Number(settledMs));

  const house = await getOrCreateSystemAccount(tx, AccountKind.HOUSE);

  await postTransaction(tx, {
    type: TransactionType.SAFE_INTEREST,
    // One posting per account per accrual instant — a concurrent read cannot
    // pay the same interval twice.
    idempotencyKey: `safe-interest:${account.id}:${accruedAt.getTime()}`,
    referenceType: 'SAFE',
    referenceId: userId,
    memo: `safe interest ${intervals} min`,
    legs: [
      { accountId: house, amount: -interest },
      { accountId: account.id, amount: interest },
    ],
  });

  await tx.ledgerAccount.update({
    where: { id: account.id },
    data: { interestAccruedAt: accruedAt },
  });

  return account.balance + interest;
}

export async function getSafe(userId: bigint) {
  const balance = await prisma.$transaction((tx) => accrueInterest(tx, userId));

  const cashId = await getOrCreateUserAccount(prisma, userId, AccountKind.USER_CASH);
  const cash = await prisma.ledgerAccount.findUniqueOrThrow({
    where: { id: cashId },
    select: { balance: true },
  });

  return {
    safeBalance: balance,
    cashBalance: cash.balance,
    dailyRateBps: Number(SAFE_DAILY_RATE_BPS),
    accrualIntervalMs: ACCRUAL_INTERVAL_MS,
  };
}

/** Moves cash into the Safe. */
export async function depositToSafe(userId: bigint, amount: bigint) {
  if (amount < SAFE_MIN_TRANSFER) throw badRequest('AMOUNT_TOO_SMALL', 'Amount is too small');

  return prisma.$transaction(async (tx) => {
    // Settle interest first so the transfer does not disturb the accrual window.
    await accrueInterest(tx, userId);

    const cash = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
    const safe = await getOrCreateUserAccount(tx, userId, AccountKind.USER_SAFE);

    const posted = await postTransaction(tx, {
      type: TransactionType.SAFE_IN,
      idempotencyKey: `safe-in:${userId}:${Date.now()}`,
      referenceType: 'SAFE',
      referenceId: userId,
      memo: 'transfer to safe',
      legs: [
        { accountId: cash, amount: -amount },
        { accountId: safe, amount },
      ],
    });

    return {
      cashBalance: posted.balancesAfter.get(cash) ?? 0n,
      safeBalance: posted.balancesAfter.get(safe) ?? 0n,
    };
  });
}

/** Moves funds back out of the Safe into spendable cash. */
export async function withdrawFromSafe(userId: bigint, amount: bigint) {
  if (amount < SAFE_MIN_TRANSFER) throw badRequest('AMOUNT_TOO_SMALL', 'Amount is too small');

  return prisma.$transaction(async (tx) => {
    const current = await accrueInterest(tx, userId);
    if (amount > current) throw conflict('INSUFFICIENT_FUNDS', 'Not enough in the safe');

    const cash = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
    const safe = await getOrCreateUserAccount(tx, userId, AccountKind.USER_SAFE);

    const posted = await postTransaction(tx, {
      type: TransactionType.SAFE_OUT,
      idempotencyKey: `safe-out:${userId}:${Date.now()}`,
      referenceType: 'SAFE',
      referenceId: userId,
      memo: 'transfer from safe',
      legs: [
        { accountId: safe, amount: -amount },
        { accountId: cash, amount },
      ],
    });

    return {
      cashBalance: posted.balancesAfter.get(cash) ?? 0n,
      safeBalance: posted.balancesAfter.get(safe) ?? 0n,
    };
  });
}
