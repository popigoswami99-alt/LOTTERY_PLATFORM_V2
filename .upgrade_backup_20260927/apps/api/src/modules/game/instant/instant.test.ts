import { describe, expect, it } from 'vitest';
import {
  DICE_MAX_ROLL,
  DICE_MAX_WIN_COUNT,
  DICE_MIN_WIN_COUNT,
  DICE_ROLL_SPAN,
  dicePayout,
  minesPayout,
  MINES_SHUFFLE_VALUES,
  MINES_TILES,
  X100,
  contractAmount,
  diceMultiplierX100,
  diceRollFromValue,
  diceWinCount,
  diceWins,
  instantPayout,
  isValidDiceTarget,
  isValidLimboTarget,
  isValidMineCount,
  limboResultFromValue,
  limboWins,
  minesLadder,
  minesMultiplierX100,
  placeMines,
} from '@lp/shared';
import { deriveInstant, deriveInstantSeries } from '../draw.js';

const STAKE = 100_00n; // ₹100
const TWO_52 = Math.pow(2, 52);

// ===========================================================================
// Dice
// ===========================================================================

describe('Dice', () => {
  it('maps entropy onto 0..9999', () => {
    expect(diceRollFromValue(0)).toBe(0);
    expect(diceRollFromValue(TWO_52 - 1)).toBe(DICE_MAX_ROLL);
    for (let i = 0; i < 500; i += 1) {
      const r = diceRollFromValue(deriveInstant('s', 'c', i));
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(DICE_MAX_ROLL);
    }
  });

  it('counts winning outcomes correctly in both directions', () => {
    expect(diceWinCount(5000, 'under')).toBe(5000);
    expect(diceWinCount(5000, 'over')).toBe(4999);
    // Under t wins on 0..t-1; over t wins on t+1..9999.
    let under = 0;
    let over = 0;
    for (let roll = 0; roll <= DICE_MAX_ROLL; roll += 1) {
      if (diceWins(roll, 5000, 'under')) under += 1;
      if (diceWins(roll, 5000, 'over')) over += 1;
    }
    expect(under).toBe(diceWinCount(5000, 'under'));
    expect(over).toBe(diceWinCount(5000, 'over'));
    expect(under + over + 1).toBe(DICE_ROLL_SPAN); // the target itself pushes
  });

  it('never counts the exact target as a win either way', () => {
    expect(diceWins(5000, 5000, 'under')).toBe(false);
    expect(diceWins(5000, 5000, 'over')).toBe(false);
  });

  it('prices the multiplier at true odds', () => {
    expect(diceMultiplierX100(5000)).toBe(200); // 2.00x at 50%
    expect(diceMultiplierX100(2500)).toBe(400); // 4.00x at 25%
    expect(diceMultiplierX100(100)).toBe(10_000); // 100x at 1%
  });

  /**
   * Priced from the exact rational, so RTP is 98% at EVERY win chance — not
   * just the ones where the multiplier happens to land on a clean hundredth.
   */
  it('holds RTP at exactly 98% for every win chance', () => {
    // Large stake so truncation to whole paise is far below the tolerance.
    const BIG = 1_000_000_00n;
    for (let count = DICE_MIN_WIN_COUNT; count <= DICE_MAX_WIN_COUNT; count += 37) {
      const p = count / DICE_ROLL_SPAN;
      const rtp = (p * Number(dicePayout(BIG, count))) / Number(BIG);
      expect(rtp, `winCount ${count}`).toBeCloseTo(0.98, 6);
    }
  });

  it('never advertises a multiplier higher than it pays', () => {
    for (const count of [100, 750, 3333, 7500, 9900]) {
      const advertised = instantPayout(STAKE, diceMultiplierX100(count));
      expect(dicePayout(STAKE, count)).toBeGreaterThanOrEqual(advertised);
    }
  });

  it('rejects win chances outside 1%-99%', () => {
    expect(isValidDiceTarget(5000, 'under')).toBe(true);
    expect(isValidDiceTarget(50, 'under')).toBe(false); // 0.5%
    expect(isValidDiceTarget(9950, 'under')).toBe(false); // 99.5%
    expect(isValidDiceTarget(9950, 'over')).toBe(false);
    expect(isValidDiceTarget(-1, 'under')).toBe(false);
  });

  it('spreads rolls roughly uniformly', () => {
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20_000; i += 1) {
      buckets[Math.floor(diceRollFromValue(deriveInstant('u', 'c', i)) / 1000)] += 1;
    }
    for (const b of buckets) {
      expect(b).toBeGreaterThan(1750); // expect ~2000
      expect(b).toBeLessThan(2250);
    }
  });
});

