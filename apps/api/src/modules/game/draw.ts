import { createHash, createHmac } from 'node:crypto';

/**
 * Turning a committed seed into random values.
 *
 * Kept server-side and shared by every game so the commitment scheme is
 * implemented exactly once. A game's rules module only declares how many
 * values it needs and what range they span (`rules.draw`), then shapes them
 * into its own result type (`rules.buildResult`).
 *
 * The scheme:
 *   1. A period opens with a random 32-byte seed; only SHA-256(seed) is
 *      published. Players see the commitment before betting.
 *   2. Values come from HMAC-SHA256(seed, `${periodNo}:${i}`), so they are
 *      fully determined the moment the seed exists — before any bet.
 *   3. After the draw the seed is revealed and anyone can re-derive both the
 *      hash and every value.
 */

export function hashSeed(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

/**
 * 52 raw bits derived from the seed — for games whose result is a continuous
 * quantity rather than one of N discrete outcomes (Crash's bust point).
 * 52 bits is the largest value that survives as an exact JS number.
 */
export function deriveRaw52(serverSeed: string, nonce: string): number {
  const mac = createHmac('sha256', serverSeed).update(nonce).digest('hex');
  return Number(BigInt('0x' + mac.slice(0, 13)));
}

/**
 * Entropy for the instant games, from a player's seed pair.
 *
 * The message is `clientSeed:nonce:cursor`. The nonce makes every bet
 * distinct; the cursor lets one bet draw several values (Mines needs 24 for
 * its shuffle). Because the client seed is chosen by the player, the operator
 * cannot pick a server seed that is favourable against a known bet sequence.
 */
export function deriveInstant(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cursor = 0,
): number {
  const mac = createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:${cursor}`)
    .digest('hex');
  return Number(BigInt('0x' + mac.slice(0, 13)));
}

/** A run of instant values, for games that need more than one. */
export function deriveInstantSeries(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  count: number,
  offset: number = 0,
): number[] {
  return Array.from({ length: count }, (_, i) =>
    deriveInstant(serverSeed, clientSeed, nonce, i + offset),
  );
}

/**
 * Derives `count` independent values, each uniform in [0, modulus).
 *
 * Uses rejection sampling rather than a plain modulo. With 52 bits of entropy
 * per value the bias from `% 10` would be about 1 part in 2^49 — undetectable
 * in practice — but "undetectable bias" is not a claim worth defending in a
 * provably-fair game, so the biased tail is simply resampled instead.
 */
export function deriveValues(
  serverSeed: string,
  periodNo: string,
  count: number,
  modulus: number,
): number[] {
  const out: number[] = [];
  const BITS = 52n;
  const RANGE = 1n << BITS; // 2^52, exactly representable as a JS number
  const limit = RANGE - (RANGE % BigInt(modulus)); // largest unbiased bound

  let counter = 0;
  while (out.length < count) {
    const mac = createHmac('sha256', serverSeed)
      .update(`${periodNo}:${out.length}:${counter}`)
      .digest('hex');
    const value = BigInt('0x' + mac.slice(0, 13)); // 13 hex chars = 52 bits

    if (value < limit) {
      out.push(Number(value % BigInt(modulus)));
      counter = 0;
    } else {
      counter += 1; // rejected, reshuffle with a new counter
    }
  }

  return out;
}
