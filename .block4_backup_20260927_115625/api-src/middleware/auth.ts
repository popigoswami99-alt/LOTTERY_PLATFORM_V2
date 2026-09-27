import type { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken } from '../modules/auth/auth.service.js';
import { prisma } from '../db/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: bigint;
      nickname?: string;
      role?: Role;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());

  try {
    const claims = verifyAccessToken(header.slice(7));
    req.userId = BigInt(claims.sub);
    req.nickname = claims.nickname;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Gate for the back-office. Runs AFTER requireAuth (it reads req.userId) and
 * checks the caller's role against the database rather than the token — the
 * access token deliberately carries no role, so a demotion takes effect on the
 * next request instead of waiting out a 15-minute token.
 */
export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.userId) return next(unauthorized());
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true },
    });
    if (!user || user.role !== Role.ADMIN) return next(forbidden('Admin access required'));
    req.role = user.role;
    next();
  } catch (err) {
    next(err);
  }
}

/** Attaches the user when a valid token is present, but never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const claims = verifyAccessToken(header.slice(7));
      req.userId = BigInt(claims.sub);
      req.nickname = claims.nickname;
    } catch {
      /* ignore — treated as a guest */
    }
  }
  next();
}
