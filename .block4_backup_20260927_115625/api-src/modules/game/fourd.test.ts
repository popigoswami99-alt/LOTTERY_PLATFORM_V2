import { describe, expect, it } from 'vitest';
import {
  contractAmount,
  fourDParityOf,
  fourDRules,
  fourDSizeOfAt,
  fourDSumWays,
  type FourDResult,
} from '@lp/shared';

/**
 * 4D fairness, proved by enumerating the complete outcome space — all 10,000
 * four-digit draws — rather than sampling.
 */

const BIG = 1_000_000_00n;

function allDraws(): FourDResult[] {
  const out: FourDResult[] = [];
  for (let a = 0; a < 10; a += 1)
    for (let b = 0; b < 10; b += 1)
      for (let c = 0; c < 10; c += 1)
        for (let d = 0; d < 10; d += 1) {
          const digits = [a, b, c, d];
          out.push({ digits, sum: a + b + c + d });
        }
  return out;
}

const DRAWS = allDraws();

function fourDValue(r: FourDResult, pos: 'A' | 'B' | 'C' | 'D'): number {
  return r.digits[{ A: 0, B: 1, C: 2, D: 3 }[pos]];
}

describe('4D', () => {
  it('has exactly 10,000 equally likely draws', () => {
    expect(DRAWS).toHaveLength(10_000);
  });

  it('splits every position (A-D) Big/Small and Odd/Even exactly in half', () => {
    for (const pos of ['A', 'B', 'C', 'D'] as const) {
      const big = DRAWS.filter((r) => fourDSizeOfAt(pos, fourDValue(r, pos)) === 'big').length;
      const odd = DRAWS.filter((r) => fourDParityOf(fourDValue(r, pos)) === 'odd').length;
      expect(big, `${pos} big`).toBe(5_000);
      expect(odd, `${pos} odd`).toBe(5_000);
    }
  });

  it('splits SUM Odd/Even exactly in half despite the sum being non-uniform', () => {
    const odd = DRAWS.filter((r) => fourDParityOf(r.sum) === 'odd').length;
    expect(odd).toBe(5_000);
  });

  /**
   * The headline fact this module exists to prove: 4D's SUM Big/Small is NOT
   * a 50/50 split (unlike 5D's), because 0..36 is an odd-sized range whose
   * midpoint (18) pairs with itself under the digit-complement symmetry.
   */
  it('splits SUM Big/Small asymmetrically: 5,335 big vs 4,665 small', () => {
    const big = DRAWS.filter((r) => fourDSizeOfAt('SUM', r.sum) === 'big').length;
    const small = DRAWS.length - big;
    expect(big).toBe(5_335);
    expect(small).toBe(4_665);
  });

  it('the sum-ways table sums to 10,000 and matches direct enumeration at every value', () => {
    const ways = fourDSumWays();
    expect(ways).toHaveLength(37);
    expect(ways.reduce((a, b) => a + b, 0)).toBe(10_000);

    const bySum = new Array(37).fill(0);
    for (const r of DRAWS) bySum[r.sum] += 1;
    expect(ways).toEqual(bySum);
  });

  /**
   * RTP over the whole outcome space. Positions match Win Go exactly (88.2% /
   * 98%). SUM_SIZE's two sides are NOT the same multiplier — Small (the rarer
   * 46.65% side) pays more than Big (53.35%) — but both still land on exactly
   * 98%, the same "true odds" treatment already proven for K3 and Andar Bahar.
   */
  it('holds RTP: 88.2% on a number, 98% everywhere else including asymmetric SUM_SIZE', () => {
    const rtp = (betType: string, selection: string) => {
      let ret = 0n;
      for (const r of DRAWS) ret += fourDRules.resolve({ betType, selection, stake: BIG }, r).payout;
      return Number(ret) / (DRAWS.length * Number(BIG));
    };

    expect(rtp('A_NUMBER', '7')).toBeCloseTo(0.882, 6);
    expect(rtp('C_SIZE', 'big')).toBeCloseTo(0.98, 6);
    expect(rtp('D_PARITY', 'odd')).toBeCloseTo(0.98, 6);
    expect(rtp('SUM_PARITY', 'even')).toBeCloseTo(0.98, 6);
    expect(rtp('SUM_SIZE', 'big')).toBeCloseTo(0.98, 6);
    expect(rtp('SUM_SIZE', 'small')).toBeCloseTo(0.98, 6);
  });

  it('prices SUM_SIZE small strictly higher than big, reflecting its lower probability', () => {
    const bigOdds = fourDRules.displayOdds('SUM_SIZE', 'big');
    const smallOdds = fourDRules.displayOdds('SUM_SIZE', 'small');
    expect(smallOdds.num / smallOdds.den).toBeGreaterThan(bigOdds.num / bigOdds.den);
    // Exact values: true odds are 10000/5335 and 10000/4665, reduced.
    expect(bigOdds).toEqual({ num: 2000, den: 1067 });
    expect(smallOdds).toEqual({ num: 2000, den: 933 });
  });

  it('pays the exact odds, after the 2% rake', () => {
    const win = fourDRules.resolve({ betType: 'A_NUMBER', selection: '4', stake: BIG }, {
      digits: [4, 0, 0, 0],
      sum: 4,
    });
    expect(win.won).toBe(true);
    expect(win.payout).toBe(contractAmount(BIG) * 9n);
  });

  it('rejects the sum as an exact number and unknown positions', () => {
    expect(() => fourDRules.validateSelection('SUM_NUMBER', '5')).toThrow();
    expect(() => fourDRules.validateSelection('Z_SIZE', 'big')).toThrow();
    expect(() => fourDRules.validateSelection('A_NUMBER', '10')).toThrow();
  });
});
