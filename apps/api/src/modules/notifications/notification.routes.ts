import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import { listNotifications, markRead, unreadCount } from './notification.service.js';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 30), 100);
    res.json({
      ok: true,
      data: {
        unread: await unreadCount(req.userId!),
        items: await listNotifications(req.userId!, take),
      },
    });
  }),
);

notificationRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: { unread: await unreadCount(req.userId!) } });
  }),
);

notificationRouter.post(
  '/read',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().regex(/^\d+$/).optional() }).parse(req.body ?? {});
    res.json({ ok: true, data: await markRead(req.userId!, id ? BigInt(id) : undefined) });
  }),
);
