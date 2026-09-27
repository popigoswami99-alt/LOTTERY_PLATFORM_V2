import { AccountKind, AccountOwnerType, TransactionType } from '@prisma/client';
import { prisma, type Tx } from '../../db/prisma.js';
import { AppError, conflict } from '../../lib/errors.js';
import { env } from '../../config/env.js';

/**
 * THE MONEY LAYER.
 *
 * Every rupee that moves in this system moves through postTransaction(). No
 * module updates a balance directly — there is no other write path to
 * ledger_accounts.balance, by design.
 *
 * Three invariants are enforced here and nowhere else:
 *
 *   1. BALANCE. The signed amounts of a transaction's legs sum to exactly
 *      zero. Money is never created or destroyed, only moved between
 *      accounts. Violations throw before anything is written.
 *
 *   2. IDEMPOTENCE. Every transaction carries a caller-supplied key. Posting
 *      the same key twice returns the first transaction instead of applying a
 *      second one. This is what makes a retried payout safe — and retries are
 *      not hypothetical, they happen on every socket reconnect and every
 *      scheduler restart.
 *
 *   3. NO NEGATIVE PLAYER BALANCES. A user account can never be driven below
 *      zero, which is the last line of defence against a double-spend racing
 *      two concurrent bets against the same balance.
 */

export interface PostingLeg {
  accountId: bigint;
  /** Signed minor units. Positive credits the account, negative debits it. */
  amount: bigint;
}

export interface PostTransactionInput {
  type: TransactionType;
  idempotencyKey: string;
  legs: PostingLeg[];
  referenceType?: string;
  referenceId?: bigint;
  memo?: string;
}

export interface PostedTransaction {
  id: bigint;
  idempotencyKey: string;
  /** True when this call found an existing transaction rather than creating one. */
  replayed: boolean;
  balancesAfter: Map<bigint, bigint>;
}

/** System accounts are allowed to run negative; they are the counterparty. */
const NEGATIVE_ALLOWED: ReadonlySet<AccountKind> = new Set([
  AccountKind.HOUSE,
  AccountKind.DEPOSIT_CLEARING,
  AccountKind.WITHDRAW_CLEARING,
]);

