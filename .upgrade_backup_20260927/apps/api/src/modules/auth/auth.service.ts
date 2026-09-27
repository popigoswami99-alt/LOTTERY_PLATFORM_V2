import { createHash, randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AccountKind, UserStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { badRequest, conflict, forbidden, unauthorized } from '../../lib/errors.js';
import { getOrCreateUserAccount } from '../ledger/ledger.service.js';

const BCRYPT_ROUNDS = 10;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AccessClaims {
  sub: string;
  nickname: string;
}

function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < 8; i += 1) out += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return out;
}

function signAccessToken(userId: bigint, nickname: string): string {
  const payload: AccessClaims = { sub: userId.toString(), nickname };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Refresh tokens are opaque random strings. Only their SHA-256 hash is stored,
 * so a database leak does not hand an attacker usable sessions.
 */
async function issueRefreshToken(userId: bigint): Promise<string> {
  const raw = randomBytes(48).toString('base64url');
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  await prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  return raw;
}

async function issueTokens(userId: bigint, nickname: string): Promise<AuthTokens> {
  return {
    accessToken: signAccessToken(userId, nickname),
    refreshToken: await issueRefreshToken(userId),
  };
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims;
  } catch {
    throw unauthorized('Invalid or expired token');
  }
}

export interface RegisterInput {
  phone?: string;
  email?: string;
  password: string;
  nickname?: string;
  inviteCode?: string;
}

export async function register(input: RegisterInput) {
  const { phone, email, password } = input;

  if (!phone && !email) {
    throw badRequest('IDENTIFIER_REQUIRED', 'A phone number or email is required');
  }

  const clash = await prisma.user.findFirst({
    where: { OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] },
    select: { id: true },
  });
  if (clash) throw conflict('ALREADY_REGISTERED', 'That phone or email is already registered');

  let invitedById: bigint | null = null;
  if (input.inviteCode) {
    const inviter = await prisma.user.findUnique({
      where: { inviteCode: input.inviteCode.toUpperCase() },
      select: { id: true },
    });
    if (!inviter) throw badRequest('BAD_INVITE_CODE', 'That invite code does not exist');
    invitedById = inviter.id;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const nickname = input.nickname?.trim() || `Player${randomInt(100000, 999999)}`;

  // Retry on the astronomically unlikely invite-code collision.
  let user;
  for (let attempt = 0; ; attempt += 1) {
    try {
      user = await prisma.user.create({
        data: {
          phone: phone ?? null,
          email: email ?? null,
          passwordHash,
          nickname,
          inviteCode: generateInviteCode(),
          invitedById,
        },
      });
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
    }
  }

  // Every player gets a cash account up front so the wallet is never absent.
  await getOrCreateUserAccount(prisma, user.id, AccountKind.USER_CASH);

  return { user, tokens: await issueTokens(user.id, user.nickname) };
}

export interface LoginInput {
  identifier: string; // phone or email
  password: string;
}

export async function login({ identifier, password }: LoginInput) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ phone: identifier }, { email: identifier }] },
  });

  // Same error and comparable timing whether the account exists or not, so
  // this endpoint cannot be used to enumerate registered numbers.
  if (!user) {
    await bcrypt.compare(password, '$2a$10$' + 'x'.repeat(53));
    throw unauthorized('Incorrect account or password');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw unauthorized('Incorrect account or password');

  if (user.status !== UserStatus.ACTIVE) {
    throw forbidden('This account is not active. Please contact support.');
  }

  // Stamped after the password check so a failed attempt never moves it.
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return { user, tokens: await issueTokens(user.id, user.nickname) };
}

export async function refresh(rawToken: string): Promise<AuthTokens> {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw unauthorized('Session expired, please log in again');
  }
  if (stored.user.status !== UserStatus.ACTIVE) throw forbidden('Account is not active');

  // Rotate: the presented token is burned as the new one is issued, so a
  // stolen refresh token is usable at most once.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueTokens(stored.userId, stored.user.nickname);
}

export async function logout(rawToken: string): Promise<void> {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
