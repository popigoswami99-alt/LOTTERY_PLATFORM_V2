import { describe, expect, it } from 'vitest';
import {
  DT_COUNTS,
  DT_DECK,
  DT_DRAW_VALUES,
  DT_SIDES,
  abCardFromIndex,
  contractAmount,
  dtDraw,
  dtMultiplierX100,
  dtOdds,
  dtPayout,
  dtWinner,
  isValidDTSide,
  type DTSide,
} from '@lp/shared';
import { deriveInstantSeries } from '../draw.js';

const BIG = 1_000_000_00n;

const drawFor = (nonce: number) =>
  dtDraw(deriveInstantSeries('dt-seed', 'client', nonce, DT_DRAW_VALUES));

/** Every ordered pair of distinct cards — the complete outcome space. */
function allDraws() {
  const out: Array<{ dragon: ReturnType<typeof abCardFromIndex>; tiger: ReturnType<typeof abCardFromIndex> }> = [];
  for (let a = 0; a < DT_DECK; a += 1) {
    for (let b = 0; b < DT_DECK; b += 1) {
      if (a === b) continue;
      out.push({ dragon: abCardFromIndex(a), tiger: abCardFromIndex(b) });
    }
  }
  return out;
}

describe('Dragon Tiger — outcome space', () => {
  it('has 2652 ordered pairs of distinct cards', () => {
    expect(allDraws()).toHaveLength(2652);
    expect(DT_COUNTS.total).toBe(2652n);
  });

  /** Counts are derived in the module; this checks them by brute force. */
  it('splits exactly as the derived counts say', () => {
    let dragon = 0;
    let tiger = 0;
    let tie = 0;
    for (const d of allDraws()) {
      const w = dtWinner(d);
      if (w === 'dragon') dragon += 1;
      else if (w === 'tiger') tiger += 1;
      else tie += 1;
    }

    expect(BigInt(dragon)).toBe(DT_COUNTS.dragon);
    expect(BigInt(tiger)).toBe(DT_COUNTS.tiger);
    expect(BigInt(tie)).toBe(DT_COUNTS.tie);
    expect(dragon + tiger + tie).toBe(2652);

    // 8/17, 8/17, 1/17
    expect(dragon).toBe(1248);
    expect(tiger).toBe(1248);
    expect(tie).toBe(156);
  });

  it('is symmetric between the two sides', () => {
    expect(DT_COUNTS.dragon).toBe(DT_COUNTS.tiger);
  });

  it('puts a tie at 1 in 17', () => {
    expect(Number(DT_COUNTS.tie) / Number(DT_COUNTS.total)).toBeCloseTo(1 / 17, 10);
  });
});

describe('Dragon Tiger — deciding a hand', () => {
  it('gives the win to the higher rank, with Ace low and King high', () => {
    expect(dtWinner({ dragon: { rank: 13, suit: 0 }, tiger: { rank: 1, suit: 1 } })).toBe('dragon');
    expect(dtWinner({ dragon: { rank: 1, suit: 0 }, tiger: { rank: 13, suit: 1 } })).toBe('tiger');
    expect(dtWinner({ dragon: { rank: 2, suit: 0 }, tiger: { rank: 1, suit: 1 } })).toBe('dragon');
  });

  it('calls equal ranks a tie regardless of suit', () => {
    for (let suitA = 0; suitA < 4; suitA += 1) {
      for (let suitB = 0; suitB < 4; suitB += 1) {
        if (suitA === suitB) continue;
        expect(dtWinner({ dragon: { rank: 7, suit: suitA }, tiger: { rank: 7, suit: suitB } })).toBe(
          'tie',
        );
      }
    }
  });
});

