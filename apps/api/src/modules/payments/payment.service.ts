import { randomInt } from 'node:crypto';
import {
  AccountKind,
  NotificationKind,
  PaymentChannel,
  TransactionType,
  WithdrawalStatus,
  type DepositOrder,
  type WithdrawalRequest,
} from '@prisma/client';
import { SOCKET_EVENTS, formatMinor } from '@lp/shared';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { emitToUser } from '../../realtime/io.js';
import { notify } from '../notifications/notification.service.js';
import {
  getBalance,
  getOrCreateSystemAccount,
  getOrCreateUserAccount,
  postTransaction,
} from '../ledger/ledger.service.js';
import { getProvider, isSandbox } from './providers/index.js';

/**
 * Payments orchestration for JazzCash / Easypaisa mobile-wallet deposits and
 * withdrawals.
 *
 * DEPOSIT is a direct-debit: the provider is asked to debit the customer's
 * wallet, the customer approves on their phone with an MPIN (simulated in-app
 * in sandbox), and on success the wallet is credited with the deposit PLUS a
 * configurable bonus. Both land in the cash account, so they are immediately
 * usable to bet.
 *
 * WITHDRAWAL holds the funds in withdraw-clearing the instant it is requested,
 * so a pending payout can never be double-spent, and an operator approves or
 * rejects it from the back-office. A reject refunds the hold.
 *
 * Every rupee moves through the double-entry ledger, so global conservation
 * (wallet/integrity == 0) holds across the whole flow.
 */

export function paymentConfig() {
  return {
    mode: env.PAYMENTS_MODE,
    channels: [PaymentChannel.JAZZCASH, PaymentChannel.EASYPAISA],
    minDeposit: env.MIN_DEPOSIT_MINOR,
    minWithdraw: env.MIN_WITHDRAW_MINOR,
    bonusBps: env.DEPOSIT_BONUS_BPS,
  };
}

// ---------------------------------------------------------------------------
// Deposit
// ---------------------------------------------------------------------------

function newRef(prefix: string): string {
  return `${prefix}${Date.now()}${randomInt(1000, 9999)}`;
}

export async function createDeposit(
  userId: bigint,
  channel: PaymentChannel,
  amountMinor: bigint,
  accountNumber: string,
  cnicLast6?: string,
): Promise<DepositOrder> {
  if (amountMinor < env.MIN_DEPOSIT_MINOR) {
    throw badRequest('MIN_DEPOSIT', `Minimum deposit is ${env.MIN_DEPOSIT_MINOR / 100n}`);
  }
  if (channel === PaymentChannel.JAZZCASH && !cnicLast6) {
    throw badRequest('CNIC_REQUIRED', 'JazzCash requires the last 6 digits of your CNIC');
  }

  // Bonus is fixed at order creation so what the player is promised is what they
  // are paid, regardless of later config changes.
  const bonus = (amountMinor * BigInt(env.DEPOSIT_BONUS_BPS)) / 10000n;
  const txnRef = newRef('DEP');

  const order = await prisma.depositOrder.create({
    data: {
      userId,
      channel,
      amount: amountMinor,
      bonus,
      accountNumber,
      cnicLast6: cnicLast6 ?? null,
      txnRef,
      status: 'PENDING',
    },
  });

  const provider = getProvider(channel);
  try {
    const result = await provider.initiateDeposit({
      txnRef,
      amountMinor,
      accountNumber,
      cnicLast6: cnicLast6 ?? undefined,
      description: `Wallet deposit ${txnRef}`,
    });

    await prisma.depositOrder.update({
      where: { id: order.id },
      data: {
        status: result.ok ? 'AWAITING_APPROVAL' : 'FAILED',
        providerRef: result.providerRef ?? null,
        providerCode: result.code ?? null,
        providerMsg: result.message.slice(0, 255),
      },
    });

    // Some providers settle synchronously — credit immediately in that case.
    if (result.settled) await creditDeposit(order.id);
  } catch (err) {
    await prisma.depositOrder.update({
      where: { id: order.id },
      data: { status: 'FAILED', providerMsg: (err as Error).message.slice(0, 255) },
    });
    throw err;
  }

  return prisma.depositOrder.findUniqueOrThrow({ where: { id: order.id } });
}

