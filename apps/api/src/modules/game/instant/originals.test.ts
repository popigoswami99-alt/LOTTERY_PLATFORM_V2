import { describe, expect, it } from 'vitest';
import {
  HILO_RANKS,
  KENO_DRAWN,
  KENO_DRAW_VALUES,
  KENO_POOL,
  PLINKO_RISKS,
  PLINKO_ROWS,
  binomial,
  cardFromValue,
  cardLabel,
  contractAmount,
  hiloCompound,
  hiloMultiplierX100,
  hiloPayout,
  hiloStepOdds,
  hiloWinCount,
  hiloWins,
  isTrivialCall,
  isValidKenoPicks,
  kenoDraw,
  kenoHits,
  kenoPayout,
  kenoPaytable,
  kenoThreshold,
  kenoWays,
  plinkoBucket,
  plinkoMultipliers,
  plinkoPath,
  plinkoPayout,
  type HiloCall,
  type PlinkoRisk,
  type PlinkoRows,
} from '@lp/shared';
import { deriveInstant, deriveInstantSeries } from '../draw.js';

/** Big stake so truncation to whole paise is far below the tolerance. */
const BIG = 1_000_000_00n;

// ===========================================================================
// Plinko
// ===========================================================================

describe('Plinko', () => {
  it('produces one bucket per row count, plus one', () => {
    for (const rows of PLINKO_ROWS) {
      for (const risk of PLINKO_RISKS) {
        expect(plinkoMultipliers(rows, risk)).toHaveLength(rows + 1);
      }
    }
  });

  it('is symmetric about the centre', () => {
    for (const rows of PLINKO_ROWS) {
      for (const risk of PLINKO_RISKS) {
        const m = plinkoMultipliers(rows, risk);
        for (let k = 0; k <= rows; k += 1) expect(m[k]).toBe(m[rows - k]);
      }
    }
  });

  it('pays the edges more than the centre', () => {
    for (const rows of PLINKO_ROWS) {
      for (const risk of PLINKO_RISKS) {
        const m = plinkoMultipliers(rows, risk);
        expect(m[0]).toBeGreaterThan(m[rows / 2]);
      }
    }
  });

  it('makes higher risk pay bigger edges and a colder centre', () => {
    const low = plinkoMultipliers(16, 'low');
    const high = plinkoMultipliers(16, 'high');
    expect(high[0]).toBeGreaterThan(low[0]);
    expect(high[8]).toBeLessThan(low[8]);
  });

  /**
   * The point of generating the table rather than hand-writing it: RTP is
   * exactly 98% for every rows/risk combination, so a risk level changes
   * variance and nothing else.
   */
  it('holds RTP at exactly 98% for every rows and risk', () => {
    for (const rows of PLINKO_ROWS) {
      for (const risk of PLINKO_RISKS) {
        const total = 2 ** rows;
        let ev = 0;
        for (let k = 0; k <= rows; k += 1) {
          const p = Number(binomial(rows, k)) / total;
          ev += p * Number(plinkoPayout(BIG, rows, risk, k));
        }
        expect(ev / Number(BIG), `${rows}/${risk}`).toBeCloseTo(0.98, 5);
      }
    }
  });

  it('derives a reproducible path of the right length', () => {
    for (const rows of PLINKO_ROWS) {
      const path = plinkoPath(deriveInstant('s', 'c', 1), rows);
      expect(path).toHaveLength(rows);
      expect(plinkoPath(deriveInstant('s', 'c', 1), rows)).toEqual(path);
    }
  });

  it('lands in the bucket its path says', () => {
    const path = [true, false, true, true, false, false, true, true];
    expect(plinkoBucket(path)).toBe(5);
    expect(plinkoBucket(new Array(8).fill(false))).toBe(0);
    expect(plinkoBucket(new Array(8).fill(true))).toBe(8);
  });

  it('lands near the centre far more often than the edges', () => {
    const counts = new Array(17).fill(0);
    for (let i = 0; i < 20_000; i += 1) {
      counts[plinkoBucket(plinkoPath(deriveInstant('plinko', 'c', i), 16))] += 1;
    }
    expect(counts[8]).toBeGreaterThan(counts[0] * 50);
    // Binomial(16, 0.5) puts ~19.6% in the centre bucket.
    expect(counts[8] / 20_000).toBeGreaterThan(0.16);
    expect(counts[8] / 20_000).toBeLessThan(0.24);
  });

  it('never advertises a multiplier higher than it pays', () => {
    for (const rows of PLINKO_ROWS) {
      for (const risk of PLINKO_RISKS) {
        const m = plinkoMultipliers(rows, risk);
        for (let k = 0; k <= rows; k += 1) {
          const advertised = (contractAmount(BIG) * BigInt(m[k])) / 100n;
          expect(plinkoPayout(BIG, rows, risk, k)).toBeGreaterThanOrEqual(advertised);
        }
      }
    }
  });
});

