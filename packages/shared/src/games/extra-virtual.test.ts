import { describe, expect, it } from 'vitest';
import {
  rouletteRules,
  blackjackRules,
  teenPattiRules,
  slotsRules,
  fishingRules,
} from './extra-virtual.js';

describe('extra virtual games', () => {
  it('roulette resolves number bets', () => {
    const r=rouletteRules.buildResult([7]);
    const o=rouletteRules.resolve({betType:'NUMBER',selection:'7',stake:1000n},r);
    expect(o.won).toBe(true);
    expect(o.payout).toBeGreaterThan(0n);
  });

  it('blackjack resolves outcomes', () => {
    const r=blackjackRules.buildResult([0]);
    expect(blackjackRules.resolve(
      {betType:'RESULT',selection:'PLAYER',stake:1000n},r
    ).won).toBe(true);
  });

  it('teen patti resolves outcomes', () => {
    const r=teenPattiRules.buildResult([1]);
    expect(teenPattiRules.resolve(
      {betType:'RESULT',selection:'BANKER',stake:1000n},r
    ).won).toBe(true);
  });

  it('slots resolves symbols', () => {
    const r=slotsRules.buildResult([4]);
    expect(r.label).toBe('SEVEN');
    expect(slotsRules.resolve(
      {betType:'SYMBOL',selection:'SEVEN',stake:1000n},r
    ).won).toBe(true);
  });

  it('fishing resolves targets', () => {
    const r=fishingRules.buildResult([2]);
    expect(r.label).toBe('FISH_3');
    expect(fishingRules.resolve(
      {betType:'TARGET',selection:'FISH_3',stake:1000n},r
    ).won).toBe(true);
  });
});