/**
 * Simulates the customer approving the debit with their MPIN. Sandbox only — in
 * live mode the MPIN is entered on the customer's own handset and the result
 * arrives via the provider callback, never through this endpoint.
 */
export async function confirmDepositMpin(
  userId: bigint,
  orderId: bigint,
  mpin: string,
): Promise<DepositOrder> {
  if (!isSandbox()) {
    throw badRequest(
      'NOT_SANDBOX',
      'In live mode the MPIN is entered on your wallet app, not here.',
    );
  }
  const order = await prisma.depositOrder.findFirst({ where: { id: orderId, userId } });
  if (!order) throw notFound('Deposit not found');
  if (order.status === 'SUCCESS') return order;
  if (order.status !== 'AWAITING_APPROVAL') {
    throw badRequest('BAD_STATE', `This deposit is ${order.status.toLowerCase()}.`);
  }
  // '0000' models the customer declining on their phone.
  if (mpin === '0000') {
    return prisma.depositOrder.update({
      where: { id: order.id },
      data: { status: 'FAILED', providerMsg: 'Customer declined on wallet' },
    });
  }
  if (!/^\d{4,6}$/.test(mpin)) throw badRequest('BAD_MPIN', 'Enter your 4–6 digit MPIN');

  await creditDeposit(order.id);
  return prisma.depositOrder.findUniqueOrThrow({ where: { id: order.id } });
}

/**
 * Idempotently credits a settled deposit: the amount as a DEPOSIT and the bonus
 * as a BONUS_GRANT. Safe to call from both the MPIN confirm and a provider
 * callback — the ledger idempotency keys make sure the wallet is credited once.
 */
async function creditDeposit(orderId: bigint): Promise<void> {
  let userId: bigint | null = null;
  let credited: { amount: bigint; bonus: bigint; channel: PaymentChannel } | null = null;

  await prisma.$transaction(async (tx) => {
    const order = await tx.depositOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status === 'SUCCESS') return;
    userId = order.userId;
    credited = { amount: order.amount, bonus: order.bonus, channel: order.channel };

    const userAccount = await getOrCreateUserAccount(tx, order.userId, AccountKind.USER_CASH);
    const clearing = await getOrCreateSystemAccount(tx, AccountKind.DEPOSIT_CLEARING);

    const deposit = await postTransaction(tx, {
      type: TransactionType.DEPOSIT,
      idempotencyKey: `deposit-credit:${order.id}`,
      referenceType: 'DEPOSIT_ORDER',
      referenceId: order.id,
      memo: `${order.channel} deposit`,
      legs: [
        { accountId: clearing, amount: -order.amount },
        { accountId: userAccount, amount: order.amount },
      ],
    });

    if (order.bonus > 0n) {
      const house = await getOrCreateSystemAccount(tx, AccountKind.HOUSE);
      await postTransaction(tx, {
        type: TransactionType.BONUS_GRANT,
        idempotencyKey: `deposit-bonus:${order.id}`,
        referenceType: 'DEPOSIT_ORDER',
        referenceId: order.id,
        memo: `${order.channel} deposit bonus`,
        legs: [
          { accountId: house, amount: -order.bonus },
          { accountId: userAccount, amount: order.bonus },
        ],
      });
    }

    await tx.user.update({
      where: { id: order.userId },
      data: { wagerRequirement: { increment: 3n * (order.amount + order.bonus) } }
    });

    await tx.depositOrder.update({
      where: { id: order.id },
      data: { status: 'SUCCESS', txId: deposit.id, completedAt: new Date() },
    });
  });

  if (userId !== null) {
    const balance = await getBalance(userId);
    emitToUser(userId, SOCKET_EVENTS.BALANCE, { balance: balance.toString() });

    if (credited) {
      const c = credited as { amount: bigint; bonus: bigint; channel: PaymentChannel };
      const bonusNote = c.bonus > 0n ? ` + ₹${formatMinor(c.bonus)} bonus` : '';
      await notify(
        userId,
        NotificationKind.DEPOSIT,
        'Deposit successful',
        `₹${formatMinor(c.amount)}${bonusNote} added to your wallet via ${c.channel}.`,
      ).catch(() => {});
    }
  }
}

