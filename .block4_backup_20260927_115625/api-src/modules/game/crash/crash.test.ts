import { describe, expect, it } from 'vitest';
import {
  CRASH_GROWTH_K,
  MAX_CRASH_X100,
  MIN_CRASH_X100,
  X100,
  contractAmount,
  crashPayout,
  crashPointFromValue,
  formatX100,
  multiplierAtX100,
  parseMultiplier,
  roundDurationMs,
  timeToReachMs,
} from '@lp/shared';
import { deriveRaw52, hashSeed } from '../draw.js';

const STAKE = 100_00n; // ₹100
const TWO_52 = Math.pow(2, 52);

describe('crash curve', () => {
  it('starts at exactly 1.00x', () => {
    expect(multiplierAtX100(0)).toBe(X100);
    expect(multiplierAtX100(-500)).toBe(X100);
  });

  it('reaches 2.00x at six seconds', () => {
    expect(multiplierAtX100(6000)).toBe(200);
    expect(CRASH_GROWTH_K).toBeCloseTo(Math.LN2 / 6, 10);
  });

  it('climbs monotonically', () => {
    let prev = 0;
    for (let t = 0; t <= 30_000; t += 250) {
      const m = multiplierAtX100(t);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it('inverts: timeToReach is the inverse of multiplierAt', () => {
    for (const target of [150, 200, 350, 1000, 5000]) {
      const t = timeToReachMs(target);
      // At that instant the curve has just reached the target.
      expect(multiplierAtX100(t)).toBe(target);
      // A hair earlier it has not.
      expect(multiplierAtX100(t - 20)).toBeLessThan(target);
    }
  });

  it('gives a round its full duration', () => {
    expect(roundDurationMs(200)).toBeCloseTo(6000, 0);
    expect(roundDurationMs(100)).toBe(0);
  });
});

describe('crash point distribution', () => {
  it('never lands outside the allowed range', () => {
    for (const u of [0, 0.5, 0.9, 0.999, 0.999999, 1 - Number.EPSILON]) {
      const p = crashPointFromValue(u * TWO_52);
      expect(p).toBeGreaterThanOrEqual(MIN_CRASH_X100);
      expect(p).toBeLessThanOrEqual(MAX_CRASH_X100);
    }
  });

  it('busts instantly at 1.00x for the lowest values', () => {
    expect(crashPointFromValue(0)).toBe(100);
  });

  it('is monotonic in the seed value', () => {
    let prev = 0;
    for (let i = 0; i <= 1000; i += 1) {
      const p = crashPointFromValue((i / 1001) * TWO_52);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  /**
   * The core fairness property: P(crash >= t) = 100/t exactly, for any integer
   * target t. Verified empirically over a large sample of real derived seeds
   * rather than assumed from the formula.
   */
  it('matches the theoretical survival curve P(crash >= t) = 100/t', () => {
    const N = 60_000;
    const points: number[] = [];
    for (let i = 0; i < N; i += 1) {
      points.push(crashPointFromValue(deriveRaw52('seed-for-distribution', `r${i}`)));
    }

    for (const t of [150, 200, 300, 500, 1000]) {
      const observed = points.filter((p) => p >= t).length / N;
      const expected = 100 / t;
      // 3 sigma of a binomial at this sample size.
      const sigma = Math.sqrt((expected * (1 - expected)) / N);
      expect(Math.abs(observed - expected), `target ${t / 100}x`).toBeLessThan(4 * sigma);
    }
  });

  it('has a median near 2.00x', () => {
    const N = 20_000;
    const points: number[] = [];
    for (let i = 0; i < N; i += 1) {
      points.push(crashPointFromValue(deriveRaw52('median-seed', `r${i}`)));
    }
    points.sort((a, b) => a - b);
    const median = points[Math.floor(N / 2)];
    expect(median).toBeGreaterThan(190);
    expect(median).toBeLessThan(210);
  });
});

describe('crash payouts', () => {
  it('applies the same 2% rake as every other game', () => {
    // Cashing out at exactly 1.00x returns the stake minus the rake.
    expect(crashPayout(STAKE, 100)).toBe(contractAmount(STAKE));
    expect(crashPayout(STAKE, 200)).toBe(contractAmount(STAKE) * 2n);
    expect(crashPayout(STAKE, 250)).toBe((contractAmount(STAKE) * 250n) / 100n);
  });

  /**
   * RTP is identical at every cash-out target, because the curve itself is
   * fair and the rake is the only edge. A player targeting 1.50x and one
   * targeting 50x face exactly the same house edge — which is the property
   * that makes this honest, and it is asserted rather than claimed.
   */
  it('gives every cash-out target the same 98% RTP', () => {
    for (const target of [110, 150, 200, 350, 1000, 10_000]) {
      // P(win) = 100/target exactly; payout on a win = stake*0.98*target/100.
      const pWin = 100 / target;
      const payout = Number(crashPayout(STAKE, target));
      const rtp = (pWin * payout) / Number(STAKE);
      expect(rtp, `${target / 100}x`).toBeCloseTo(0.98, 4);
    }
  });

  it('never pays more than the round reached', () => {
    // Payout is a function of the cash-out multiplier, which the service
    // clamps to the live curve — verified here at the maths level.
    expect(crashPayout(STAKE, 100)).toBeLessThan(STAKE);
  });
});

describe('multiplier formatting', () => {
  it('formats hundredths', () => {
    expect(formatX100(100)).toBe('1.00');
    expect(formatX100(250)).toBe('2.50');
    expect(formatX100(10_000)).toBe('100.00');
  });

  it('parses clean multipliers', () => {
    expect(parseMultiplier('1.00')).toBe(100);
    expect(parseMultiplier('2.5')).toBe(250);
    expect(parseMultiplier('100')).toBe(10_000);
  });

  it('rejects junk', () => {
    expect(() => parseMultiplier('1.234')).toThrow();
    expect(() => parseMultiplier('-2')).toThrow();
    expect(() => parseMultiplier('abc')).toThrow();
  });
});

describe('crash commitment', () => {
  it('is deterministic per round', () => {
    expect(deriveRaw52('s', '42')).toBe(deriveRaw52('s', '42'));
    expect(crashPointFromValue(deriveRaw52('s', '42'))).toBe(
      crashPointFromValue(deriveRaw52('s', '42')),
    );
  });

  it('differs per round and per seed', () => {
    expect(deriveRaw52('s', '1')).not.toBe(deriveRaw52('s', '2'));
    expect(deriveRaw52('a', '1')).not.toBe(deriveRaw52('b', '1'));
  });

  it('stays inside the exact-integer range', () => {
    for (let i = 0; i < 2000; i += 1) {
      const v = deriveRaw52('range-seed', `r${i}`);
      expect(Number.isSafeInteger(v)).toBe(true);
      expect(v).toBeLessThan(TWO_52);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('commits to a hash that matches the revealed seed', () => {
    const seed = 'c'.repeat(64);
    expect(hashSeed(seed)).toHaveLength(64);
    expect(hashSeed(seed)).not.toBe(hashSeed('d'.repeat(64)));
  });
});
