import { CrashPhase, BetStatus } from '@prisma/client';
import {
  CRASH_EVENTS,
  CRASH_HOLD_MS,
  X100,
  formatX100,
  type CrashStatePayload,
} from '@lp/shared';
import { prisma } from '../db/prisma.js';
import {
  bustAtMs,
  closeRound,
  createRound,
  currentRound,
  liveMultiplierX100,
  markLosers,
  sweepAutoCashouts,
} from '../modules/game/crash/crash.service.js';
import { getBalance } from '../modules/ledger/ledger.service.js';
import { emitToRoom, emitToUser } from './io.js';
import { SOCKET_EVENTS } from '@lp/shared';

/**
 * The Crash round loop.
 *
 * Unlike the lottery scheduler, rounds here are NOT derived from the wall
 * clock — each lasts as long as its own crash point dictates. So the loop is a
 * small state machine driven off the round row in the database, which means a
 * process restart resumes the live round rather than abandoning players
 * mid-flight.
 *
 * Ticks at 100ms so the multiplier is smooth and auto-cashouts fire close to
 * their target. Clients still interpolate locally between ticks from
 * `startedAtMs`, so the curve stays smooth regardless of network jitter.
 */

export const CRASH_CHANNEL = 'CRASH';

let timer: NodeJS.Timeout | null = null;
let holdUntil = 0;

async function buildState(now: number): Promise<CrashStatePayload> {
  const round = await currentRound();
  const phase = round.phase as CrashPhase;

  const revealed = phase === CrashPhase.CRASHED || phase === CrashPhase.SETTLED;

  return {
    roundNo: round.roundNo.toString(),
    phase: phase === CrashPhase.SETTLED ? 'CRASHED' : (phase as 'WAITING' | 'RUNNING' | 'CRASHED'),
    serverSeedHash: round.serverSeedHash,
    serverNowMs: now,
    startedAtMs: round.startedAt?.getTime() ?? null,
    waitingEndsAtMs: phase === CrashPhase.WAITING ? round.waitingEndsAt.getTime() : null,
    // Crash point and seed stay secret until the bust — publishing either
    // early would hand players the answer.
    crashPointX100: revealed ? round.crashPointX100 : null,
    serverSeed: revealed ? round.serverSeed : null,
    multiplierX100: liveMultiplierX100(round, now),
  };
}

async function tick(): Promise<void> {
  const now = Date.now();
  const round = await currentRound();

  switch (round.phase) {
    case CrashPhase.WAITING: {
      if (now >= round.waitingEndsAt.getTime()) {
        // Start the round. updateMany with a phase guard makes this safe if
        // two ticks overlap.
        await prisma.crashRound.updateMany({
          where: { id: round.id, phase: CrashPhase.WAITING },
          data: { phase: CrashPhase.RUNNING, startedAt: new Date(now) },
        });
      }
      break;
    }

    case CrashPhase.RUNNING: {
      const live = liveMultiplierX100(round, now);

      if (now >= bustAtMs(round)) {
        await prisma.crashRound.updateMany({
          where: { id: round.id, phase: CrashPhase.RUNNING },
          data: { phase: CrashPhase.CRASHED, crashedAt: new Date(now) },
        });

        // Losers are settled immediately, but the round stays in CRASHED for
        // the hold window so the bust is actually visible to players.
        const { lost } = await markLosers(round.id);
        holdUntil = now + CRASH_HOLD_MS;

        emitToRoom(CRASH_CHANNEL, CRASH_EVENTS.BUST, {
          roundNo: round.roundNo.toString(),
          crashPointX100: round.crashPointX100,
          serverSeed: round.serverSeed,
        });

        console.log(
          `[CRASH] round ${round.roundNo} busted at ${formatX100(round.crashPointX100)}x ` +
            `(${lost} bets lost)`,
        );
        break;
      }

      // Fire any auto-cashouts the multiplier has now passed.
      const cashed = await sweepAutoCashouts(round.id, live);
      for (const c of cashed) {
        const user = await prisma.user.findUnique({
          where: { id: c.userId },
          select: { nickname: true },
        });
        emitToRoom(CRASH_CHANNEL, CRASH_EVENTS.CASHOUT, {
          roundNo: round.roundNo.toString(),
          nickname: user?.nickname ?? 'Player',
          multiplierX100: c.multiplierX100,
          payout: c.payout.toString(),
        });
        emitToUser(c.userId, SOCKET_EVENTS.BALANCE, {
          balance: (await getBalance(c.userId)).toString(),
        });
      }
      break;
    }

    case CrashPhase.CRASHED:
    case CrashPhase.SETTLED: {
      // Hold the bust on screen briefly, then open the next round.
      if (holdUntil === 0) holdUntil = now + CRASH_HOLD_MS;
      if (now >= holdUntil) {
        await closeRound(round.id);
        await createRound();
        holdUntil = 0;
      }
      break;
    }
  }

  emitToRoom(CRASH_CHANNEL, CRASH_EVENTS.STATE, await buildState(Date.now()));
}

export function startCrashLoop(): void {
  if (timer) return;

  const run = () => {
    tick().catch((err) => console.error('[crash] tick failed:', err));
  };

  void (async () => {
    // On boot, a round left RUNNING by a killed process is already past its
    // bust time — the first tick settles it, so players are never stranded.
    const stale = await prisma.crashRound.findMany({
      where: { phase: { in: [CrashPhase.RUNNING, CrashPhase.CRASHED] } },
      select: { id: true, roundNo: true },
    });
    for (const s of stale) {
      const r = await prisma.crashRound.findUniqueOrThrow({ where: { id: s.id } });
      if (Date.now() >= bustAtMs(r)) {
        await prisma.crashRound.updateMany({
          where: { id: r.id, phase: CrashPhase.RUNNING },
          data: { phase: CrashPhase.CRASHED, crashedAt: new Date() },
        });
        await closeRound(r.id);
        console.log(`[CRASH] recovered stranded round ${r.roundNo} on boot`);
      }
    }
    run();
  })();

  timer = setInterval(run, 100);
  console.log('[CRASH] round loop started');
}

export function stopCrashLoop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Pending-bet count for the current round, for the lobby ticker. */
export async function livePlayerCount(roundId: bigint): Promise<number> {
  return prisma.crashBet.count({ where: { roundId, status: BetStatus.PENDING } });
}
