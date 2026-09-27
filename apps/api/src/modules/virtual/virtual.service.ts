import { AccountKind, TransactionType } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { badRequest } from '../../lib/errors.js';
import {
  getBalance,
  getOrCreateSystemAccount,
  getOrCreateUserAccount,
  postTransaction,
} from '../ledger/ledger.service.js';

const MIN_CREDIT = 100n;          // ₹1 virtual
const MAX_CREDIT = 10_000_000n;   // ₹100,000 virtual per request

export async function grantVirtualCredits(
  userId: bigint,
  amount: bigint,
  reason = 'Virtual test credits',
) {
  if (amount < MIN_CREDIT || amount > MAX_CREDIT) {
    throw badRequest(
      'INVALID_VIRTUAL_CREDIT',
      `Virtual credit must be between ${MIN_CREDIT} and ${MAX_CREDIT} minor units`,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const userAccount = await getOrCreateUserAccount(
      tx,
      userId,
      AccountKind.USER_CASH,
    );

    const house = await getOrCreateSystemAccount(
      tx,
      AccountKind.HOUSE,
    );

    return postTransaction(tx, {
      type: TransactionType.ADJUSTMENT,
      idempotencyKey:
        `virtual-credit:${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      referenceType: 'VIRTUAL_CREDIT',
      memo: reason,
      legs: [
        { accountId: house, amount: -amount },
        { accountId: userAccount, amount },
      ],
    });
  });

  return {
    transactionId: result.id,
    balance: await getBalance(userId),
    virtualOnly: true,
  };
}