export async function postTransaction(
  tx: Tx,
  input: PostTransactionInput,
): Promise<PostedTransaction> {
  const { legs, idempotencyKey } = input;

  if (legs.length < 2) {
    throw new AppError(500, 'LEDGER_MALFORMED', 'A transaction needs at least two legs');
  }

  const sum = legs.reduce((acc, l) => acc + l.amount, 0n);
  if (sum !== 0n) {
    throw new AppError(
      500,
      'LEDGER_UNBALANCED',
      `Transaction legs must sum to zero, got ${sum}`,
    );
  }

  if (legs.some((l) => l.amount === 0n)) {
    throw new AppError(500, 'LEDGER_MALFORMED', 'Zero-amount legs are not allowed');
  }

  // --- Idempotency: has this exact movement already been applied? ----------
  const existing = await tx.ledgerTransaction.findUnique({
    where: { idempotencyKey },
    include: { entries: true },
  });
  if (existing) {
    return {
      id: existing.id,
      idempotencyKey,
      replayed: true,
      balancesAfter: new Map(existing.entries.map((e) => [e.accountId, e.balanceAfter])),
    };
  }

  // --- Merge legs that target the same account ------------------------------
  const merged = new Map<bigint, bigint>();
  for (const leg of legs) {
    merged.set(leg.accountId, (merged.get(leg.accountId) ?? 0n) + leg.amount);
  }

  // Lock every touched account in a stable order. Sorting by id is what stops
  // two concurrent transactions touching the same pair of accounts from
  // deadlocking against each other.
  const accountIds = [...merged.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const locked = await tx.$queryRawUnsafe<
    Array<{ id: bigint; balance: bigint; kind: AccountKind }>
  >(
    `SELECT id, balance, kind FROM ledger_accounts WHERE id IN (${accountIds
      .map(() => '?')
      .join(',')}) ORDER BY id FOR UPDATE`,
    ...accountIds,
  );

  if (locked.length !== accountIds.length) {
    throw new AppError(500, 'LEDGER_ACCOUNT_MISSING', 'One or more accounts do not exist');
  }

  const byId = new Map(locked.map((a) => [a.id.toString(), a]));

  // --- Apply -----------------------------------------------------------------
  const balancesAfter = new Map<bigint, bigint>();
  const entryRows: Array<{ accountId: bigint; amount: bigint; balanceAfter: bigint }> = [];

  for (const accountId of accountIds) {
    const account = byId.get(accountId.toString())!;
    const delta = merged.get(accountId)!;
    const next = account.balance + delta;

    if (next < 0n && !NEGATIVE_ALLOWED.has(account.kind)) {
      throw conflict('INSUFFICIENT_FUNDS', 'Insufficient balance');
    }

    balancesAfter.set(accountId, next);
    entryRows.push({ accountId, amount: delta, balanceAfter: next });
  }

  let created;
  try {
    created = await tx.ledgerTransaction.create({
      data: {
        type: input.type,
        idempotencyKey,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        memo: input.memo,
        entries: { create: entryRows },
      },
    });
  } catch (err: unknown) {
    // Two callers raced on the same idempotency key. The unique index caught
    // it; the loser reads back the winner's transaction.
    if (isUniqueViolation(err)) {
      const winner = await tx.ledgerTransaction.findUnique({
        where: { idempotencyKey },
        include: { entries: true },
      });
      if (winner) {
        return {
          id: winner.id,
          idempotencyKey,
          replayed: true,
          balancesAfter: new Map(winner.entries.map((e) => [e.accountId, e.balanceAfter])),
        };
      }
    }
    throw err;
  }

  for (const [accountId, balance] of balancesAfter) {
    await tx.ledgerAccount.update({ where: { id: accountId }, data: { balance } });
  }

  return { id: created.id, idempotencyKey, replayed: false, balancesAfter };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}

// ---------------------------------------------------------------------------
// Account helpers
// ---------------------------------------------------------------------------

export async function getOrCreateUserAccount(
  tx: Tx,
  userId: bigint,
  kind: AccountKind = AccountKind.USER_CASH,
): Promise<bigint> {
  const existing = await tx.ledgerAccount.findFirst({
    where: {
      ownerType: AccountOwnerType.USER,
      ownerId: userId,
      kind,
      currency: env.CURRENCY,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.ledgerAccount.create({
    data: {
      ownerType: AccountOwnerType.USER,
      ownerId: userId,
      kind,
      currency: env.CURRENCY,
    },
    select: { id: true },
  });
  return created.id;
}

export async function getOrCreateSystemAccount(
  tx: Tx,
  kind: AccountKind,
): Promise<bigint> {
  const existing = await tx.ledgerAccount.findFirst({
    where: {
      ownerType: AccountOwnerType.SYSTEM,
      ownerId: null,
      kind,
      currency: env.CURRENCY,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.ledgerAccount.create({
    data: {
      ownerType: AccountOwnerType.SYSTEM,
      ownerId: null,
      kind,
      currency: env.CURRENCY,
    },
    select: { id: true },
  });
  return created.id;
}

export async function getBalance(userId: bigint): Promise<bigint> {
  const account = await prisma.ledgerAccount.findFirst({
    where: {
      ownerType: AccountOwnerType.USER,
      ownerId: userId,
      kind: AccountKind.USER_CASH,
      currency: env.CURRENCY,
    },
    select: { balance: true },
  });
  return account?.balance ?? 0n;
}

// ---------------------------------------------------------------------------
// Integrity checks
// ---------------------------------------------------------------------------

/**
 * Recomputes an account's balance from its entry history and asserts it
 * matches the cached value. Cheap enough to run in tests after every scenario
 * and as a periodic production job.
 */
export async function verifyAccount(accountId: bigint): Promise<{
  ok: boolean;
  cached: bigint;
  computed: bigint;
}> {
  const account = await prisma.ledgerAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { balance: true },
  });
  const agg = await prisma.ledgerEntry.aggregate({
    where: { accountId },
    _sum: { amount: true },
  });
  const computed = agg._sum.amount ?? 0n;
  return { ok: computed === account.balance, cached: account.balance, computed };
}

/**
 * Global conservation check: across the whole system, every entry ever written
 * must sum to zero. If this is ever non-zero, money was created or destroyed
 * and everything downstream is suspect.
 */
export async function verifyGlobalBalance(): Promise<{ ok: boolean; total: bigint }> {
  const agg = await prisma.ledgerEntry.aggregate({ _sum: { amount: true } });
  const total = agg._sum.amount ?? 0n;
  return { ok: total === 0n, total };
}
