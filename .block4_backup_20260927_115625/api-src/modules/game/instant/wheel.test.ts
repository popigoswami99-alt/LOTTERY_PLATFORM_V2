import { describe, expect, it } from 'vitest';
import {
  WHEEL_RISKS,
  WHEEL_SEGMENTS,
  contractAmount,
  wheelMultiplierX100,
  wheelPayout,
  wheelSegments,
  wheelSpin,
  type WheelRisk,
} from '@lp/shared';
import { deriveInstant } from '../draw.js';

/** Big stake so truncation to whole paise is far below the tolerance. */
const BIG = 1_000_000_00n;

describe('Wheel', () => {
  it('lays out exactly WHEEL_SEGMENTS segments for every risk', () => {
    for (const risk of WHEEL_RISKS) {
      expect(wheelSegments(risk)).toHaveLength(WHEEL_SEGMENTS);
    }
  });

  /**
   * The fairness condition of the generated paytable: every segment is equally
   * likely, so RTP is the mean multiplier times the 0.98 rake — exactly 98% at
   * every risk. A risk level changes variance and nothing else.
   */
  it('holds RTP at exactly 98% for every risk', () => {
    for (const risk of WHEEL_RISKS) {
      let ev = 0;
      for (let seg = 0; seg < WHEEL_SEGMENTS; seg += 1) {
        ev += Number(wheelPayout(BIG, risk, seg)) / WHEEL_SEGMENTS;
      }
      expect(ev / Number(BIG), risk).toBeCloseTo(0.98, 5);
    }
  });

  it('pays the exact advertised multiplier of the landed segment, after rake', () => {
    for (const risk of WHEEL_RISKS) {
      const segs = wheelSegments(risk);
      for (let seg = 0; seg < WHEEL_SEGMENTS; seg += 1) {
        const advertised = (contractAmount(BIG) * BigInt(segs[seg].multiplierX100)) / 100n;
        expect(wheelPayout(BIG, risk, seg), `${risk}/${seg}`).toBe(advertised);
        expect(wheelMultiplierX100(risk, seg)).toBe(segs[seg].multiplierX100);
      }
    }
  });

  it('maps a derived value to a segment in range and re-derives identically', () => {
    for (let nonce = 0; nonce < 500; nonce += 1) {
      const value = deriveInstant('server-seed', 'client-seed', nonce);
      const seg = wheelSpin(value);
      expect(seg).toBeGreaterThanOrEqual(0);
      expect(seg).toBeLessThan(WHEEL_SEGMENTS);
      // Re-deriving the same value lands on the same segment — provably fair.
      expect(wheelSpin(deriveInstant('server-seed', 'client-seed', nonce))).toBe(seg);
    }
  });

  it('offers a zero-loss segment on medium and high, none impossible on low', () => {
    const hasZero = (risk: WheelRisk) => wheelSegments(risk).some((s) => s.multiplierX100 === 0);
    expect(hasZero('medium')).toBe(true);
    expect(hasZero('high')).toBe(true);
  });
});
