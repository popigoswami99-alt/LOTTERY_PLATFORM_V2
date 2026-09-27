import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  claimCheckin,
  claimFirstDeposit,
  claimVip,
  getActivityOverview,
  getBonusHistory,
  getCheckinState,
  getFirstDepositState,
  getVipState,
  getWheelState,
  redeemGiftCode,
  spinWheel,
  getPromotionState,
  claimPromotionBox,
} from './activity.service.js';

export const activityRouter = Router();

activityRouter.use(requireAuth);

activityRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getActivityOverview(req.userId!) });
  }),
);

activityRouter.get(
  '/bonus-history',
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 50), 100);
    res.json({ ok: true, data: await getBonusHistory(req.userId!, take) });
  }),
);

// --- Daily check-in --------------------------------------------------------

activityRouter.get(
  '/checkin',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getCheckinState(req.userId!) });
  }),
);

activityRouter.post(
  '/checkin',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await claimCheckin(req.userId!) });
  }),
);

// --- Gift codes ------------------------------------------------------------

activityRouter.post(
  '/gift',
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(3).max(32) }).parse(req.body);
    res.json({ ok: true, data: await redeemGiftCode(req.userId!, code) });
  }),
);

// --- First deposit (single reward, sized by the highest bracket reached) ---

activityRouter.get(
  '/first-deposit',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getFirstDepositState(req.userId!) });
  }),
);

activityRouter.post(
  '/first-deposit',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await claimFirstDeposit(req.userId!) });
  }),
);

// --- VIP -------------------------------------------------------------------

activityRouter.get(
  '/vip',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getVipState(req.userId!) });
  }),
);

activityRouter.post(
  '/vip/claim',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await claimVip(req.userId!) });
  }),
);

// --- Invite wheel ----------------------------------------------------------

activityRouter.get(
  '/wheel',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getWheelState(req.userId!) });
  }),
);

activityRouter.post(
  '/wheel/spin',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await spinWheel(req.userId!) });
  }),
);

// --- Promotions ------------------------------------------------------------

activityRouter.get(
  '/promotions',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getPromotionState(req.userId!) });
  }),
);

activityRouter.post(
  '/promotions/claim',
  asyncHandler(async (req, res) => {
    const { level, boxGroup } = z.object({ level: z.number().int(), boxGroup: z.number().int() }).parse(req.body);
    res.json({ ok: true, data: await claimPromotionBox(req.userId!, level, boxGroup) });
  }),
);
