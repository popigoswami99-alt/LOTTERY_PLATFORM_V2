import { randomBytes } from 'node:crypto';
import { PeriodStatus, Prisma, type GamePeriod } from '@prisma/client';
import { ROOM_BY_KEY, periodWindowAt, rulesForRoom, type GameRules, type RoomConfig } from '@lp/shared';
import { prisma } from '../../db/prisma.js';
import { notFound } from '../../lib/errors.js';
import { deriveValues, hashSeed } from './draw.js';

/**
 * Period lifecycle — game-agnostic.
 *
 * Every registered game's rooms flow through this same code. What differs per
 * game is only how many random values the draw consumes and how they are
 * shaped into a result, both of which come from the game's rules module.
 */

export function roomOrThrow(roomKey: string): RoomConfig {
  const room = ROOM_BY_KEY[roomKey];
  if (!room) throw notFound(`Unknown room: ${roomKey}`);
  return room;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rulesOrThrow(roomKey: string): GameRules<any> {
  const rules = rulesForRoom(roomKey);
  if (!rules) throw notFound(`No rules registered for room: ${roomKey}`);
  return rules;
}

/**
 * Returns the period covering `atMs` for a room, creating it if this is the
 * first time we have seen that window.
 *
 * Periods are derived from the wall clock rather than counted, so a process
 * restart, a missed tick, or two API instances running at once all converge on
 * the same period number.
 */
export async function ensurePeriod(roomKey: string, atMs = Date.now()): Promise<GamePeriod> {
  const room = roomOrThrow(roomKey);
  const win = periodWindowAt(room, atMs);

  const existing = await prisma.gamePeriod.findUnique({
    where: { roomKey_periodNo: { roomKey, periodNo: win.periodNo } },
  });
  if (existing) return existing;

  const serverSeed = randomBytes(32).toString('hex');

  try {
    return await prisma.gamePeriod.create({
      data: {
        gameCode: room.gameCode,
        roomKey,
        periodNo: win.periodNo,
        startAt: new Date(win.startMs),
        lockAt: new Date(win.lockMs),
        endAt: new Date(win.endMs),
        serverSeed,
        serverSeedHash: hashSeed(serverSeed),
        status: PeriodStatus.OPEN,
      },
    });
  } catch (err: unknown) {
    // Another worker created it first — take theirs, never overwrite a
    // committed seed.
    const raced = await prisma.gamePeriod.findUnique({
      where: { roomKey_periodNo: { roomKey, periodNo: win.periodNo } },
    });
    if (raced) return raced;
    throw err;
  }
}

/** The period a player is currently betting into, plus its timing. */
export async function currentPeriod(roomKey: string, atMs = Date.now()) {
  const room = roomOrThrow(roomKey);
  const win = periodWindowAt(room, atMs);
  const period = await ensurePeriod(roomKey, atMs);

  const isLocked = atMs >= win.lockMs;
  if (isLocked && period.status === PeriodStatus.OPEN) {
    await prisma.gamePeriod.updateMany({
      where: { id: period.id, status: PeriodStatus.OPEN },
      data: { status: PeriodStatus.LOCKED },
    });
    period.status = PeriodStatus.LOCKED;
  }

  return { room, period, window: win, isLocked };
}

/**
 * Fixes the result for a period. Idempotent: if a result is already recorded,
 * it is returned untouched. A result is written exactly once, ever.
 */
export async function drawPeriod(periodId: bigint): Promise<GamePeriod> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: bigint }>>(
      'SELECT id FROM game_periods WHERE id = ? FOR UPDATE',
      periodId,
    );
    if (rows.length === 0) throw notFound('Period not found');

    const period = await tx.gamePeriod.findUniqueOrThrow({ where: { id: periodId } });
    if (period.resultData !== null) return period;

    const rules = rulesOrThrow(period.roomKey);
    const values = deriveValues(
      period.serverSeed,
      period.periodNo,
      rules.draw.count,
      rules.draw.modulus,
    );
    const result = rules.buildResult(values);

    return tx.gamePeriod.update({
      where: { id: periodId },
      data: {
        resultData: result as Prisma.InputJsonValue,
        resultNumber: rules.resultDigit(result),
        drawnAt: new Date(),
        status: PeriodStatus.LOCKED,
      },
    });
  });
}

/**
 * Recent results for a room, newest first — powers the history table.
 *
 * Only SETTLED periods are published. A period gets its result the moment
 * `drawPeriod` runs, but its bets are paid a moment later by `settlePeriod`;
 * exposing the result in between lets a player see the winning number while
 * their own winning bet still reads as PENDING. Waiting for SETTLED makes this
 * endpoint agree with the socket RESULT event, which already fires only after
 * settlement.
 */
export async function recentResults(roomKey: string, take = 20) {
  const rules = rulesOrThrow(roomKey);

  const rows = await prisma.gamePeriod.findMany({
    where: { roomKey, status: PeriodStatus.SETTLED, resultData: { not: Prisma.DbNull } },
    orderBy: { periodNo: 'desc' },
    take,
    select: {
      periodNo: true,
      resultData: true,
      resultNumber: true,
      serverSeed: true,
      serverSeedHash: true,
      drawnAt: true,
    },
  });

  return rows.map((r) => ({
    periodNo: r.periodNo,
    result: r.resultData,
    resultNumber: r.resultNumber,
    summary: rules.describe(r.resultData),
    serverSeed: r.serverSeed,
    serverSeedHash: r.serverSeedHash,
    drawnAt: r.drawnAt,
  }));
}
