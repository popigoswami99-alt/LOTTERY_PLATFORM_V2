import {
  AccountKind,
  AccountOwnerType,
  BetStatus,
  Prisma,
  Role,
  TransactionType,
  UserStatus,
} from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { badRequest, notFound } from '../../lib/errors.js';
import {
  getOrCreateSystemAccount,
  getOrCreateUserAccount,
  postTransaction,
  verifyGlobalBalance,
} from '../ledger/ledger.service.js';

/**
 * The back-office service. Everything an operator needs to see and do, kept
 * deliberately read-mostly: the only money movement it can cause is a
 * balance ADJUSTMENT, and even that goes through the same double-entry ledger
 * as every other rupee, so global conservation is never broken by an admin.
 */

// ---------------------------------------------------------------------------
// Reporting overview
// ---------------------------------------------------------------------------

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function sumEntries(where: Prisma.LedgerEntryWhereInput): Promise<bigint> {
  const agg = await prisma.ledgerEntry.aggregate({ where, _sum: { amount: true } });
  return agg._sum.amount ?? 0n;
}

export async function getOverview() {
  const today = startOfToday();

  const [
    totalUsers,
    activeUsers,
    frozenUsers,
    bannedUsers,
    newToday,
    betCount,
    betCountToday,
    stakeAgg,
    payoutAgg,
    crashStakeAgg,
    crashPayoutAgg,
    instantStakeAgg,
    instantPayoutAgg,
    depositsTotal,
    withdrawalsOut,
    houseAccount,
    integrity,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
    prisma.user.count({ where: { status: UserStatus.FROZEN } }),
    prisma.user.count({ where: { status: UserStatus.BANNED } }),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.bet.count(),
    prisma.bet.count({ where: { createdAt: { gte: today } } }),
    prisma.bet.aggregate({ _sum: { stake: true } }),
    prisma.bet.aggregate({ where: { status: BetStatus.WON }, _sum: { payout: true } }),
    prisma.crashBet.aggregate({ _sum: { stake: true } }),
    prisma.crashBet.aggregate({ where: { status: BetStatus.WON }, _sum: { payout: true } }),
    prisma.instantBet.aggregate({ _sum: { stake: true } }),
    prisma.instantBet.aggregate({ where: { status: BetStatus.WON }, _sum: { payout: true } }),
    // Deposits: positive legs on user accounts from a DEPOSIT transaction.
    sumEntries({ amount: { gt: 0 }, transaction: { is: { type: TransactionType.DEPOSIT } } }),
    // Withdrawals: negative legs on user accounts from a WITHDRAWAL transaction.
    sumEntries({ amount: { lt: 0 }, transaction: { is: { type: TransactionType.WITHDRAWAL } } }),
    prisma.ledgerAccount.findFirst({
      where: { ownerType: AccountOwnerType.SYSTEM, kind: AccountKind.HOUSE },
      select: { balance: true },
    }),
    verifyGlobalBalance(),
  ]);

  const totalStaked =
    (stakeAgg._sum.stake ?? 0n) +
    (crashStakeAgg._sum.stake ?? 0n) +
    (instantStakeAgg._sum.stake ?? 0n);
  const totalPayout =
    (payoutAgg._sum.payout ?? 0n) +
    (crashPayoutAgg._sum.payout ?? 0n) +
    (instantPayoutAgg._sum.payout ?? 0n);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      frozen: frozenUsers,
      banned: bannedUsers,
      newToday,
    },
    money: {
      deposits: depositsTotal, // paise in
      withdrawals: -withdrawalsOut, // paise out (stored negative → report positive)
      staked: totalStaked,
      payout: totalPayout,
      ggr: totalStaked - totalPayout, // gross gaming revenue (house win)
      houseBalance: houseAccount?.balance ?? 0n,
    },
    activity: {
      totalBets: betCount,
      betsToday: betCountToday,
    },
    integrity, // { ok, total } — total MUST be 0
  };
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

export async function listUsers(query: string, take: number, skip: number) {
  const q = query.trim();
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          ...(/^\d+$/.test(q) ? [{ id: BigInt(q) }] : []),
          { phone: { contains: q } },
          { email: { contains: q } },
          { nickname: { contains: q } },
          { inviteCode: q.toUpperCase() },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { id: 'desc' },
      take,
      skip,
      select: {
        id: true,
        nickname: true,
        phone: true,
        email: true,
        status: true,
        role: true,
        inviteCode: true,
        createdAt: true,
        lastLoginAt: true,
        accounts: {
          where: { kind: AccountKind.USER_CASH, currency: env.CURRENCY },
          select: { balance: true },
        },
        _count: { select: { bets: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    total,
    users: rows.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      phone: u.phone,
      email: u.email,
      status: u.status,
      role: u.role,
      inviteCode: u.inviteCode,
      balance: u.accounts[0]?.balance ?? 0n,
      bets: u._count.bets,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    })),
  };
}

