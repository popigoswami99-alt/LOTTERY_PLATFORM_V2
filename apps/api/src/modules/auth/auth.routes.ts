import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../db/prisma.js';
import { getBalance } from '../ledger/ledger.service.js';
import { login, logout, refresh, register } from './auth.service.js';

export const authRouter = Router();

const phoneSchema = z.string().regex(/^\d{6,15}$/, 'Enter a valid phone number');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters').max(72);

const registerSchema = z
  .object({
    phone: phoneSchema.optional(),
    email: z.string().email().optional(),
    password: passwordSchema,
    nickname: z.string().min(2).max(32).optional(),
    inviteCode: z.string().length(8).optional(),
  })
  .refine((v) => v.phone || v.email, {
    message: 'A phone number or email is required',
    path: ['phone'],
  });

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const { user, tokens } = await register(input);
    res.status(201).json({
      ok: true,
      data: {
        user: {
          id: user.id,
          nickname: user.nickname,
          phone: user.phone,
          email: user.email,
          inviteCode: user.inviteCode,
          role: user.role,
        },
        ...tokens,
      },
    });
  }),
);

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: passwordSchema,
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const { user, tokens } = await login(input);
    res.json({
      ok: true,
      data: {
        user: {
          id: user.id,
          nickname: user.nickname,
          phone: user.phone,
          email: user.email,
          inviteCode: user.inviteCode,
          role: user.role,
        },
        ...tokens,
      },
    });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(10) }).parse(req.body);
    res.json({ ok: true, data: await refresh(refreshToken) });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(10) }).parse(req.body);
    await logout(refreshToken);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.userId! },
      select: {
        id: true,
        nickname: true,
        phone: true,
        email: true,
        inviteCode: true,
        role: true,
        createdAt: true,
      },
    });
    res.json({ ok: true, data: { user, balance: await getBalance(req.userId!) } });
  }),
);
