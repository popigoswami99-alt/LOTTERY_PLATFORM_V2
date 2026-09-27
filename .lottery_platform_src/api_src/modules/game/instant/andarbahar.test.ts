import { describe, expect, it } from 'vitest';
import {
  AB_COUNTS,
  AB_DECK,
  AB_SHUFFLE_VALUES,
  abCardFromIndex,
  abDeal,
  abMultiplierX100,
  abOdds,
  abPayout,
  abShuffle,
  binomial,
  contractAmount,
  firstSideFor,
  isBlack,
  otherSide,
  type ABSide,
} from '@lp/shared';
import { deriveInstantSeries } from '../draw.js';

const BIG = 1_000_000_00n; // large stake so paisa truncation is noise

const deckFor = (nonce: number) =>
  abShuffle(deriveInstantSeries('ab-seed', 'client', nonce, AB_SHUFFLE_VALUES));

describe('Andar Bahar — deck', () => {
  it('maps indices onto a full 52-card deck', () => {
    const seen = new Set<string>();
    for (let i = 0; i < AB_DECK; i += 1) {
      const c = abCardFromIndex(i);
      expect(c.rank).toBeGreaterThanOrEqual(1);
      expect(c.rank).toBeLessThanOrEqual(13);
      expect(c.suit).toBeGreaterThanOrEqual(0);
      expect(c.suit).toBeLessThan(4);
      seen.add(`${c.rank}-${c.suit}`);
    }
    expect(seen.size).toBe(52);
  });

  it('has exactly four cards of every rank', () => {
    const byRank = new Map<number, number>();
    for (let i = 0; i < AB_DECK; i += 1) {
      const r = abCardFromIndex(i).rank;
      byRank.set(r, (byRank.get(r) ?? 0) + 1);
    }
    expect(byRank.size).toBe(13);
    for (const [, n] of byRank) expect(n).toBe(4);
  });

  it('shuffles into a permutation, never a duplicate or a loss', () => {
    for (let n = 0; n < 200; n += 1) {
      const deck = deckFor(n);
      expect(deck).toHaveLength(AB_DECK);
      expect(new Set(deck).size).toBe(AB_DECK);
    }
  });

  it('is reproducible and varies with the nonce', () => {
    expect(deckFor(7)).toEqual(deckFor(7));
    expect(deckFor(7)).not.toEqual(deckFor(8));
  });

  it('splits the deck into two black suits and two red', () => {
    let black = 0;
    for (let i = 0; i < AB_DECK; i += 1) if (isBlack(abCardFromIndex(i))) black += 1;
    expect(black).toBe(26);
  });
});

describe('Andar Bahar — dealing', () => {
  it('sends the first card to Andar on a black joker, Bahar on a red one', () => {
    expect(firstSideFor({ rank: 5, suit: 0 })).toBe('andar'); // spades
    expect(firstSideFor({ rank: 5, suit: 3 })).toBe('andar'); // clubs
    expect(firstSideFor({ rank: 5, suit: 1 })).toBe('bahar'); // hearts
    expect(firstSideFor({ rank: 5, suit: 2 })).toBe('bahar'); // diamonds
  });

  it('always finds a match — three of the remaining 51 share the rank', () => {
    for (let n = 0; n < 400; n += 1) {
      const hand = abDeal(deckFor(n));
      expect(hand.winner === 'andar' || hand.winner === 'bahar').toBe(true);
      expect(hand.matchAt).toBeGreaterThanOrEqual(1);
      expect(hand.matchAt).toBeLessThanOrEqual(51);
    }
  });

  it('deals alternately, starting with the side the joker chose', () => {
    for (let n = 0; n < 200; n += 1) {
      const h = abDeal(deckFor(n));
      const firstPile = h.firstSide === 'andar' ? h.andar : h.bahar;
      const secondPile = h.firstSide === 'andar' ? h.bahar : h.andar;
      // The first pile leads by one card, or they are level.
      expect(firstPile.length - secondPile.length === 1 || firstPile.length === secondPile.length)
        .toBe(true);
      expect(firstPile.length + secondPile.length).toBe(h.matchAt);
    }
  });

  it('ends the moment a rank matches, and only the last card matches', () => {
    for (let n = 0; n < 300; n += 1) {
      const h = abDeal(deckFor(n));
      const winningPile = h.winner === 'andar' ? h.andar : h.bahar;
      const losingPile = h.winner === 'andar' ? h.bahar : h.andar;

      expect(winningPile[winningPile.length - 1].rank).toBe(h.joker.rank);
      // No earlier card on either pile may match.
      for (const c of winningPile.slice(0, -1)) expect(c.rank).not.toBe(h.joker.rank);
      for (const c of losingPile) expect(c.rank).not.toBe(h.joker.rank);
    }
  });

  it('never deals the joker itself into a pile', () => {
    for (let n = 0; n < 200; n += 1) {
      const deck = deckFor(n);
      const h = abDeal(deck);
      const dealt = [...h.andar, ...h.bahar];
      // The joker is deck[0]; every dealt card comes from deck[1..].
      const jokerExact = abCardFromIndex(deck[0]);
      const sameCard = dealt.filter(
        (c) => c.rank === jokerExact.rank && c.suit === jokerExact.suit,
      );
      expect(sameCard).toHaveLength(0);
    }
  });
});

