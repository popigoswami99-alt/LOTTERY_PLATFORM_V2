import { Router } from 'express';
import { z } from 'zod';
import { CrashPhase } from '@prisma/client';
import { crashPayout } from '@lp/shared';
import { asyncHandler } from '../../../middleware/error.js';
import { requireAuth } from '../../../middleware/auth.js';
import {
  cashOut,
  currentRound,
  liveMultiplierX100,
  myBetsOnRound,
  myCrashBets,
  placeCrashBet,
  recentCrashHistory,
  roundBets,
} from './crash.service.js';

export const crashRouter = Router();

crashRouter.get(
  '/state',
  asyncHandler(async (req, res) => {
    const now = Date.now();
    const round = await currentRound();
    const revealed =
      round.phase === CrashPhase.CRASHED || round.phase === CrashPhase.SETTLED;

    // Restore the caller's own bets so a refresh mid-round does not lose them.
    const myBets: Record<number, unknown> = {};
    if (req.userId) {
      for (const b of await myBetsOnRound(req.userId, round.id)) {
        myBets[b.slot] = {
          id: b.id,
          slot: b.slot,
          stake: b.stake,
          autoCashoutX100: b.autoCashoutX100,
          cashedOutX100: b.cashedOutX100,
          status: b.status,
          payout: b.payout,
        };
      }
    }

    res.json({
      ok: true,
      data: {
        roundNo: round.roundNo.toString(),
        phase: round.phase === CrashPhase.SETTLED ? 'CRASHED' : round.phase,
        serverSeedHash: round.serverSeedHash,
        serverNowMs: now,
        startedAtMs: round.startedAt?.getTime() ?? null,
        waitingEndsAtMs:
          round.phase === CrashPhase.WAITING ? round.waitingEndsAt.getTime() : null,
        crashPointX100: revealed ? round.crashPointX100 : null,
        serverSeed: revealed ? round.serverSeed : null,
        multiplierX100: liveMultiplierX100(round, now),
        myBets,
      },
    });
  }),
);

/** Live "All Bets" list for the current round. */
crashRouter.get(
  '/round-bets',
  asyncHandler(async (_req, res) => {
    const round = await currentRound();
    res.json({
      ok: true,
      data: { roundNo: round.roundNo.toString(), bets: await roundBets(round.id) },
    });
  }),
);

crashRouter.get(
  '/history',
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 24), 100);
    const rows = await recentCrashHistory(take);
    res.json({
      ok: true,
      data: rows.map((r) => ({
        roundNo: r.roundNo.toString(),
        crashPointX100: r.crashPointX100,
        serverSeed: r.serverSeed,
        serverSeedHash: r.serverSeedHash,
        crashedAt: r.crashedAt,
      })),
    });
  }),
);

const betSchema = z.object({
  /** Minor units, as a string so large stakes never round through a float. */
  stake: z.string().regex(/^\d{1,12}$/),
  /** Optional auto cash-out target in hundredths, e.g. 250 = 2.50x. */
  autoCashoutX100: z.number().int().positive().nullable().optional(),
  /** Which bet panel: 1 or 2. */
  slot: z.number().int().min(1).max(2).optional(),
});

crashRouter.post(
  '/bet',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = betSchema.parse(req.body);
    const result = await placeCrashBet({
      userId: req.userId!,
      stake: BigInt(body.stake),
      autoCashoutX100: body.autoCashoutX100 ?? null,
      slot: body.slot ?? 1,
    });

    res.status(201).json({
      ok: true,
      data: {
        betId: result.bet.id,
        slot: result.bet.slot,
        roundNo: result.roundNo.toString(),
        stake: result.bet.stake,
        balance: result.balance,
      },
    });
  }),
);

/**
 * Cash out. Deliberately takes NO multiplier from the client — the server
 * prices it from its own clock, so there is nothing here for a client to lie
 * about.
 */
crashRouter.post(
  '/cashout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { slot } = z
      .object({ slot: z.number().int().min(1).max(2).optional() })
      .parse(req.body ?? {});
    res.json({ ok: true, data: await cashOut(req.userId!, slot ?? 1) });
  }),
);

crashRouter.get(
  '/my-bets',
  requireAuth,
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 30), 100);
    const bets = await myCrashBets(req.userId!, take);

    res.json({
      ok: true,
      data: bets.map((b) => ({
        id: b.id,
        // Which of the two bet panels this came from — without it the client
        // cannot attribute a past bet to a panel.
        slot: b.slot,
        roundNo: b.round.roundNo.toString(),
        crashPointX100: b.round.crashPointX100,
        stake: b.stake,
        autoCashoutX100: b.autoCashoutX100,
        cashedOutX100: b.cashedOutX100,
        status: b.status,
        payout: b.payout,
        /** What it would have paid at the bust — for the "so close" line. */
        maxPayout: crashPayout(b.stake, b.round.crashPointX100),
        createdAt: b.createdAt,
      })),
    });
  }),
);
