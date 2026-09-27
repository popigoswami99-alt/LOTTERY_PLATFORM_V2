import { Router } from 'express';
import { z } from 'zod';
import {
  KENO_DRAWN,
  KENO_MAX_PICKS,
  KENO_MIN_PICKS,
  KENO_POOL,
  MINES_TILES,
  MOTORACE_RACERS,
  WHEEL_SEGMENTS,
  isValidPlinkoRisk,
  isValidPlinkoRows,
  isValidWheelRisk,
  kenoPaytable,
  kenoThreshold,
  minesLadder,
  motoRaceMultiplierX100,
  plinkoMultipliers,
  wheelSegments,
} from '@lp/shared';
import { asyncHandler } from '../../../middleware/error.js';
import { requireAuth } from '../../../middleware/auth.js';
import {
  getActiveSeedPair,
  revealedSeedPairs,
  rotateSeedPair,
  setClientSeed,
} from './seed.service.js';
import {
  instantHistory,
  minesCashout,
  minesCurrent,
  minesReveal,
  minesStart,
  playDice,
  playLimbo,
} from './instant.service.js';
import {
  abCurrent,
  abPick,
  abStart,
  dragonTigerOdds,
  playDragonTiger,
  hiloCall,
  hiloCashout,
  hiloCurrent,
  hiloStart,
  playKeno,
  playMotoRace,
  playPlinko,
  playWheel,
  startChicken,
  stepChicken,
  cashoutChicken,
  chickenCurrent,
} from './originals.service.js';

export const instantRouter = Router();

// --- Seed pair -------------------------------------------------------------

instantRouter.get(
  '/seed',
  requireAuth,
  asyncHandler(async (req, res) => {
    const pair = await getActiveSeedPair(req.userId!);
    res.json({
      ok: true,
      data: {
        // The active server seed itself is never sent — only its commitment.
        serverSeedHash: pair.serverSeedHash,
        clientSeed: pair.clientSeed,
        nonce: pair.nonce,
      },
    });
  }),
);

instantRouter.post(
  '/seed/client',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { clientSeed } = z.object({ clientSeed: z.string().min(1).max(64) }).parse(req.body);
    const pair = await setClientSeed(req.userId!, clientSeed);
    res.json({
      ok: true,
      data: { serverSeedHash: pair.serverSeedHash, clientSeed: pair.clientSeed, nonce: pair.nonce },
    });
  }),
);

instantRouter.post(
  '/seed/rotate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z.object({ clientSeed: z.string().min(1).max(64).optional() }).parse(req.body ?? {});
    res.json({ ok: true, data: await rotateSeedPair(req.userId!, body.clientSeed) });
  }),
);

instantRouter.get(
  '/seed/revealed',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await revealedSeedPairs(req.userId!) });
  }),
);

// --- Dice ------------------------------------------------------------------

const diceSchema = z.object({
  stake: z.string().regex(/^\d{1,12}$/),
  /** 0..9999, i.e. 0.00 - 99.99 */
  target: z.number().int().min(0).max(9999),
  direction: z.enum(['over', 'under']),
});

instantRouter.post(
  '/dice/roll',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = diceSchema.parse(req.body);
    const result = await playDice({
      userId: req.userId!,
      stake: BigInt(b.stake),
      target: b.target,
      direction: b.direction,
    });
    res.json({ ok: true, data: result });
  }),
);

// --- Limbo -----------------------------------------------------------------

const limboSchema = z.object({
  stake: z.string().regex(/^\d{1,12}$/),
  targetX100: z.number().int().positive(),
});

instantRouter.post(
  '/limbo/play',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = limboSchema.parse(req.body);
    const result = await playLimbo({
      userId: req.userId!,
      stake: BigInt(b.stake),
      targetX100: b.targetX100,
    });
    res.json({ ok: true, data: result });
  }),
);

// --- Mines -----------------------------------------------------------------

instantRouter.get(
  '/mines/current',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await minesCurrent(req.userId!) });
  }),
);

/** Multiplier ladder per mine count, so the UI never computes payouts itself. */
instantRouter.get('/mines/ladders', (_req, res) => {
  const data: Record<number, number[]> = {};
  for (let m = 1; m <= 24; m += 1) data[m] = minesLadder(m);
  res.json({ ok: true, data: { tiles: MINES_TILES, ladders: data } });
});

const minesStartSchema = z.object({
  stake: z.string().regex(/^\d{1,12}$/),
  mines: z.number().int().min(1).max(24),
});

instantRouter.post(
  '/mines/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = minesStartSchema.parse(req.body);
    res.status(201).json({
      ok: true,
      data: await minesStart(req.userId!, BigInt(b.stake), b.mines),
    });
  }),
);

instantRouter.post(
  '/mines/reveal',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { tile } = z.object({ tile: z.number().int().min(0).max(24) }).parse(req.body);
    res.json({ ok: true, data: await minesReveal(req.userId!, tile) });
  }),
);

instantRouter.post(
  '/mines/cashout',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await minesCashout(req.userId!) });
  }),
);

// --- Plinko ----------------------------------------------------------------

instantRouter.get('/plinko/table', (req, res) => {
  const rows = Number(req.query.rows ?? 12);
  const risk = String(req.query.risk ?? 'medium');
  if (!isValidPlinkoRows(rows) || !isValidPlinkoRisk(risk)) {
    res.status(400).json({ ok: false, code: 'BAD_CONFIG', message: 'Invalid rows or risk' });
    return;
  }
  res.json({ ok: true, data: { rows, risk, multipliers: plinkoMultipliers(rows, risk) } });
});

