import { randomBytes } from 'node:crypto';
import type { SeedPair } from '@prisma/client';
import { prisma, type Tx } from '../../../db/prisma.js';
import { badRequest } from '../../../lib/errors.js';
import { hashSeed } from '../draw.js';

/**
 * Seed pairs for the instant games.
 *
 * A player always has exactly one ACTIVE pair. Its server seed is secret and
 * only the hash is shown; the client seed is theirs to choose; the nonce
 * increments on every bet.
 *
 * Rotating reveals the old server seed and issues a new commitment. That is
 * what makes these games verifiable after the fact: with the revealed seed,
 * their own client seed and the nonce recorded on each bet, a player can
 * re-derive every outcome they were given under that pair.
 */

const DEFAULT_CLIENT_SEED_BYTES = 8;

function newServerSeed(): string {
  return randomBytes(32).toString('hex');
}

export async function getActiveSeedPair(userId: bigint): Promise<SeedPair> {
  const existing = await prisma.seedPair.findFirst({
    where: { userId, active: true },
    orderBy: { id: 'desc' },
  });
  if (existing) return existing;

  const serverSeed = newServerSeed();
  return prisma.seedPair.create({
    data: {
      userId,
      serverSeed,
      serverSeedHash: hashSeed(serverSeed),
      clientSeed: randomBytes(DEFAULT_CLIENT_SEED_BYTES).toString('hex'),
    },
  });
}

/**
 * Claims the next nonce for a bet.
 *
 * The atomic increment is what guarantees two concurrent bets can never share
 * an outcome — the database, not the application, decides the ordering.
 */
export async function claimNonce(tx: Tx, seedPairId: bigint): Promise<number> {
  const updated = await tx.seedPair.update({
    where: { id: seedPairId },
    data: { nonce: { increment: 1 } },
    select: { nonce: true },
  });
  return updated.nonce;
}

export async function setClientSeed(userId: bigint, clientSeed: string): Promise<SeedPair> {
  const seed = clientSeed.trim();
  if (seed.length < 1 || seed.length > 64) {
    throw badRequest('BAD_CLIENT_SEED', 'Client seed must be 1-64 characters');
  }
  if (!/^[\w\-.:]+$/.test(seed)) {
    throw badRequest('BAD_CLIENT_SEED', 'Client seed may only contain letters, digits, - . : _');
  }

  const pair = await getActiveSeedPair(userId);
  return prisma.seedPair.update({ where: { id: pair.id }, data: { clientSeed: seed } });
}

/**
 * Reveals the current server seed and starts a fresh pair.
 * Returns the revealed seed so the player can verify their past bets.
 */
export async function rotateSeedPair(userId: bigint, nextClientSeed?: string) {
  const current = await getActiveSeedPair(userId);

  return prisma.$transaction(async (tx) => {
    await tx.seedPair.update({
      where: { id: current.id },
      data: { active: false, revealedAt: new Date() },
    });

    const serverSeed = newServerSeed();
    const fresh = await tx.seedPair.create({
      data: {
        userId,
        serverSeed,
        serverSeedHash: hashSeed(serverSeed),
        clientSeed:
          nextClientSeed?.trim() || randomBytes(DEFAULT_CLIENT_SEED_BYTES).toString('hex'),
      },
    });

    return {
      revealed: {
        serverSeed: current.serverSeed,
        serverSeedHash: current.serverSeedHash,
        clientSeed: current.clientSeed,
        betsPlayed: current.nonce,
      },
      next: {
        serverSeedHash: fresh.serverSeedHash,
        clientSeed: fresh.clientSeed,
        nonce: 0,
      },
    };
  });
}

/** Past pairs whose seeds have been revealed — the verification history. */
export async function revealedSeedPairs(userId: bigint, take = 10) {
  return prisma.seedPair.findMany({
    where: { userId, active: false },
    orderBy: { id: 'desc' },
    take,
    select: {
      id: true,
      serverSeed: true,
      serverSeedHash: true,
      clientSeed: true,
      nonce: true,
      revealedAt: true,
    },
  });
}