describe('Dragon Tiger — dealing', () => {
  it('never deals the same card twice', () => {
    for (let n = 0; n < 5_000; n += 1) {
      const d = drawFor(n);
      const same = d.dragon.rank === d.tiger.rank && d.dragon.suit === d.tiger.suit;
      expect(same, `nonce ${n}`).toBe(false);
    }
  });

  it('keeps both cards inside the deck', () => {
    for (let n = 0; n < 2_000; n += 1) {
      for (const c of [drawFor(n).dragon, drawFor(n).tiger]) {
        expect(c.rank).toBeGreaterThanOrEqual(1);
        expect(c.rank).toBeLessThanOrEqual(13);
        expect(c.suit).toBeGreaterThanOrEqual(0);
        expect(c.suit).toBeLessThan(4);
      }
    }
  });

  it('is reproducible and varies with the nonce', () => {
    expect(drawFor(11)).toEqual(drawFor(11));
    expect(drawFor(11)).not.toEqual(drawFor(12));
  });

  it('deals every card with roughly equal frequency', () => {
    const counts = new Array(DT_DECK).fill(0);
    const N = 20_000;
    for (let n = 0; n < N; n += 1) {
      const d = drawFor(n);
      counts[(d.dragon.rank - 1) * 4 + d.dragon.suit] += 1;
      counts[(d.tiger.rank - 1) * 4 + d.tiger.suit] += 1;
    }
    const expected = (N * 2) / DT_DECK;
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.85);
      expect(c).toBeLessThan(expected * 1.15);
    }
  });

  it('produces the three outcomes at close to their true rates', () => {
    const N = 20_000;
    const seen: Record<DTSide, number> = { dragon: 0, tiger: 0, tie: 0 };
    for (let n = 0; n < N; n += 1) seen[dtWinner(drawFor(n))] += 1;

    for (const side of DT_SIDES) {
      const expected = Number(dtOdds(side).den) / Number(DT_COUNTS.total);
      const observed = seen[side] / N;
      const sigma = Math.sqrt((expected * (1 - expected)) / N);
      expect(Math.abs(observed - expected), side).toBeLessThan(4 * sigma);
    }
  });
});

describe('Dragon Tiger — payouts', () => {
  it('quotes 2.12x on the sides and 17x on the tie', () => {
    // True odds are 17/8 = 2.125 and 17/1; display rounds DOWN.
    expect(dtMultiplierX100('dragon')).toBe(212);
    expect(dtMultiplierX100('tiger')).toBe(212);
    expect(dtMultiplierX100('tie')).toBe(1700);
  });

  it('pays nothing to a side that did not win', () => {
    expect(dtPayout(BIG, 'dragon', 'tiger')).toBe(0n);
    expect(dtPayout(BIG, 'dragon', 'tie')).toBe(0n);
    expect(dtPayout(BIG, 'tie', 'dragon')).toBe(0n);
  });

  it('loses a Dragon or Tiger bet on a tie — there is no half-stake rule', () => {
    expect(dtPayout(BIG, 'dragon', 'tie')).toBe(0n);
    expect(dtPayout(BIG, 'tiger', 'tie')).toBe(0n);
  });

  /**
   * The headline property, checked against the exhaustive outcome space rather
   * than a sample: every one of the three bets returns exactly 98%.
   */
  it('gives all three bets exactly 98% RTP over the full outcome space', () => {
    const draws = allDraws();
    for (const side of DT_SIDES) {
      let returned = 0n;
      for (const d of draws) returned += dtPayout(BIG, side, dtWinner(d));
      const rtp = Number(returned) / (Number(BIG) * draws.length);
      expect(rtp, side).toBeCloseTo(0.98, 5);
    }
  });

  it('never advertises a multiplier higher than it pays', () => {
    for (const side of DT_SIDES) {
      const advertised = (contractAmount(BIG) * BigInt(dtMultiplierX100(side))) / 100n;
      expect(dtPayout(BIG, side, side), side).toBeGreaterThanOrEqual(advertised);
    }
  });

  it('validates sides', () => {
    expect(isValidDTSide('dragon')).toBe(true);
    expect(isValidDTSide('tiger')).toBe(true);
    expect(isValidDTSide('tie')).toBe(true);
    expect(isValidDTSide('phoenix')).toBe(false);
    expect(isValidDTSide('')).toBe(false);
  });
});
