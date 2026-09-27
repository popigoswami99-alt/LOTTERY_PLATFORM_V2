import { describe, expect, it } from 'vitest';
import {
  MOTORACE_RACERS,
  contractAmount,
  isValidMotoRacePick,
  motoRaceMultiplierX100,
  motoRacePayout,
  motoRaceWinner,
} from '@lp/shared';
import { deriveInstant } from '../draw.js';

/** Big stake so truncation to whole paise is far below the tolerance. */
const BIG = 1_000_000_00n;

describe('MotoRace', () => {
  it('has 8 racers and a flat true-odds multiplier of exactly 8x', () => {
    expect(MOTORACE_RACERS).toBe(8);
    expect(motoRaceMultiplierX100()).toBe(800);
  });

  /**
   * Every racer is equally likely (1/N), so the fair multiplier is exactly N
   * and RTP is 0.98 regardless of which racer is picked — there is no
   * favourite and no long shot to price differently.
   */
  it('holds RTP at exactly 98% for every pick', () => {
    for (let pick = 0; pick < MOTORACE_RACERS; pick += 1) {
      let ev = 0;
      for (let winner = 0; winner < MOTORACE_RACERS; winner += 1) {
        ev += Number(motoRacePayout(BIG, pick, winner)) / MOTORACE_RACERS;
      }
      expect(ev / Number(BIG), `pick ${pick}`).toBeCloseTo(0.98, 6);
    }
  });

  it('pays the exact advertised multiplier only when the pick matches the winner', () => {
    const advertised = (contractAmount(BIG) * BigInt(motoRaceMultiplierX100())) / 100n;
    expect(motoRacePayout(BIG, 3, 3)).toBe(advertised);
    expect(motoRacePayout(BIG, 3, 4)).toBe(0n);
  });

  it('maps a derived value to a racer in range and re-derives identically', () => {
    for (let nonce = 0; nonce < 500; nonce += 1) {
      const value = deriveInstant('server-seed', 'client-seed', nonce);
      const winner = motoRaceWinner(value);
      expect(winner).toBeGreaterThanOrEqual(0);
      expect(winner).toBeLessThan(MOTORACE_RACERS);
      // Re-deriving the same value lands on the same winner — provably fair.
      expect(motoRaceWinner(deriveInstant('server-seed', 'client-seed', nonce))).toBe(winner);
    }
  });

  /**
   * 8 is a power of two, so unlike Wheel's 30 segments (which carries a
   * negligible-but-nonzero modulo bias against 2^52), the winner distribution
   * here has EXACTLY zero bias: 2^52 is evenly divisible by 8. Checked over
   * enough draws that a real bias — even a subtle one — would show up.
   */
  it('distributes winners with no detectable bias across 40,000 draws', () => {
    const counts = new Array(MOTORACE_RACERS).fill(0);
    for (let nonce = 0; nonce < 40_000; nonce += 1) {
      const winner = motoRaceWinner(deriveInstant('bias-check-seed', 'client-seed', nonce));
      counts[winner] += 1;
    }
    const expected = 40_000 / MOTORACE_RACERS;
    for (const c of counts) expect(c).toBeGreaterThan(expected * 0.9);
    for (const c of counts) expect(c).toBeLessThan(expected * 1.1);
  });

  it('validates picks are in range', () => {
    expect(isValidMotoRacePick(0)).toBe(true);
    expect(isValidMotoRacePick(MOTORACE_RACERS - 1)).toBe(true);
    expect(isValidMotoRacePick(MOTORACE_RACERS)).toBe(false);
    expect(isValidMotoRacePick(-1)).toBe(false);
    expect(isValidMotoRacePick(1.5)).toBe(false);
  });
});
