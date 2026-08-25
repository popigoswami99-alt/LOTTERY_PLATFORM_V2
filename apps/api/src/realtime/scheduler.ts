import { PeriodStatus } from '@prisma/client';
import {
  ALL_ROOMS,
  SOCKET_EVENTS,
  periodWindowAt,
  rulesForRoom,
  type ResultPayload,
  type TickPayload,
} from '@lp/shared';
import { prisma } from '../db/prisma.js';
import { drawPeriod, ensurePeriod } from '../modules/game/period.service.js';
import { settlePeriod } from '../modules/game/bet.service.js';
import { getBalance } from '../modules/ledger/ledger.service.js';
import { emitToRoom, emitToUser } from './io.js';

/**
 * The game clock, for every room of every registered game.
 *
 * The server is the only authority on time. Clients never decide when a period
 * ends — they render a countdown derived from `serverNowMs` in each tick, so a
 * player with a skewed device clock still locks at exactly the right instant.
 *
 * Nothing here is stateful beyond a de-dupe set: which period is current is
 * always recomputed from the wall clock, so a restart mid-round resumes
 * cleanly rather than losing its place.
 */

let timer: NodeJS.Timeout | null = null;
const lockedAnnounced = new Set<string>();
const finalising = new Set<string>();

async function tickRoom(roomKey: string, now: number): Promise<void> {
  const room = ALL_ROOMS.find((r) => r.key === roomKey)!;
  const win = periodWindowAt(room, now);
  const period = await ensurePeriod(roomKey, now);

  const isLocked = now >= win.lockMs;

  if (isLocked && period.status === PeriodStatus.OPEN) {
    await prisma.gamePeriod.updateMany({
      where: { id: period.id, status: PeriodStatus.OPEN },
      data: { status: PeriodStatus.LOCKED },
    });
    period.status = PeriodStatus.LOCKED;
  }

  const tick: TickPayload = {
    gameCode: room.gameCode,
    roomKey,
    periodNo: period.periodNo,
    serverSeedHash: period.serverSeedHash,
    status: isLocked ? 'LOCKED' : 'OPEN',
    serverNowMs: now,
    endMs: win.endMs,
    lockMs: win.lockMs,
    remainingMs: Math.max(0, win.endMs - now),
  };
  emitToRoom(roomKey, SOCKET_EVENTS.TICK, tick);

  const lockKey = `${roomKey}:${period.periodNo}`;
  if (isLocked && !lockedAnnounced.has(lockKey)) {
    lockedAnnounced.add(lockKey);
    emitToRoom(roomKey, SOCKET_EVENTS.LOCKED, { roomKey, periodNo: period.periodNo });
    // Keep the de-dupe set from growing without bound.
    if (lockedAnnounced.size > 1000) {
      for (const k of lockedAnnounced) {
        lockedAnnounced.delete(k);
        if (lockedAnnounced.size <= 400) break;
      }
    }
  }
}

/**
 * Draws and settles every period whose time is up but which is not yet
 * settled. Driven by a DB query rather than in-memory state, so periods
 * stranded by a crash are picked up on the next tick after restart.
 */
async function finaliseDuePeriods(roomKey: string, now: number): Promise<void> {
  if (finalising.has(roomKey)) return;
  finalising.add(roomKey);

  try {
    const due = await prisma.gamePeriod.findMany({
      where: {
        roomKey,
        endAt: { lte: new Date(now) },
        status: { not: PeriodStatus.SETTLED },
      },
      orderBy: { endAt: 'asc' },
      take: 10,
    });

    for (const p of due) {
      const drawn = await drawPeriod(p.id);
      const outcome = await settlePeriod(p.id);
      const rules = rulesForRoom(roomKey);

      const payload: ResultPayload = {
        gameCode: drawn.gameCode,
        roomKey,
        periodNo: drawn.periodNo,
        result: drawn.resultData,
        resultNumber: drawn.resultNumber,
        serverSeed: drawn.serverSeed,
      };
      emitToRoom(roomKey, SOCKET_EVENTS.RESULT, payload);

      // Push fresh balances to everyone who won on this period.
      for (const userId of outcome.winners) {
        const balance = await getBalance(userId);
        emitToUser(userId, SOCKET_EVENTS.BALANCE, { balance: balance.toString() });
      }

      const shown = rules ? rules.describe(drawn.resultData).primary : '?';
      console.log(
        `[${drawn.gameCode}] ${roomKey} ${drawn.periodNo} -> ${shown} ` +
          `(${outcome.settled} bets, payout ${outcome.totalPayout})`,
      );
    }
  } catch (err) {
    console.error(`[scheduler] finalise failed for ${roomKey}:`, err);
  } finally {
    finalising.delete(roomKey);
  }
}

export function startScheduler(): void {
  if (timer) return;

  const run = async () => {
    const now = Date.now();
    await Promise.all(
      ALL_ROOMS.map(async (room) => {
        try {
          await finaliseDuePeriods(room.key, now);
          await tickRoom(room.key, now);
        } catch (err) {
          console.error(`[scheduler] tick failed for ${room.key}:`, err);
        }
      }),
    );
  };

  void run();
  timer = setInterval(() => void run(), 1000);
  console.log(`[scheduler] started for ${ALL_ROOMS.length} rooms across all games`);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
