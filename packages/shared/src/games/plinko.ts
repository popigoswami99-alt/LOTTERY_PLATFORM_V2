import { contractAmount } from '../core.js';
import { binomial, fairTable, ipow, type FairTable } from './combinatorics.js';

/**
 * Plinko — a ball falls through N rows of pegs, bouncing left or right at
 * each, and lands in one of N+1 buckets.
 *
 * The bucket is simply the number of right-bounces, so the landing
 * distribution is binomial: P(bucket k) = C(N,k) / 2^N. The centre is common,
 * the edges are rare, which is what gives the paytable its familiar U shape.
 *
 * The multipliers are NOT a hand-tuned table. Each risk level supplies integer
 * weights describing the shape it wants, and `fairTable` normalises them so
 * expected value is exactly 1x before the rake. Low and high risk therefore
 * pay very differently but carry the identical 98% RTP — the risk setting
 * changes variance, never the house edge.
 */

export const GAME_CODE_PLINKO = 'PLINKO';

export type PlinkoRisk = 'low' | 'medium' | 'high';
export const PLINKO_RISKS: PlinkoRisk[] = ['low', 'medium', 'high'];
export const PLINKO_ROWS = [8, 12, 16] as const;
export type PlinkoRows = (typeof PLINKO_ROWS)[number];

export function isValidPlinkoRows(rows: number): rows is PlinkoRows {
  return (PLINKO_ROWS as readonly number[]).includes(rows);
}

export function isValidPlinkoRisk(risk: string): risk is PlinkoRisk {
  return (PLINKO_RISKS as string[]).includes(risk);
}

/**
 * Shape weights by distance from the centre bucket.
 * Steeper base = rarer, richer edges and a colder middle.
 */
function weightFor(risk: PlinkoRisk, distance: number): bigint {
  switch (risk) {
    case 'low':
      // Gentle: near-linear, so almost every bucket returns something.
      return BigInt(distance * distance + 1);
    case 'medium':
      return ipow(2n, distance);
    case 'high':
      return ipow(4n, distance);
  }
}

const tableCache = new Map<string, FairTable>();

export function plinkoTable(rows: PlinkoRows, risk: PlinkoRisk): FairTable {
  const key = `${rows}:${risk}`;
  const hit = tableCache.get(key);
  if (hit) return hit;

  const centre = rows / 2;
  const weights: bigint[] = [];
  const counts: bigint[] = [];

  for (let k = 0; k <= rows; k += 1) {
    weights.push(weightFor(risk, Math.abs(k - centre)));
    counts.push(binomial(rows, k));
  }

  const table = fairTable(weights, counts, ipow(2n, rows));
  tableCache.set(key, table);
  return table;
}

/** Display multipliers for every bucket, left to right. */
export function plinkoMultipliers(rows: PlinkoRows, risk: PlinkoRisk): number[] {
  const t = plinkoTable(rows, risk);
  return Array.from({ length: rows + 1 }, (_, k) => t.multiplierX100(k));
}

/**
 * Turns one derived value into the ball's path.
 *
 * Each row consumes one bit, so the path is reproducible from the seed pair
 * and the client can animate exactly the drop the server scored.
 */
export function plinkoPath(value52: number, rows: PlinkoRows): boolean[] {
  const path: boolean[] = [];
  let v = BigInt(value52);
  for (let i = 0; i < rows; i += 1) {
    path.push((v & 1n) === 1n);
    v >>= 1n;
  }
  return path;
}

/** Bucket index = number of right-bounces. */
export function plinkoBucket(path: boolean[]): number {
  return path.reduce((acc, right) => acc + (right ? 1 : 0), 0);
}

/** Exact payout for a landing bucket, after the rake. */
export function plinkoPayout(
  stake: bigint,
  rows: PlinkoRows,
  risk: PlinkoRisk,
  bucket: number,
): bigint {
  const { num, den } = plinkoTable(rows, risk).odds(bucket);
  return (contractAmount(stake) * num) / den;
}
