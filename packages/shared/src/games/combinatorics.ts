/**
 * Exact combinatorics for the originals.
 *
 * Every one of these games prices payouts from a probability that is a ratio
 * of binomials. Those numbers get large fast — C(40,10) is about 8.5e8 and the
 * Plinko normaliser for 16 rows exceeds 2^32 — so all of it is BigInt. A
 * double would start losing exact integers here, and a rounding error in this
 * file is a payout error in three games at once.
 */

const factorialCache = new Map<number, bigint>();

export function factorial(n: number): bigint {
  if (n < 0) throw new Error('factorial of a negative');
  const hit = factorialCache.get(n);
  if (hit !== undefined) return hit;

  let acc = 1n;
  for (let i = 2; i <= n; i += 1) acc *= BigInt(i);
  factorialCache.set(n, acc);
  return acc;
}

/** Binomial coefficient C(n, k), exact. */
export function binomial(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  const kk = Math.min(k, n - k);
  let num = 1n;
  let den = 1n;
  for (let i = 0; i < kk; i += 1) {
    num *= BigInt(n - i);
    den *= BigInt(i + 1);
  }
  return num / den;
}

/** Integer power, exact. */
export function ipow(base: bigint, exp: number): bigint {
  let acc = 1n;
  for (let i = 0; i < exp; i += 1) acc *= base;
  return acc;
}

/**
 * Normalised fair multipliers.
 *
 * Given outcome weights and their exact counts (unnormalised probabilities
 * over a common denominator), returns a payout function whose expected value
 * is exactly 1x before the rake.
 *
 *   multiplier(i) = weight(i) * total / SUM(count(j) * weight(j))
 *
 * The consequence is worth stating plainly: ANY weight profile gives exactly
 * 98% RTP once the rake is applied. Weights choose the SHAPE of the paytable —
 * how flat or how spiky — and this normalisation guarantees the house edge
 * stays put regardless. That is what lets Plinko have risk levels and Keno
 * have a paytable without either of them quietly changing the edge.
 */
export interface FairTable {
  /** Payout numerator/denominator for outcome i, as an exact rational. */
  odds(i: number): { num: bigint; den: bigint };
  /** Display multiplier in hundredths, rounded DOWN so we never over-promise. */
  multiplierX100(i: number): number;
}

export function fairTable(weights: bigint[], counts: bigint[], total: bigint): FairTable {
  if (weights.length !== counts.length) throw new Error('weights/counts length mismatch');

  let s = 0n;
  for (let i = 0; i < weights.length; i += 1) s += counts[i] * weights[i];
  if (s === 0n) throw new Error('degenerate paytable: all weights zero');

  return {
    odds: (i) => ({ num: weights[i] * total, den: s }),
    multiplierX100: (i) => Number((100n * weights[i] * total) / s),
  };
}
