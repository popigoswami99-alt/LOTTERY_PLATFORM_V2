import { Router } from 'express';
import { asyncHandler } from '../../middleware/error.js';
import { listActive } from './announcement.service.js';

/** Public: the active announcements every player sees. No auth required. */
export const announcementRouter = Router();

announcementRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: await listActive() });
  }),
);