instantRouter.post(
  '/plinko/drop',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        stake: z.string().regex(/^\d{1,12}$/),
        rows: z.number().int(),
        risk: z.string(),
      })
      .parse(req.body);
    res.json({ ok: true, data: await playPlinko(req.userId!, BigInt(b.stake), b.rows, b.risk) });
  }),
);

// --- Wheel -----------------------------------------------------------------

instantRouter.get('/wheel/segments', (req, res) => {
  const risk = String(req.query.risk ?? 'medium');
  if (!isValidWheelRisk(risk)) {
    res.status(400).json({ ok: false, code: 'BAD_RISK', message: 'Risk must be low, medium or high' });
    return;
  }
  res.json({ ok: true, data: { risk, count: WHEEL_SEGMENTS, segments: wheelSegments(risk) } });
});

instantRouter.post(
  '/wheel/spin',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = z
      .object({ stake: z.string().regex(/^\d{1,12}$/), risk: z.string() })
      .parse(req.body);
    res.json({ ok: true, data: await playWheel(req.userId!, BigInt(b.stake), b.risk) });
  }),
);

// --- MotoRace ----------------------------------------------------------------

instantRouter.get('/motorace/odds', (_req, res) => {
  res.json({ ok: true, data: { racers: MOTORACE_RACERS, multiplierX100: motoRaceMultiplierX100() } });
});

instantRouter.post(
  '/motorace/race',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = z
      .object({ stake: z.string().regex(/^\d{1,12}$/), pick: z.number().int() })
      .parse(req.body);
    res.json({ ok: true, data: await playMotoRace(req.userId!, BigInt(b.stake), b.pick) });
  }),
);

// --- Keno ------------------------------------------------------------------

instantRouter.get('/keno/paytable', (req, res) => {
  const picks = Number(req.query.picks ?? 5);
  if (!Number.isInteger(picks) || picks < KENO_MIN_PICKS || picks > KENO_MAX_PICKS) {
    res.status(400).json({ ok: false, code: 'BAD_PICKS', message: 'Picks must be 1-10' });
    return;
  }
  res.json({
    ok: true,
    data: {
      pool: KENO_POOL,
      drawn: KENO_DRAWN,
      picks,
      threshold: kenoThreshold(picks),
      multipliers: kenoPaytable(picks),
    },
  });
});

instantRouter.post(
  '/keno/play',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        stake: z.string().regex(/^\d{1,12}$/),
        picks: z.array(z.number().int().min(1).max(40)).min(1).max(10),
      })
      .parse(req.body);
    res.json({ ok: true, data: await playKeno(req.userId!, BigInt(b.stake), b.picks) });
  }),
);

// --- Hi-Lo -----------------------------------------------------------------

instantRouter.get(
  '/hilo/current',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await hiloCurrent(req.userId!) });
  }),
);

instantRouter.post(
  '/hilo/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = z.object({ stake: z.string().regex(/^\d{1,12}$/) }).parse(req.body);
    res.status(201).json({ ok: true, data: await hiloStart(req.userId!, BigInt(b.stake)) });
  }),
);

instantRouter.post(
  '/hilo/call',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = z.object({ call: z.enum(['higher', 'lower']) }).parse(req.body);
    res.json({ ok: true, data: await hiloCall(req.userId!, b.call) });
  }),
);

instantRouter.post(
  '/hilo/cashout',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await hiloCashout(req.userId!) });
  }),
);

// --- Dragon Tiger ----------------------------------------------------------

instantRouter.get('/dragontiger/odds', (_req, res) => {
  res.json({ ok: true, data: dragonTigerOdds() });
});

instantRouter.post(
  '/dragontiger/play',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        stake: z.string().regex(/^\d{1,12}$/),
        side: z.enum(['dragon', 'tiger', 'tie']),
      })
      .parse(req.body);
    res.json({
      ok: true,
      data: await playDragonTiger(req.userId!, BigInt(b.stake), b.side),
    });
  }),
);

// --- Andar Bahar -----------------------------------------------------------

instantRouter.get(
  '/andarbahar/current',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await abCurrent(req.userId!) });
  }),
);

instantRouter.post(
  '/andarbahar/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = z.object({ stake: z.string().regex(/^\d{1,12}$/) }).parse(req.body);
    res.status(201).json({ ok: true, data: await abStart(req.userId!, BigInt(b.stake)) });
  }),
);

instantRouter.post(
  '/andarbahar/pick',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = z.object({ side: z.enum(['andar', 'bahar']) }).parse(req.body);
    res.json({ ok: true, data: await abPick(req.userId!, b.side) });
  }),
);

// --- Chicken Road ----------------------------------------------------------

instantRouter.get(
  '/chicken/current',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await chickenCurrent(req.userId!) });
  }),
);

instantRouter.post(
  '/chicken/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = z.object({ stake: z.string().regex(/^\d{1,12}$/), minesCount: z.number().int().min(1).max(4) }).parse(req.body);
    res.status(201).json({ ok: true, data: await startChicken(req.userId!, BigInt(b.stake), b.minesCount) });
  }),
);

instantRouter.post(
  '/chicken/step',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = z.object({ lane: z.number().int().min(0).max(4) }).parse(req.body);
    res.json({ ok: true, data: await stepChicken(req.userId!, b.lane) });
  }),
);

instantRouter.post(
  '/chicken/cashout',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await cashoutChicken(req.userId!) });
  }),
);

// --- History ---------------------------------------------------------------

instantRouter.get(
  '/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const game = typeof req.query.game === 'string' ? req.query.game : undefined;
    const take = Math.min(Number(req.query.take ?? 30), 100);
    res.json({ ok: true, data: await instantHistory(req.userId!, game, take) });
  }),
);
