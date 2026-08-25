import { Router } from 'express';
import { z } from 'zod';
import { AccountKind, TransactionType } from '@prisma/client';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { badRequest } from '../../lib/errors.js';
import {
  getBalance,
  getOrCreateSystemAccount,
  getOrCreateUserAccount,
  postTransaction,
  verifyGlobalBalance,
} from '../ledger/ledger.service.js';
import { emitToUser } from '../../realtime/io.js';
import { SOCKET_EVENTS } from '@lp/shared';

export const walletRouter = Router();

walletRouter.get(
  '/balance',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: { balance: await getBalance(req.userId!) } });
  }),
);

walletRouter.get(
  '/transactions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 30), 100);
    const accountId = await getOrCreateUserAccount(prisma, req.userId!, AccountKind.USER_CASH);

    const entries = await prisma.ledgerEntry.findMany({
      where: { accountId },
      orderBy: { id: 'desc' },
      take,
      include: {
        transaction: {
          select: { type: true, memo: true, referenceType: true, referenceId: true },
        },
      },
    });

    res.json({
      ok: true,
      data: entries.map((e) => ({
        id: e.id,
        amount: e.amount,
        balanceAfter: e.balanceAfter,
        type: e.transaction.type,
        memo: e.transaction.memo,
        createdAt: e.createdAt,
      })),
    });
  }),
);

/**
 * DEVELOPMENT ONLY — credits the caller's wallet so the game loop can be
 * exercised without a payment gateway. This is the stand-in for the real
 * deposit flow and is hard-disabled outside development.
 */
walletRouter.post(
  '/dev/credit',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (env.NODE_ENV === 'production') {
      throw badRequest('DISABLED', 'Not available');
    }

    const { amount } = z
      .object({ amount: z.string().regex(/^\d{1,12}$/) })
      .parse(req.body);
    const minor = BigInt(amount);

    const result = await prisma.$transaction(async (tx) => {
      const userAccount = await getOrCreateUserAccount(tx, req.userId!, AccountKind.USER_CASH);
      const clearing = await getOrCreateSystemAccount(tx, AccountKind.DEPOSIT_CLEARING);

      return postTransaction(tx, {
        type: TransactionType.DEPOSIT,
        idempotencyKey: `dev-credit:${req.userId}:${Date.now()}`,
        referenceType: 'DEV_CREDIT',
        memo: 'Development credit',
        legs: [
          { accountId: clearing, amount: -minor },
          { accountId: userAccount, amount: minor },
        ],
      });
    });

    const balance = await getBalance(req.userId!);
    emitToUser(req.userId!, SOCKET_EVENTS.BALANCE, { balance: balance.toString() });

    res.json({ ok: true, data: { transactionId: result.id, balance } });
  }),
);

/** Ledger integrity probe — every entry ever written must net to zero. */
walletRouter.get(
  '/integrity',
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: await verifyGlobalBalance() });
  }),
);
