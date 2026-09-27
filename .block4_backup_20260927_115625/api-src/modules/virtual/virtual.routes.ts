import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import { getBalance } from '../ledger/ledger.service.js';
import { grantVirtualCredits } from './virtual.service.js';

export const virtualRouter = Router();

/**
 * Development/test-credit endpoint.
 * It never connects to a PSP and never represents real currency.
 */
virtualRouter.post(
  '/credits',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z.object({
      amount: z.string().regex(/^\d{1,12}$/),
      reason: z.string().min(1).max(100).optional(),
    }).parse(req.body);

    const result = await grantVirtualCredits(
      req.userId!,
      BigInt(body.amount),
      body.reason ?? 'Virtual test credits',
    );

    res.status(201).json({
      ok: true,
      data: result,
      notice: 'Virtual/test credits only. No real-money value.',
    });
  }),
);

virtualRouter.get(
  '/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      ok: true,
      data: {
        mode: 'VIRTUAL_ONLY',
        realMoneyEnabled: false,
        depositsEnabled: false,
        withdrawalsEnabled: false,
        balance: await getBalance(req.userId!),
      },
    });
  }),
);
