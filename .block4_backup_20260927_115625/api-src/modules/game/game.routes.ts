import { Router } from 'express';
import { z } from 'zod';
import { GAMES, oddsLabel } from '@lp/shared';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import { currentPeriod, recentResults, roomOrThrow, rulesOrThrow } from './period.service.js';
import { listMyBets, placeBet } from './bet.service.js';

/**
 * One set of routes for every game. Room keys are globally unique, so a room
 * key alone identifies both the game and the interval.
 */
export const gameRouter = Router();

gameRouter.get('/games', (_req, res) => {
  res.json({
    ok: true,
    data: Object.values(GAMES).map((g) => ({
      gameCode: g.gameCode,
      label: g.label,
      rooms: g.rooms,
    })),
  });
});

gameRouter.get(
  '/games/:gameCode/rooms',
  asyncHandler(async (req, res) => {
    const rules = GAMES[req.params.gameCode];
    if (!rules) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Unknown game' });
      return;
    }
    res.json({ ok: true, data: rules.rooms });
  }),
);

gameRouter.get(
  '/rooms/:roomKey/state',
  asyncHandler(async (req, res) => {
    const { roomKey } = req.params;
    const room = roomOrThrow(roomKey);

    const now = Date.now();
    const { period, window, isLocked } = await currentPeriod(roomKey, now);

    res.json({
      ok: true,
      data: {
        gameCode: room.gameCode,
        roomKey,
        periodNo: period.periodNo,
        // The seed itself stays hidden until the draw; only the commitment is
        // public while betting is open.
        serverSeedHash: period.serverSeedHash,
        status: isLocked ? 'LOCKED' : 'OPEN',
        serverNowMs: now,
        lockMs: window.lockMs,
        endMs: window.endMs,
        remainingMs: Math.max(0, window.endMs - now),
      },
    });
  }),
);

gameRouter.get(
  '/rooms/:roomKey/results',
  asyncHandler(async (req, res) => {
    const { roomKey } = req.params;
    roomOrThrow(roomKey);
    const take = Math.min(Number(req.query.take ?? 20), 100);
    res.json({ ok: true, data: await recentResults(roomKey, take) });
  }),
);

const placeBetSchema = z.object({
  betType: z.string().min(1).max(24),
  selection: z.string().min(1).max(24),
  /** Minor units, as a string so large stakes never round through a float. */
  unitAmount: z.string().regex(/^\d{1,12}$/),
  multiplier: z.number().int().positive(),
});

gameRouter.post(
  '/rooms/:roomKey/bet',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomKey } = req.params;
    roomOrThrow(roomKey);

    const body = placeBetSchema.parse(req.body);
    const result = await placeBet({
      userId: req.userId!,
      roomKey,
      betType: body.betType,
      selection: body.selection,
      unitAmount: BigInt(body.unitAmount),
      multiplier: body.multiplier,
    });

    res.status(201).json({
      ok: true,
      data: {
        betId: result.bet.id,
        periodNo: result.periodNo,
        stake: result.bet.stake,
        balance: result.balance,
      },
    });
  }),
);

gameRouter.get(
  '/rooms/:roomKey/my-bets',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roomKey } = req.params;
    roomOrThrow(roomKey);
    const rules = rulesOrThrow(roomKey);

    const take = Math.min(Number(req.query.take ?? 30), 100);
    const bets = await listMyBets(req.userId!, roomKey, take);

    res.json({
      ok: true,
      data: bets.map((b) => ({
        id: b.id,
        periodNo: b.period.periodNo,
        betType: b.betType,
        selection: b.selection,
        stake: b.stake,
        status: b.status,
        payout: b.payout,
        odds: oddsLabel({ num: b.oddsNum, den: b.oddsDen }),
        resultNumber: b.period.resultNumber,
        summary: b.period.resultData ? rules.describe(b.period.resultData) : null,
        createdAt: b.createdAt,
      })),
    });
  }),
);