/** Provider webhook entry (live mode). Verifies the ref and credits/fails. */
export async function handleDepositCallback(
  channel: PaymentChannel,
  txnRef: string,
  success: boolean,
  providerRef?: string,
): Promise<void> {
  const order = await prisma.depositOrder.findFirst({ where: { txnRef, channel } });
  if (!order) throw notFound('Unknown deposit reference');
  if (success) {
    if (providerRef) {
      await prisma.depositOrder.update({ where: { id: order.id }, data: { providerRef } });
    }
    await creditDeposit(order.id);
  } else if (order.status !== 'SUCCESS') {
    await prisma.depositOrder.update({
      where: { id: order.id },
      data: { status: 'FAILED', providerMsg: 'Declined by provider' },
    });
  }
}

export async function getDeposit(userId: bigint, orderId: bigint): Promise<DepositOrder> {
  const order = await prisma.depositOrder.findFirst({ where: { id: orderId, userId } });
  if (!order) throw notFound('Deposit not found');
  return order;
}

export async function listDeposits(userId: bigint, take: number): Promise<DepositOrder[]> {
  return prisma.depositOrder.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    take,
  });
}

// ---------------------------------------------------------------------------
// Withdrawal
// ---------------------------------------------------------------------------

export async function requestWithdrawal(
  userId: bigint,
  channel: PaymentChannel,
  amountMinor: bigint,
  accountNumber: string,
  accountName: string,
): Promise<WithdrawalRequest> {
  if (amountMinor < env.MIN_WITHDRAW_MINOR) {
    throw badRequest('MIN_WITHDRAW', `Minimum withdrawal is ${env.MIN_WITHDRAW_MINOR / 100n}`);
  }

  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (u && u.wagerRequirement > 0n) {
    throw badRequest('WAGER_REQUIRED', `You must wager ₹${formatMinor(u.wagerRequirement)} more before withdrawing.`);
  }

  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.withdrawalRequest.create({
      data: { userId, channel, amount: amountMinor, accountNumber, accountName, status: 'PENDING' },
    });

    const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
    const clearing = await getOrCreateSystemAccount(tx, AccountKind.WITHDRAW_CLEARING);

    // Hold: cash → withdraw-clearing. If the player lacks the funds the ledger
    // throws INSUFFICIENT_FUNDS and the whole transaction (incl. the row above)
    // rolls back, so no orphan request is left behind.
    const hold = await postTransaction(tx, {
      type: TransactionType.WITHDRAWAL,
      idempotencyKey: `withdraw-hold:${created.id}`,
      referenceType: 'WITHDRAWAL',
      referenceId: created.id,
      memo: `${channel} withdrawal request`,
      legs: [
        { accountId: userAccount, amount: -amountMinor },
        { accountId: clearing, amount: amountMinor },
      ],
    });

    return tx.withdrawalRequest.update({
      where: { id: created.id },
      data: { holdTxId: hold.id },
    });
  });

  const balance = await getBalance(userId);
  emitToUser(userId, SOCKET_EVENTS.BALANCE, { balance: balance.toString() });
  return request;
}

export async function listWithdrawals(userId: bigint, take: number): Promise<WithdrawalRequest[]> {
  return prisma.withdrawalRequest.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    take,
  });
}