// ===========================================================================
// Keno
// ===========================================================================

describe('Keno', () => {
  it('validates picks', () => {
    expect(isValidKenoPicks([1, 2, 3])).toBe(true);
    expect(isValidKenoPicks([])).toBe(false);
    expect(isValidKenoPicks([1, 1])).toBe(false); // duplicates
    expect(isValidKenoPicks([0])).toBe(false);
    expect(isValidKenoPicks([41])).toBe(false);
    expect(isValidKenoPicks(Array.from({ length: 11 }, (_, i) => i + 1))).toBe(false);
  });

  it('has hit-count ways that sum to C(40,10)', () => {
    for (let picks = 1; picks <= 10; picks += 1) {
      let sum = 0n;
      for (let h = 0; h <= Math.min(picks, KENO_DRAWN); h += 1) sum += kenoWays(picks, h);
      expect(sum, `picks ${picks}`).toBe(binomial(KENO_POOL, KENO_DRAWN));
    }
  });

  it('pays nothing below the threshold and something at it', () => {
    for (let picks = 1; picks <= 10; picks += 1) {
      const t = kenoThreshold(picks);
      const table = kenoPaytable(picks);
      for (let h = 0; h < t; h += 1) expect(table[h], `picks ${picks} hits ${h}`).toBe(0);
      expect(table[t], `picks ${picks} hits ${t}`).toBeGreaterThan(0);
    }
  });

  it('pays more for more hits', () => {
    for (let picks = 3; picks <= 10; picks += 1) {
      const table = kenoPaytable(picks);
      for (let h = kenoThreshold(picks); h < table.length - 1; h += 1) {
        expect(table[h + 1]).toBeGreaterThan(table[h]);
      }
    }
  });

  it('prices a single pick at exactly 4x', () => {
    // 10 drawn from 40 = 25% chance; fair odds are 4x.
    expect(kenoPaytable(1)[1]).toBe(400);
  });

  it('holds RTP at exactly 98% for every pick count', () => {
    const totalWays = Number(binomial(KENO_POOL, KENO_DRAWN));
    for (let picks = 1; picks <= 10; picks += 1) {
      let ev = 0;
      for (let h = 0; h <= Math.min(picks, KENO_DRAWN); h += 1) {
        const p = Number(kenoWays(picks, h)) / totalWays;
        ev += p * Number(kenoPayout(BIG, picks, h));
      }
      expect(ev / Number(BIG), `picks ${picks}`).toBeCloseTo(0.98, 5);
    }
  });

  it('draws ten distinct balls in range', () => {
    for (let i = 0; i < 300; i += 1) {
      const drawn = kenoDraw(deriveInstantSeries('k', 'c', i, KENO_DRAW_VALUES));
      expect(drawn).toHaveLength(KENO_DRAWN);
      expect(new Set(drawn).size).toBe(KENO_DRAWN);
      for (const n of drawn) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(KENO_POOL);
      }
    }
  });

  it('is reproducible and varies with the nonce', () => {
    const a = kenoDraw(deriveInstantSeries('k', 'c', 5, KENO_DRAW_VALUES));
    expect(kenoDraw(deriveInstantSeries('k', 'c', 5, KENO_DRAW_VALUES))).toEqual(a);
    expect(kenoDraw(deriveInstantSeries('k', 'c', 6, KENO_DRAW_VALUES))).not.toEqual(a);
  });

  it('draws every ball with roughly equal frequency', () => {
    const counts = new Array(KENO_POOL + 1).fill(0);
    const N = 8_000;
    for (let i = 0; i < N; i += 1) {
      for (const n of kenoDraw(deriveInstantSeries('kspread', 'c', i, KENO_DRAW_VALUES))) {
        counts[n] += 1;
      }
    }
    const expected = (N * KENO_DRAWN) / KENO_POOL;
    for (let n = 1; n <= KENO_POOL; n += 1) {
      expect(counts[n], `ball ${n}`).toBeGreaterThan(expected * 0.9);
      expect(counts[n], `ball ${n}`).toBeLessThan(expected * 1.1);
    }
  });

  it('counts hits as the intersection of picks and draw', () => {
    expect(kenoHits([1, 2, 3], [2, 3, 9])).toEqual([2, 3]);
    expect(kenoHits([5], [1, 2])).toEqual([]);
  });
});

// ===========================================================================
// Hi-Lo
// ===========================================================================

