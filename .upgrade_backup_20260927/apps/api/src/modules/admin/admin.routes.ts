import { Router } from 'express';
import { z } from 'zod';
import { Role, TicketStatus, UserStatus, WithdrawalStatus } from '@prisma/client';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { badRequest } from '../../lib/errors.js';
import {
  adjustBalance,
  getOverview,
  getUserDetail,
  listUsers,
  setUserRole,
  setUserStatus,
} from './admin.service.js';
import {
  approveWithdrawal,
  listWithdrawalsAdmin,
  rejectWithdrawal,
} from '../payments/payment.service.js';
import { closeTicket, listTicketsAdmin, replyTicket } from '../support/support.service.js';
import {
  createGiftCodeAdmin,
  listGiftCodesAdmin,
  setGiftCodeActive,
} from '../activity/activity.service.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAll as listAnnouncements,
  updateAnnouncement,
} from '../announcements/announcement.service.js';

/**
 * Back-office. Every route requires an authenticated ADMIN. The guard checks
 * the role in the database on each call, so access can be revoked immediately.
 */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: await getOverview() });
  }),
);

adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const query = typeof req.query.query === 'string' ? req.query.query : '';
    const take = Math.min(Number(req.query.take ?? 25), 100);
    const skip = Math.max(Number(req.query.skip ?? 0), 0);
    res.json({ ok: true, data: await listUsers(query, take, skip) });
  }),
);

const idParam = z.object({ id: z.string().regex(/^\d+$/) });

adminRouter.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json({ ok: true, data: await getUserDetail(BigInt(id)) });
  }),
);

adminRouter.post(
  '/users/:id/status',
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { status } = z
      .object({ status: z.nativeEnum(UserStatus) })
      .parse(req.body);
    res.json({ ok: true, data: await setUserStatus(BigInt(id), status) });
  }),
);

adminRouter.post(
  '/users/:id/role',
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { role } = z.object({ role: z.nativeEnum(Role) }).parse(req.body);

    // An admin cannot strip their own admin rights — that is the classic way to
    // lock every operator out of the back-office by accident.
    if (BigInt(id) === req.userId! && role !== Role.ADMIN) {
      throw badRequest('CANNOT_DEMOTE_SELF', 'You cannot remove your own admin role');
    }
    res.json({ ok: true, data: await setUserRole(BigInt(id), role) });
  }),
);

adminRouter.post(
  '/users/:id/adjust',
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    // Amount is a signed string of minor units so no float ever touches money.
    const { amount, memo } = z
      .object({
        amount: z.string().regex(/^-?\d{1,12}$/),
        memo: z.string().min(1).max(255),
      })
      .parse(req.body);

    res.json({
      ok: true,
      data: await adjustBalance(req.userId!, BigInt(id), BigInt(amount), memo),
    });
  }),
);

// --- withdrawals (payout queue) --------------------------------------------

adminRouter.get(
  '/withdrawals',
  asyncHandler(async (req, res) => {
    const status =
      typeof req.query.status === 'string' && req.query.status in WithdrawalStatus
        ? (req.query.status as WithdrawalStatus)
        : undefined;
    const take = Math.min(Number(req.query.take ?? 50), 100);
    res.json({ ok: true, data: await listWithdrawalsAdmin(status, take) });
  }),
);

adminRouter.post(
  '/withdrawals/:id/approve',
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json({ ok: true, data: await approveWithdrawal(req.userId!, BigInt(id)) });
  }),
);

adminRouter.post(
  '/withdrawals/:id/reject',
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { note } = z.object({ note: z.string().min(1).max(255) }).parse(req.body);
    res.json({ ok: true, data: await rejectWithdrawal(req.userId!, BigInt(id), note) });
  }),
);

// --- support tickets -------------------------------------------------------

adminRouter.get(
  '/tickets',
  asyncHandler(async (req, res) => {
    const status =
      typeof req.query.status === 'string' && req.query.status in TicketStatus
        ? (req.query.status as TicketStatus)
        : undefined;
    const take = Math.min(Number(req.query.take ?? 50), 100);
    res.json({ ok: true, data: await listTicketsAdmin(status, take) });
  }),
);

adminRouter.post(
  '/tickets/:id/reply',
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { reply } = z.object({ reply: z.string().min(2).max(4000) }).parse(req.body);
    res.json({ ok: true, data: await replyTicket(req.userId!, BigInt(id), reply) });
  }),
);

adminRouter.post(
  '/tickets/:id/close',
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json({ ok: true, data: await closeTicket(BigInt(id)) });
  }),
);

// --- announcements ---------------------------------------------------------

adminRouter.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 50), 100);
    res.json({ ok: true, data: await listAnnouncements(take) });
  }),
);

adminRouter.post(
  '/announcements',
  asyncHandler(async (req, res) => {
    const { title, body, pinned } = z
      .object({
        title: z.string().min(3).max(160),
        body: z.string().min(3).max(4000),
        pinned: z.boolean().optional(),
      })
      .parse(req.body);
    res.status(201).json({
      ok: true,
      data: await createAnnouncement(req.userId!, title, body, pinned ?? false),
    });
  }),
);

adminRouter.post(
  '/announcements/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const patch = z
      .object({ active: z.boolean().optional(), pinned: z.boolean().optional() })
      .parse(req.body);
    res.json({ ok: true, data: await updateAnnouncement(BigInt(id), patch) });
  }),
);

adminRouter.delete(
  '/announcements/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json({ ok: true, data: await deleteAnnouncement(BigInt(id)) });
  }),
);

// --- gift codes ------------------------------------------------------------

adminRouter.get(
  '/gift-codes',
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 50), 100);
    res.json({ ok: true, data: await listGiftCodesAdmin(take) });
  }),
);

adminRouter.post(
  '/gift-codes',
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        code: z.string().min(3).max(32).optional(),
        // Amount in minor units, as a string so no float touches money.
        amount: z.string().regex(/^\d{1,12}$/),
        maxRedemptions: z.number().int().min(1).max(1_000_000),
        expiresAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    res.status(201).json({
      ok: true,
      data: await createGiftCodeAdmin({
        code: b.code,
        amount: BigInt(b.amount),
        maxRedemptions: b.maxRedemptions,
        expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
      }),
    });
  }),
);

adminRouter.post(
  '/gift-codes/:id/active',
  asyncHandler(async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    res.json({ ok: true, data: await setGiftCodeActive(BigInt(id), active) });
  }),
);
