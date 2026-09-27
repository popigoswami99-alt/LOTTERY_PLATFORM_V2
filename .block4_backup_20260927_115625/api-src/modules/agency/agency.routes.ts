import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  MAX_LEVEL,
  getAgencyOverview,
  getCommissionHistory,
  getRebateTable,
  getSubordinates,
} from './agency.service.js';

export const agencyRouter = Router();

agencyRouter.use(requireAuth);

agencyRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getAgencyOverview(req.userId!) });
  }),
);

agencyRouter.get(
  '/subordinates',
  asyncHandler(async (req, res) => {
    const level = Math.min(Math.max(Number(req.query.level ?? 1), 1), MAX_LEVEL);
    const take = Math.min(Number(req.query.take ?? 50), 100);
    res.json({ ok: true, data: await getSubordinates(req.userId!, level, take) });
  }),
);

agencyRouter.get(
  '/commissions',
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 30), 100);
    res.json({ ok: true, data: await getCommissionHistory(req.userId!, take) });
  }),
);

agencyRouter.get('/rebate-table', (_req, res) => {
  res.json({ ok: true, data: getRebateTable() });
});