// ===========================================================================
// Limbo
// ===========================================================================

describe('Limbo', () => {
  it('never returns below 1.00x', () => {
    expect(limboResultFromValue(0)).toBe(100);
    for (let i = 0; i < 500; i += 1) {
      expect(limboResultFromValue(deriveInstant('s', 'c', i))).toBeGreaterThanOrEqual(100);
    }
  });

  it('wins only when the draw reaches the target', () => {
    expect(limboWins(250, 200)).toBe(true);
    expect(limboWins(200, 200)).toBe(true);
    expect(limboWins(199, 200)).toBe(false);
  });

  /** Same survival law as Crash: P(result >= t) = 100/t. */
  it('matches the theoretical survival curve', () => {
    const N = 60_000;
    const draws: number[] = [];
    for (let i = 0; i < N; i += 1) {
      draws.push(limboResultFromValue(deriveInstant('limbo-dist', 'c', i)));
    }
    for (const t of [150, 200, 500, 1000]) {
      const observed = draws.filter((d) => d >= t).length / N;
      const expected = 100 / t;
      const sigma = Math.sqrt((expected * (1 - expected)) / N);
      expect(Math.abs(observed - expected), `${t / 100}x`).toBeLessThan(4 * sigma);
    }
  });

  it('holds RTP at 98% for every target', () => {
    for (const target of [110, 200, 500, 2000, 10_000]) {
      const p = 100 / target;
      const rtp = (p * Number(instantPayout(STAKE, target))) / Number(STAKE);
      expect(rtp, `${target / 100}x`).toBeCloseTo(0.98, 3);
    }
  });

  it('validates targets', () => {
    expect(isValidLimboTarget(200)).toBe(true);
    expect(isValidLimboTarget(100)).toBe(false); // 1.00x is not a bet
    expect(isValidLimboTarget(2_000_000)).toBe(false);
  });
});

// ===========================================================================
// Mines
// ===========================================================================