describe('Hi-Lo', () => {
  it('maps values onto a 52-card deck', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 52; i += 1) {
      const c = cardFromValue(i);
      expect(c.rank).toBeGreaterThanOrEqual(1);
      expect(c.rank).toBeLessThanOrEqual(13);
      expect(c.suit).toBeGreaterThanOrEqual(0);
      expect(c.suit).toBeLessThan(4);
      seen.add(`${c.rank}-${c.suit}`);
    }
    expect(seen.size).toBe(52);
  });

  it('labels cards', () => {
    expect(cardLabel({ rank: 1, suit: 0 })).toBe('A♠');
    expect(cardLabel({ rank: 13, suit: 1 })).toBe('K♥');
  });

  it('counts winning outcomes with ties going to the caller', () => {
    // Higher-or-equal on a 7: ranks 7..13 = 7 outcomes.
    expect(hiloWinCount(7, 'higher')).toBe(7);
    // Lower-or-equal on a 7: ranks 1..7 = 7 outcomes.
    expect(hiloWinCount(7, 'lower')).toBe(7);
    // The two always overlap on exactly the tie.
    for (let r = 1; r <= 13; r += 1) {
      expect(hiloWinCount(r, 'higher') + hiloWinCount(r, 'lower')).toBe(HILO_RANKS + 1);
    }
  });

  it('agrees with an exhaustive check of every rank pair', () => {
    for (let shown = 1; shown <= 13; shown += 1) {
      for (const call of ['higher', 'lower'] as HiloCall[]) {
        let wins = 0;
        for (let next = 1; next <= 13; next += 1) {
          if (hiloWins({ rank: shown, suit: 0 }, { rank: next, suit: 1 }, call)) wins += 1;
        }
        expect(wins, `${shown} ${call}`).toBe(hiloWinCount(shown, call));
      }
    }
  });

  it('flags certain calls so they are never offered', () => {
    expect(isTrivialCall(1, 'higher')).toBe(true); // everything is >= A
    expect(isTrivialCall(13, 'lower')).toBe(true); // everything is <= K
    expect(isTrivialCall(7, 'higher')).toBe(false);
  });

  it('prices each step at the exact inverse of its odds', () => {
    for (let r = 1; r <= 13; r += 1) {
      for (const call of ['higher', 'lower'] as HiloCall[]) {
        const o = hiloStepOdds(r, call);
        expect(Number(o.num) / Number(o.den)).toBeCloseTo(13 / hiloWinCount(r, call), 10);
      }
    }
  });

  /** Every single step is fair, so any run of them is too. */
  it('holds RTP at exactly 98% for every single call', () => {
    for (let r = 1; r <= 13; r += 1) {
      for (const call of ['higher', 'lower'] as HiloCall[]) {
        if (isTrivialCall(r, call)) continue;
        const p = hiloWinCount(r, call) / 13;
        const payout = Number(hiloPayout(BIG, [{ rank: r, call }]));
        expect((p * payout) / Number(BIG), `${r} ${call}`).toBeCloseTo(0.98, 5);
      }
    }
  });

  it('holds RTP at 98% across a compounded run', () => {
    const steps: Array<{ rank: number; call: HiloCall }> = [
      { rank: 7, call: 'higher' },
      { rank: 9, call: 'lower' },
      { rank: 4, call: 'higher' },
      { rank: 11, call: 'lower' },
    ];
    const p = steps.reduce((acc, s) => acc * (hiloWinCount(s.rank, s.call) / 13), 1);
    const payout = Number(hiloPayout(BIG, steps));
    expect((p * payout) / Number(BIG)).toBeCloseTo(0.98, 5);
  });

  it('compounds without drifting over a long run', () => {
    const steps = Array.from({ length: 20 }, () => ({ rank: 7, call: 'higher' as HiloCall }));
    const { num, den } = hiloCompound(steps);
    // (13/7)^20 exactly.
    expect(num).toBe(13n ** 20n);
    expect(den).toBe(7n ** 20n);
  });

  it('starts at 1.00x with no calls made', () => {
    expect(hiloMultiplierX100([])).toBe(100);
  });

  it('deals reproducibly from the seed pair cursor', () => {
    const a = cardFromValue(deriveInstant('s', 'c', 3, 1));
    expect(cardFromValue(deriveInstant('s', 'c', 3, 1))).toEqual(a);
    expect(cardFromValue(deriveInstant('s', 'c', 3, 2))).not.toEqual(
      cardFromValue(deriveInstant('s', 'c', 3, 1)),
    );
  });

  it('deals every rank with roughly equal frequency', () => {
    const counts = new Array(14).fill(0);
    for (let i = 0; i < 26_000; i += 1) counts[cardFromValue(deriveInstant('h', 'c', i)).rank] += 1;
    const expected = 26_000 / 13;
    for (let r = 1; r <= 13; r += 1) {
      expect(counts[r], `rank ${r}`).toBeGreaterThan(expected * 0.88);
      expect(counts[r], `rank ${r}`).toBeLessThan(expected * 1.12);
    }
  });
});
