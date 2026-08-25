import { describe, expect, it } from 'vitest';
import {
  contractAmount,
  fiveDRules,
  parityOf,
  sizeOfAt,
  type FiveDResult,
} from '@lp/shared';

/**
 * 5D fairness, proved by enumerating the complete outcome space — all 100,000
 * five-digit draws — rather than sampling.
 */

const BIG = 1_000_000_00n;

function allDraws(): FiveDResult[] {
  const out: FiveDResult[] = [];
  for (let a = 0; a < 10; a += 1)
    for (let b = 0; b < 10; b += 1)
      for (let c = 0; c < 10; c += 1)
        for (let d = 0; d < 10; d += 1)
          for (let e = 0; e < 10; e += 1) {
            const digits = [a, b, c, d, e];
            out.push({ digits, sum: a + b + c + d + e });
          }
  return out;
}

const DRAWS = allDraws();

describe('5D', () => {
  it('has exactly 100,000 equally likely draws', () => {
    expect(DRAWS).toHaveLength(100_000);
  });

  it('splits SUM Big/Small exactly in half', () => {
    const big = DRAWS.filter((r) => sizeOfAt('SUM', r.sum) === 'big').length;
    expect(big).toBe(50_000);
  });

  it('splits SUM Odd/Even exactly in half', () => {
    const odd = DRAWS.filter((r) => parityOf(r.sum) === 'odd').length;
    expect(odd).toBe(50_000);
  });

  it('splits every position Big/Small and Odd/Even exactly in half', () => {
    for (const pos of ['A', 'B', 'C', 'D', 'E'] as const) {
      const big = DRAWS.filter((r) => sizeOfAt(pos, fiveDValue(r, pos)) === 'big').length;
      const odd = DRAWS.filter((r) => parityOf(fiveDValue(r, pos)) === 'odd').length;
      expect(big, `${pos} big`).toBe(50_000);
      expect(odd, `${pos} odd`).toBe(50_000);
    }
  });

  /**
   * RTP over the whole outcome space: Number 88.2%, Size/Small and Parity 98%,
   * exactly as in Win Go — so a change to the odds or the rake cannot move them
   * silently.
   */
  it('holds RTP: 88.2% on a number, 98% on size and parity', () => {
    const rtp = (betType: string, selection: string) => {
      let ret = 0n;
      for (const r of DRAWS) ret += fiveDRules.resolve({ betType, selection, stake: BIG }, r).payout;
      return Number(ret) / (DRAWS.length * Number(BIG));
    };

    expect(rtp('A_NUMBER', '7')).toBeCloseTo(0.882, 6);
    expect(rtp('C_SIZE', 'big')).toBeCloseTo(0.98, 6);
    expect(rtp('E_PARITY', 'odd')).toBeCloseTo(0.98, 6);
    expect(rtp('SUM_SIZE', 'small')).toBeCloseTo(0.98, 6);
    expect(rtp('SUM_PARITY', 'even')).toBeCloseTo(0.98, 6);
  });

  it('pays the exact odds, after the 2% rake', () => {
    const win = fiveDRules.resolve({ betType: 'A_NUMBER', selection: '4', stake: BIG }, {
      digits: [4, 0, 0, 0, 0],
      sum: 4,
    });
    expect(win.won).toBe(true);
    expect(win.payout).toBe(contractAmount(BIG) * 9n);
  });

  it('rejects the sum as an exact number and unknown positions', () => {
    expect(() => fiveDRules.validateSelection('SUM_NUMBER', '5')).toThrow();
    expect(() => fiveDRules.validateSelection('Z_SIZE', 'big')).toThrow();
    expect(() => fiveDRules.validateSelection('A_NUMBER', '10')).toThrow();
  });
});

function fiveDValue(r: FiveDResult, pos: 'A' | 'B' | 'C' | 'D' | 'E'): number {
  return r.digits[{ A: 0, B: 1, C: 2, D: 3, E: 4 }[pos]];
}