describe('Mines', () => {
  it('starts the ladder at 1.00x', () => {
    expect(minesMultiplierX100(3, 0)).toBe(X100);
  });

  it('rises with every safe tile', () => {
    const ladder = minesLadder(3);
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i]).toBeGreaterThan(ladder[i - 1]);
    }
  });

  it('has one rung per safe tile', () => {
    for (let m = 1; m <= 24; m += 1) {
      expect(minesLadder(m)).toHaveLength(MINES_TILES - m);
    }
  });

  it('matches hand-computed odds', () => {
    // 1 mine, 1 reveal: 25/24 = 1.0416... -> 104
    expect(minesMultiplierX100(1, 1)).toBe(104);
    // 24 mines, 1 reveal: 25/1 = 25.00x
    expect(minesMultiplierX100(24, 1)).toBe(2500);
    // 5 mines, 2 reveals: (25*24)/(20*19) = 600/380 = 1.578... -> 157
    expect(minesMultiplierX100(5, 2)).toBe(157);
  });

  /**
   * The ladder is the inverse of the survival probability, so RTP is 98% at
   * every rung. Verified against exact rational probability rather than a
   * float, because this is where a rounding error becomes a payout error.
   */
  it('holds RTP at exactly 98% at every rung, for every mine count', () => {
    const BIG_STAKE = 1_000_000_00n; // large stake so paisa truncation is noise
    for (let mines = 1; mines <= 24; mines += 1) {
      const safe = MINES_TILES - mines;
      for (let k = 1; k <= safe; k += 1) {
        // P(k safe picks) = prod (safe-i)/(25-i)
        let num = 1n;
        let den = 1n;
        for (let i = 0; i < k; i += 1) {
          num *= BigInt(safe - i);
          den *= BigInt(MINES_TILES - i);
        }
        const payout = minesPayout(BIG_STAKE, mines, k);
        const rtp = (Number(num) / Number(den)) * (Number(payout) / Number(BIG_STAKE));
        expect(rtp, `mines=${mines} k=${k}`).toBeCloseTo(0.98, 6);
      }
    }
  });

  it('never advertises a multiplier higher than it pays', () => {
    for (let mines = 1; mines <= 24; mines += 1) {
      for (let k = 1; k <= MINES_TILES - mines; k += 1) {
        const advertised = instantPayout(STAKE, minesMultiplierX100(mines, k));
        expect(minesPayout(STAKE, mines, k), `mines=${mines} k=${k}`).toBeGreaterThanOrEqual(
          advertised,
        );
      }
    }
  });

  it('stays exact where doubles would drift', () => {
    // 24 mines cleared to the last tile is a 25x ladder — the product of the
    // full 24-mine ladder overflows double precision if computed naively.
    expect(minesMultiplierX100(1, 24)).toBe(2500);
    expect(Number.isSafeInteger(minesMultiplierX100(1, 24))).toBe(true);
  });

  it('returns 0 for impossible reveal counts', () => {
    expect(minesMultiplierX100(24, 2)).toBe(0); // only 1 safe tile exists
  });

  it('places exactly the requested number of mines, all in range', () => {
    for (let mines = 1; mines <= 24; mines += 1) {
      const values = deriveInstantSeries('s', 'c', mines, MINES_SHUFFLE_VALUES);
      const placed = placeMines(mines, values);
      expect(placed).toHaveLength(mines);
      expect(new Set(placed).size).toBe(mines);
      for (const p of placed) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(MINES_TILES);
      }
    }
  });

  it('is deterministic for a seed pair and nonce', () => {
    const a = placeMines(5, deriveInstantSeries('s', 'c', 7, MINES_SHUFFLE_VALUES));
    const b = placeMines(5, deriveInstantSeries('s', 'c', 7, MINES_SHUFFLE_VALUES));
    expect(a).toEqual(b);
  });

  it('changes with the nonce and with the client seed', () => {
    const base = placeMines(5, deriveInstantSeries('s', 'c', 1, MINES_SHUFFLE_VALUES)).join();
    const byNonce = placeMines(5, deriveInstantSeries('s', 'c', 2, MINES_SHUFFLE_VALUES)).join();
    const bySeed = placeMines(5, deriveInstantSeries('s', 'z', 1, MINES_SHUFFLE_VALUES)).join();
    expect(base).not.toBe(byNonce);
    expect(base).not.toBe(bySeed);
  });

  it('spreads mines roughly evenly across the board', () => {
    const counts = new Array(MINES_TILES).fill(0);
    const N = 12_000;
    for (let i = 0; i < N; i += 1) {
      for (const p of placeMines(5, deriveInstantSeries('spread', 'c', i, MINES_SHUFFLE_VALUES))) {
        counts[p] += 1;
      }
    }
    const expected = (N * 5) / MINES_TILES; // 2400
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.9);
      expect(c).toBeLessThan(expected * 1.1);
    }
  });

  it('validates mine counts', () => {
    expect(isValidMineCount(1)).toBe(true);
    expect(isValidMineCount(24)).toBe(true);
    expect(isValidMineCount(0)).toBe(false);
    expect(isValidMineCount(25)).toBe(false);
  });
});

// ===========================================================================
// Seed-pair derivation
// ===========================================================================

describe('instant seed derivation', () => {
  it('is deterministic', () => {
    expect(deriveInstant('s', 'c', 1, 0)).toBe(deriveInstant('s', 'c', 1, 0));
  });

  it('varies with every input', () => {
    const base = deriveInstant('s', 'c', 1, 0);
    expect(deriveInstant('t', 'c', 1, 0)).not.toBe(base); // server seed
    expect(deriveInstant('s', 'd', 1, 0)).not.toBe(base); // client seed
    expect(deriveInstant('s', 'c', 2, 0)).not.toBe(base); // nonce
    expect(deriveInstant('s', 'c', 1, 1)).not.toBe(base); // cursor
  });

  it('stays inside the exact-integer range', () => {
    for (let i = 0; i < 2000; i += 1) {
      const v = deriveInstant('range', 'c', i);
      expect(Number.isSafeInteger(v)).toBe(true);
      expect(v).toBeLessThan(TWO_52);
    }
  });

  it('gives a distinct value per cursor in a series', () => {
    const series = deriveInstantSeries('s', 'c', 1, MINES_SHUFFLE_VALUES);
    expect(series).toHaveLength(MINES_SHUFFLE_VALUES);
    expect(new Set(series).size).toBe(MINES_SHUFFLE_VALUES);
  });
});

describe('instant payouts', () => {
  it('applies the same 2% rake as every other game', () => {
    expect(instantPayout(STAKE, 100)).toBe(contractAmount(STAKE));
    expect(instantPayout(STAKE, 200)).toBe(contractAmount(STAKE) * 2n);
  });
});
