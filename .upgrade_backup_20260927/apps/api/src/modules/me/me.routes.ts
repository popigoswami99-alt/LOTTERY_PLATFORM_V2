import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import { getGameHistory, getMoneyHistory, getProfile, getStats } from './me.service.js';
import { depositToSafe, getSafe, withdrawFromSafe } from '../wallet/safe.service.js';

/** Everything the profile page needs. All of it scoped to the caller. */
export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getProfile(req.userId!) });
  }),
);

meRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getStats(req.userId!) });
  }),
);

meRouter.get(
  '/game-history',
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 40), 100);
    res.json({ ok: true, data: await getGameHistory(req.userId!, take) });
  }),
);

meRouter.get(
  '/money-history',
  asyncHandler(async (req, res) => {
    const filter = typeof req.query.filter === 'string' ? req.query.filter : 'all';
    const take = Math.min(Number(req.query.take ?? 50), 100);
    res.json({ ok: true, data: await getMoneyHistory(req.userId!, filter, take) });
  }),
);

// --- Safe ------------------------------------------------------------------

meRouter.get(
  '/safe',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getSafe(req.userId!) });
  }),
);

const amountSchema = z.object({ amount: z.string().regex(/^\d{1,12}$/) });

meRouter.post(
  '/safe/deposit',
  asyncHandler(async (req, res) => {
    const { amount } = amountSchema.parse(req.body);
    res.json({ ok: true, data: await depositToSafe(req.userId!, BigInt(amount)) });
  }),
);

meRouter.post(
  '/safe/withdraw',
  asyncHandler(async (req, res) => {
    const { amount } = amountSchema.parse(req.body);
    res.json({ ok: true, data: await withdrawFromSafe(req.userId!, BigInt(amount)) });
  }),
);
