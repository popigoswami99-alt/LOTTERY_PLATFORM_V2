import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import { createTicket, listMyTickets } from './support.service.js';

export const supportRouter = Router();

supportRouter.use(requireAuth);

supportRouter.get(
  '/tickets',
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 20), 50);
    res.json({ ok: true, data: await listMyTickets(req.userId!, take) });
  }),
);

supportRouter.post(
  '/tickets',
  asyncHandler(async (req, res) => {
    const { subject, message } = z
      .object({ subject: z.string().min(3).max(120), message: z.string().min(5).max(4000) })
      .parse(req.body);
    res.status(201).json({ ok: true, data: await createTicket(req.userId!, subject, message) });
  }),
);
