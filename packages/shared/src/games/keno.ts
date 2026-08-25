import { contractAmount } from '../core.js';
import { binomial, fairTable, ipow, type FairTable } from './combinatorics.js';

/**
 * Keno — the player picks up to 10 numbers from a 40-ball pool, the house
 * draws 10, and the payout depends on how many of the picks were hit.
 *
 * Hit counts follow the hypergeometric distribution:
 *
 *   P(h hits | p picks) = C(p,h) * C(40-p, 10-h) / C(40,10)
 *
 * As with Plinko the paytable is generated, not hand-written: each pick count
 * gets a weight profile (zero below a threshold, rising steeply above it) and
 * `fairTable` normalises it to exactly 1x expected value before the rake. So
 * picking 2 numbers and picking 10 carry the same 98% RTP even though their
 * paytables look nothing alike.
 */

export const GAME_CODE_KENO = 'KENO';

export const KENO_POOL = 40;
export const KENO_DRAWN = 10;
export const KENO_MAX_PICKS = 10;
export const KENO_MIN_PICKS = 1;

export function isValidKenoPicks(picks: number[]): boolean {
  if (!Array.isArray(picks)) return false;
  if (picks.length < KENO_MIN_PICKS || picks.length > KENO_MAX_PICKS) return false;
  if (new Set(picks).size !== picks.length) return false;
  return picks.every((n) => Number.isInteger(n) && n >= 1 && n <= KENO_POOL);
}

/**
 * Lowest hit count that pays anything, for a given number of picks.
 * Small tickets must hit everything; large tickets can miss a few.
 */
export function kenoThreshold(picks: number): number {
  if (picks <= 2) return picks; // 1 and 2 picks must be perfect
  return Math.ceil(picks / 2) + 1;
}

function weightFor(picks: number, hits: number): bigint {
  const t = kenoThreshold(picks);
  if (hits < t) return 0n;
  return ipow(5n, hits - t);
}

/** Number of ways to land exactly `hits` of `picks`, over C(40,10) total. */
export function kenoWays(picks: number, hits: number): bigint {
  return binomial(picks, hits) * binomial(KENO_POOL - picks, KENO_DRAWN - hits);
}

const tableCache = new Map<number, FairTable>();

export function kenoTable(picks: number): FairTable {
  const hit = tableCache.get(picks);
  if (hit) return hit;

  const maxHits = Math.min(picks, KENO_DRAWN);
  const weights: bigint[] = [];
  const counts: bigint[] = [];

  for (let h = 0; h <= maxHits; h += 1) {
    weights.push(weightFor(picks, h));
    counts.push(kenoWays(picks, h));
  }

  const table = fairTable(weights, counts, binomial(KENO_POOL, KENO_DRAWN));
  tableCache.set(picks, table);
  return table;
}

/** Display paytable: multiplier per hit count, for the UI. */
export function kenoPaytable(picks: number): number[] {
  const t = kenoTable(picks);
  const maxHits = Math.min(picks, KENO_DRAWN);
  return Array.from({ length: maxHits + 1 }, (_, h) => t.multiplierX100(h));
}

/**
 * Draws 10 distinct balls from the 40-ball pool using a partial Fisher-Yates
 * shuffle driven by caller-supplied values — pure, so a player verifying a
 * past bet re-derives the values and calls this exact function.
 */
export function kenoDraw(values: number[]): number[] {
  const pool = Array.from({ length: KENO_POOL }, (_, i) => i + 1);
  for (let i = 0; i < KENO_DRAWN; i += 1) {
    const j = i + (values[i] % (KENO_POOL - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, KENO_DRAWN).sort((a, b) => a - b);
}

/** Values the draw consumes. */
export const KENO_DRAW_VALUES = KENO_DRAWN;

export function kenoHits(picks: number[], drawn: number[]): number[] {
  const set = new Set(drawn);
  return picks.filter((p) => set.has(p));
}

/** Exact payout, after the rake. */
export function kenoPayout(stake: bigint, picks: number, hits: number): bigint {
  const { num, den } = kenoTable(picks).odds(hits);
  if (num === 0n) return 0n;
  return (contractAmount(stake) * num) / den;
}