/** Refund a held withdrawal back to the player's cash (reject / failure path). */
async function refundWithdrawal(
  request: WithdrawalRequest,
  status: WithdrawalStatus,
  note: string | undefined,
  adminId?: bigint,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.withdrawalRequest.findUnique({ where: { id: request.id } });
    if (!fresh || fresh.refundTxId) return; // already refunded

    const userAccount = await getOrCreateUserAccount(tx, request.userId, AccountKind.USER_CASH);
    const clearing = await getOrCreateSystemAccount(tx, AccountKind.WITHDRAW_CLEARING);

    const refund = await postTransaction(tx, {
      type: TransactionType.WITHDRAWAL,
      idempotencyKey: `withdraw-refund:${request.id}`,
      referenceType: 'WITHDRAWAL',
      referenceId: request.id,
      memo: `${request.channel} withdrawal ${status.toLowerCase()} — refund`,
      legs: [
        { accountId: clearing, amount: -request.amount },
        { accountId: userAccount, amount: request.amount },
      ],
    });

    await tx.withdrawalRequest.update({
      where: { id: request.id },
      data: {
        status,
        refundTxId: refund.id,
        reviewNote: note?.slice(0, 255) ?? fresh.reviewNote,
        reviewedById: adminId ?? fresh.reviewedById,
        reviewedAt: new Date(),
      },
    });
  });

  const balance = await getBalance(request.userId);
  emitToUser(request.userId, SOCKET_EVENTS.BALANCE, { balance: balance.toString() });

  const reason = note ? ` Reason: ${note}` : '';
  await notify(
    request.userId,
    NotificationKind.WITHDRAWAL,
    status === 'REJECTED' ? 'Withdrawal rejected' : 'Withdrawal failed',
    `Your ₹${formatMinor(request.amount)} withdrawal was ${status.toLowerCase()} and refunded to your wallet.${reason}`,
  ).catch(() => {});
}

// --- admin actions ---------------------------------------------------------

export async function listWithdrawalsAdmin(status: WithdrawalStatus | undefined, take: number) {
  const rows = await prisma.withdrawalRequest.findMany({
    where: status ? { status } : {},
    orderBy: { id: 'desc' },
    take,
    include: { user: { select: { nickname: true, phone: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    nickname: r.user.nickname,
    phone: r.user.phone,
    channel: r.channel,
    amount: r.amount,
    accountNumber: r.accountNumber,
    accountName: r.accountName,
    status: r.status,
    reviewNote: r.reviewNote,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    paidAt: r.paidAt,
  }));
}

export async function approveWithdrawal(adminId: bigint, id: bigint): Promise<WithdrawalRequest> {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!request) throw notFound('Withdrawal not found');
  if (request.status !== 'PENDING') {
    throw badRequest('BAD_STATE', `This withdrawal is already ${request.status.toLowerCase()}.`);
  }

  await prisma.withdrawalRequest.update({
    where: { id },
    data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: new Date() },
  });

  const provider = getProvider(request.channel);
  try {
    const result = await provider.disburse({
      txnRef: `WD${request.id}`,
      amountMinor: request.amount,
      accountNumber: request.accountNumber,
      accountName: request.accountName,
    });
    if (!result.ok && !result.settled) throw new AppError(502, 'PAYOUT_FAILED', result.message);

    const paid = await prisma.withdrawalRequest.update({
      where: { id },
      data: { status: 'PAID', providerRef: result.providerRef ?? null, paidAt: new Date() },
    });
    await notify(
      request.userId,
      NotificationKind.WITHDRAWAL,
      'Withdrawal paid',
      `₹${formatMinor(request.amount)} was sent to your ${request.channel} account ${request.accountNumber}.`,
    ).catch(() => {});
    return paid;
  } catch (err) {
    // Disbursement failed — return the held funds to the player and surface it.
    await refundWithdrawal(request, 'FAILED', (err as Error).message, adminId);
    throw err;
  }
}

export async function rejectWithdrawal(
  adminId: bigint,
  id: bigint,
  note: string,
): Promise<WithdrawalRequest> {
  const request = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!request) throw notFound('Withdrawal not found');
  if (request.status !== 'PENDING') {
    throw badRequest('BAD_STATE', `This withdrawal is already ${request.status.toLowerCase()}.`);
  }
  await refundWithdrawal(request, 'REJECTED', note, adminId);
  return prisma.withdrawalRequest.findUniqueOrThrow({ where: { id } });
}