describe('Andar Bahar — the first-side edge', () => {
  it('derives the exact winning-position counts', () => {
    // Earliest of 3 marked cards among 51 lands at k with C(51-k,2)/C(51,3).
    expect(AB_COUNTS.total).toBe(binomial(51, 3));
    expect(AB_COUNTS.first + AB_COUNTS.second).toBe(AB_COUNTS.total);
    expect(AB_COUNTS.first).toBe(10725n);
    expect(AB_COUNTS.second).toBe(10100n);
  });

  it('puts the first side at ~51.5% and the second at ~48.5%', () => {
    const p1 = Number(AB_COUNTS.first) / Number(AB_COUNTS.total);
    const p2 = Number(AB_COUNTS.second) / Number(AB_COUNTS.total);
    expect(p1).toBeCloseTo(0.515, 3);
    expect(p2).toBeCloseTo(0.485, 3);
    expect(p1).toBeGreaterThan(p2); // going first is a genuine edge
  });

  /**
   * The theory above is only worth anything if the actual dealer agrees with
   * it, so this deals real hands and checks the split empirically.
   */
  it('matches the theoretical split when hands are actually dealt', () => {
    // Each hand costs 51 HMACs, so the sample is sized to keep the suite quick
    // while still resolving a 3% gap: 4 sigma here is ±1.4%.
    const N = 20_000;
    let firstWins = 0;
    for (let n = 0; n < N; n += 1) {
      const h = abDeal(deckFor(n));
      if (h.winner === h.firstSide) firstWins += 1;
    }
    const observed = firstWins / N;
    const expected = Number(AB_COUNTS.first) / Number(AB_COUNTS.total);
    const sigma = Math.sqrt((expected * (1 - expected)) / N);
    expect(Math.abs(observed - expected)).toBeLessThan(4 * sigma);
  });

  it('picks each side as the first side about half the time', () => {
    const N = 8_000;
    let andarFirst = 0;
    for (let n = 0; n < N; n += 1) if (abDeal(deckFor(n)).firstSide === 'andar') andarFirst += 1;
    expect(andarFirst / N).toBeGreaterThan(0.47);
    expect(andarFirst / N).toBeLessThan(0.53);
  });
});

describe('Andar Bahar — payouts', () => {
  it('pays the long side more than the short side', () => {
    expect(abMultiplierX100('bahar', 'andar')).toBeGreaterThan(
      abMultiplierX100('andar', 'andar'),
    );
    // ~1.94x for the side dealt first, ~2.06x for the other.
    expect(abMultiplierX100('andar', 'andar')).toBe(194);
    expect(abMultiplierX100('bahar', 'andar')).toBe(206);
  });

  it('quotes odds as the exact inverse of each side probability', () => {
    for (const first of ['andar', 'bahar'] as ABSide[]) {
      const o1 = abOdds(first, first);
      const o2 = abOdds(otherSide(first), first);
      expect(Number(o1.num) / Number(o1.den)).toBeCloseTo(
        Number(AB_COUNTS.total) / Number(AB_COUNTS.first),
        10,
      );
      expect(Number(o2.num) / Number(o2.den)).toBeCloseTo(
        Number(AB_COUNTS.total) / Number(AB_COUNTS.second),
        10,
      );
    }
  });

  it('pays nothing to the losing side', () => {
    expect(abPayout(BIG, 'andar', 'andar', 'bahar')).toBe(0n);
    expect(abPayout(BIG, 'bahar', 'andar', 'andar')).toBe(0n);
  });

  /**
   * The headline property: both sides carry exactly the same 98% RTP, so
   * choosing the long side buys variance rather than value.
   */
  it('gives BOTH sides exactly 98% RTP', () => {
    for (const first of ['andar', 'bahar'] as ABSide[]) {
      for (const pick of ['andar', 'bahar'] as ABSide[]) {
        const winCount = pick === first ? AB_COUNTS.first : AB_COUNTS.second;
        const p = Number(winCount) / Number(AB_COUNTS.total);
        const payout = Number(abPayout(BIG, pick, first, pick));
        expect((p * payout) / Number(BIG), `first=${first} pick=${pick}`).toBeCloseTo(0.98, 5);
      }
    }
  });

  it('never advertises a multiplier higher than it pays', () => {
    for (const first of ['andar', 'bahar'] as ABSide[]) {
      for (const pick of ['andar', 'bahar'] as ABSide[]) {
        const advertised = (contractAmount(BIG) * BigInt(abMultiplierX100(pick, first))) / 100n;
        expect(abPayout(BIG, pick, first, pick)).toBeGreaterThanOrEqual(advertised);
      }
    }
  });

  it('holds RTP across a long simulated run of real hands', () => {
    const N = 8_000;
    const STAKE = 10_000n;
    let staked = 0n;
    let returned = 0n;

    for (let n = 0; n < N; n += 1) {
      const h = abDeal(deckFor(n));
      // Always back Andar — the side alternates between first and second, so
      // this exercises both odds tiers.
      staked += STAKE;
      returned += abPayout(STAKE, 'andar', h.firstSide, h.winner);
    }

    const rtp = Number(returned) / Number(staked);
    expect(rtp).toBeGreaterThan(0.95);
    expect(rtp).toBeLessThan(1.01);
  });
});