export async function getUserDetail(userId: bigint) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      phone: true,
      email: true,
      status: true,
      role: true,
      inviteCode: true,
      invitedById: true,
      createdAt: true,
      lastLoginAt: true,
      accounts: {
        where: { currency: env.CURRENCY },
        select: { kind: true, balance: true },
      },
      _count: { select: { bets: true, crashBets: true, instantBets: true, referrals: true } },
    },
  });
  if (!user) throw notFound('User not found');

  const [recentBets, recentLedger] = await Promise.all([
    prisma.bet.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      take: 15,
      select: {
        id: true,
        gameCode: true,
        betType: true,
        selection: true,
        stake: true,
        status: true,
        payout: true,
        createdAt: true,
      },
    }),
    prisma.ledgerEntry.findMany({
      where: { account: { ownerId: userId, kind: AccountKind.USER_CASH } },
      orderBy: { id: 'desc' },
      take: 15,
      select: {
        id: true,
        amount: true,
        balanceAfter: true,
        createdAt: true,
        transaction: { select: { type: true, memo: true } },
      },
    }),
  ]);

  const balances = Object.fromEntries(user.accounts.map((a) => [a.kind, a.balance]));

  return {
    user: {
      id: user.id,
      nickname: user.nickname,
      phone: user.phone,
      email: user.email,
      status: user.status,
      role: user.role,
      inviteCode: user.inviteCode,
      invitedById: user.invitedById,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
    balances: {
      cash: balances[AccountKind.USER_CASH] ?? 0n,
      bonus: balances[AccountKind.USER_BONUS] ?? 0n,
      safe: balances[AccountKind.USER_SAFE] ?? 0n,
    },
    counts: {
      bets: user._count.bets,
      crashBets: user._count.crashBets,
      instantBets: user._count.instantBets,
      referrals: user._count.referrals,
    },
    recentBets,
    recentLedger: recentLedger.map((e) => ({
      id: e.id,
      amount: e.amount,
      balanceAfter: e.balanceAfter,
      type: e.transaction.type,
      memo: e.transaction.memo,
      createdAt: e.createdAt,
    })),
  };
}

export async function setUserStatus(userId: bigint, status: UserStatus) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw notFound('User not found');

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status } });
    // Freezing or banning cuts live sessions: burn every unrevoked refresh
    // token so the account cannot silently keep playing on an old one.
    if (status !== UserStatus.ACTIVE) {
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });

  return { id: userId, status };
}

export async function setUserRole(userId: bigint, role: Role) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw notFound('User not found');
  await prisma.user.update({ where: { id: userId }, data: { role } });
  return { id: userId, role };
}

/**
 * Credit (positive) or debit (negative) a player's cash balance. Posted as a
 * double-entry ADJUSTMENT against the HOUSE account, so conservation holds and
 * the movement shows up in the player's own transaction history with the memo.
 * A debit that would push the balance below zero is refused by the ledger.
 */
export async function adjustBalance(
  adminId: bigint,
  userId: bigint,
  amount: bigint,
  memo: string,
) {
  if (amount === 0n) throw badRequest('BAD_AMOUNT', 'Amount cannot be zero');
  if (!memo.trim()) throw badRequest('MEMO_REQUIRED', 'A reason is required');

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw notFound('User not found');

  const result = await prisma.$transaction(async (tx) => {
    const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
    const house = await getOrCreateSystemAccount(tx, AccountKind.HOUSE);

    return postTransaction(tx, {
      type: TransactionType.ADJUSTMENT,
      idempotencyKey: `admin-adjust:${adminId}:${userId}:${Date.now()}`,
      referenceType: 'ADMIN_ADJUST',
      referenceId: adminId,
      memo: memo.trim().slice(0, 255),
      legs: [
        { accountId: house, amount: -amount },
        { accountId: userAccount, amount },
      ],
    });
  });

  const balance = await prisma.ledgerAccount.findFirstOrThrow({
    where: { ownerId: userId, kind: AccountKind.USER_CASH, currency: env.CURRENCY },
    select: { balance: true },
  });

  return { transactionId: result.id, balance: balance.balance };
}
