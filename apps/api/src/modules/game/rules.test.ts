import { describe, expect, it } from 'vitest';
import {
  ALL_ROOMS,
  BASIS,
  GAMES,
  HOUSE_FEE_BPS,
  ROOM_BY_KEY,
  coloursOf,
  contractAmount,
  formatMinor,
  k3IsTriple,
  k3Parity,
  k3Rules,
  k3Size,
  k3Sum,
  periodWindowAt,
  resolveBet,
  sizeOf,
  toMinor,
  wingoRules,
} from '@lp/shared';
import { deriveValues, hashSeed } from './draw.js';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const STAKE = 100_00n; // ₹100

/** Every one of the 216 ordered dice outcomes. */
const ALL_DICE: Array<[number, number, number]> = [];
for (let a = 1; a <= 6; a += 1)
  for (let b = 1; b <= 6; b += 1) for (let c = 1; c <= 6; c += 1) ALL_DICE.push([a, b, c]);

/** RTP of a bet, computed by brute force over an exhaustive outcome space. */
function rtpOver<T>(outcomes: T[], payout: (o: T) => bigint): number {
  const total = outcomes.reduce((acc, o) => acc + payout(o), 0n);
  return Number(total) / Number(STAKE * BigInt(outcomes.length));
}

// ===========================================================================
// Registry
// ===========================================================================

describe('engine registry', () => {
  it('registers every game with at least one room', () => {
    expect(Object.keys(GAMES).length).toBeGreaterThanOrEqual(2);
    for (const g of Object.values(GAMES)) {
      expect(g.rooms.length).toBeGreaterThan(0);
      expect(g.gameCode).toBeTruthy();
    }
  });

  it('keeps room keys globally unique', () => {
    const keys = ALL_ROOMS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('points every room back at a registered game', () => {
    for (const room of ALL_ROOMS) {
      expect(GAMES[room.gameCode]).toBeDefined();
      expect(ROOM_BY_KEY[room.key]).toBe(room);
    }
  });
});

// ===========================================================================
// Win Go
// ===========================================================================

describe('WinGo — colour and size mapping', () => {
  it('makes 0 and 5 the dual-colour digits', () => {
    expect(coloursOf(0)).toEqual(['violet', 'red']);
    expect(coloursOf(5)).toEqual(['violet', 'green']);
  });

  it('gives odd digits green and even digits red', () => {
    for (const n of [1, 3, 7, 9]) expect(coloursOf(n)).toEqual(['green']);
    for (const n of [2, 4, 6, 8]) expect(coloursOf(n)).toEqual(['red']);
  });

  it('splits size at 5', () => {
    for (const n of [0, 1, 2, 3, 4]) expect(sizeOf(n)).toBe('small');
    for (const n of [5, 6, 7, 8, 9]) expect(sizeOf(n)).toBe('big');
  });

  it('has five rooms, matching the reference lobby', () => {
    expect(wingoRules.rooms.map((r) => r.intervalSec)).toEqual([30, 60, 180, 300, 600]);
  });
});

describe('WinGo — resolve, exhaustive over every digit', () => {
  it('pays a number bet 9x on exactly one digit', () => {
    for (const pick of DIGITS) {
      const bet = { betType: 'NUMBER', selection: String(pick), stake: STAKE };
      expect(DIGITS.filter((d) => resolveBet(bet, d).won)).toEqual([pick]);
      expect(resolveBet(bet, pick).payout).toBe(contractAmount(STAKE) * 9n);
    }
  });

  it('pays green on 1,3,5,7,9 — reduced on the dual digit 5', () => {
    const bet = { betType: 'COLOUR', selection: 'green', stake: STAKE };
    expect(DIGITS.filter((d) => resolveBet(bet, d).won)).toEqual([1, 3, 5, 7, 9]);
    expect(resolveBet(bet, 3).payout).toBe(contractAmount(STAKE) * 2n);
    expect(resolveBet(bet, 5).payout).toBe((contractAmount(STAKE) * 3n) / 2n);
  });

  it('pays red on 0,2,4,6,8 — reduced on the dual digit 0', () => {
    const bet = { betType: 'COLOUR', selection: 'red', stake: STAKE };
    expect(DIGITS.filter((d) => resolveBet(bet, d).won)).toEqual([0, 2, 4, 6, 8]);
    expect(resolveBet(bet, 4).payout).toBe(contractAmount(STAKE) * 2n);
    expect(resolveBet(bet, 0).payout).toBe((contractAmount(STAKE) * 3n) / 2n);
  });

  it('pays violet 4.5x on 0 and 5 only', () => {
    const bet = { betType: 'COLOUR', selection: 'violet', stake: STAKE };
    expect(DIGITS.filter((d) => resolveBet(bet, d).won)).toEqual([0, 5]);
    expect(resolveBet(bet, 5).payout).toBe((contractAmount(STAKE) * 9n) / 2n);
  });

  it('pays big/small 2x on their five digits', () => {
    const big = { betType: 'SIZE', selection: 'big', stake: STAKE };
    const small = { betType: 'SIZE', selection: 'small', stake: STAKE };
    expect(DIGITS.filter((d) => resolveBet(big, d).won)).toEqual([5, 6, 7, 8, 9]);
    expect(DIGITS.filter((d) => resolveBet(small, d).won)).toEqual([0, 1, 2, 3, 4]);
  });

  it('rejects illegal selections', () => {
    expect(() => wingoRules.validateSelection('NUMBER', '10')).toThrow();
    expect(() => wingoRules.validateSelection('COLOUR', 'blue')).toThrow();
    expect(() => wingoRules.validateSelection('SIZE', 'huge')).toThrow();
    expect(() => wingoRules.validateSelection('NONSENSE', 'x')).toThrow();
  });
});

describe('WinGo — house edge', () => {
  const rtp = (betType: string, selection: string) =>
    rtpOver(DIGITS, (d) => resolveBet({ betType, selection, stake: STAKE }, d).payout);

  it('takes a 2% rake off the stake before odds apply', () => {
    expect(contractAmount(10_000n)).toBe(9_800n);
    expect(HOUSE_FEE_BPS * 50n).toBe(BASIS);
  });

  it('holds RTP below 100% for every bet type', () => {
    expect(rtp('NUMBER', '7')).toBeCloseTo(0.882, 3);
    expect(rtp('COLOUR', 'green')).toBeCloseTo(0.931, 3);
    expect(rtp('COLOUR', 'red')).toBeCloseTo(0.931, 3);
    expect(rtp('COLOUR', 'violet')).toBeCloseTo(0.882, 3);
    expect(rtp('SIZE', 'big')).toBeCloseTo(0.98, 3);
    expect(rtp('SIZE', 'small')).toBeCloseTo(0.98, 3);
  });
});

// ===========================================================================
// K3
// ===========================================================================

const k3 = (betType: string, selection: string, dice: [number, number, number]) =>
  k3Rules.resolve({ betType, selection, stake: STAKE }, { dice });

describe('K3 — dice helpers', () => {
  it('sums three dice', () => {
    expect(k3Sum([1, 2, 3])).toBe(6);
    expect(k3Sum([6, 6, 6])).toBe(18);
  });

  it('detects triples', () => {
    expect(k3IsTriple([4, 4, 4])).toBe(true);
    expect(k3IsTriple([4, 4, 5])).toBe(false);
  });

  it('treats every triple as neither big nor small, nor odd nor even', () => {
    for (let f = 1; f <= 6; f += 1) {
      expect(k3Size([f, f, f])).toBeNull();
      expect(k3Parity([f, f, f])).toBeNull();
    }
  });

  it('splits size at 11 for non-triples', () => {
    expect(k3Size([1, 2, 3])).toBe('small'); // 6
    expect(k3Size([5, 4, 2])).toBe('big'); // 11
  });
});

describe('K3 — winning-outcome counts match the odds table', () => {
  const countWins = (betType: string, selection: string) =>
    ALL_DICE.filter((d) => k3(betType, selection, d).won).length;

  it('big and small each win on 105 of 216, triples excluded', () => {
    expect(countWins('SIZE', 'big')).toBe(105);
    expect(countWins('SIZE', 'small')).toBe(105);
    expect(105 + 105 + 6).toBe(216); // the 6 triples are where both lose
  });

  it('odd and even each win on 105 of 216', () => {
    expect(countWins('PARITY', 'odd')).toBe(105);
    expect(countWins('PARITY', 'even')).toBe(105);
  });

  it('any-triple wins on 6, a specific triple on exactly 1', () => {
    expect(countWins('TRIPLE_ANY', 'any')).toBe(6);
    for (let f = 1; f <= 6; f += 1) expect(countWins('TRIPLE_EXACT', String(f))).toBe(1);
  });

  it('an exact double wins on 15 — and never on a triple', () => {
    for (let f = 1; f <= 6; f += 1) {
      expect(countWins('DOUBLE_EXACT', String(f))).toBe(15);
      expect(k3('DOUBLE_EXACT', String(f), [f, f, f]).won).toBe(false);
    }
  });

  it('a two-face combination wins on 30', () => {
    expect(countWins('COMBO', '1,2')).toBe(30);
    expect(countWins('COMBO', '3,6')).toBe(30);
  });

  it('each total wins on its exact number of compositions', () => {
    const expected = [1, 3, 6, 10, 15, 21, 25, 27, 27, 25, 21, 15, 10, 6, 3, 1];
    for (let s = 3; s <= 18; s += 1) {
      expect(countWins('TOTAL', String(s)), `sum ${s}`).toBe(expected[s - 3]);
    }
  });

  it('totals across 3..18 partition all 216 outcomes', () => {
    let total = 0;
    for (let s = 3; s <= 18; s += 1) total += countWins('TOTAL', String(s));
    expect(total).toBe(216);
  });
});

describe('K3 — house edge is the rake and nothing else', () => {
  const rtp = (betType: string, selection: string) =>
    rtpOver(ALL_DICE, (d) => k3(betType, selection, d).payout);

  it('gives every K3 bet the same 98% RTP', () => {
    const bets: Array<[string, string]> = [
      ['SIZE', 'big'],
      ['SIZE', 'small'],
      ['PARITY', 'odd'],
      ['PARITY', 'even'],
      ['TRIPLE_ANY', 'any'],
      ['TRIPLE_EXACT', '4'],
      ['DOUBLE_EXACT', '2'],
      ['COMBO', '1,6'],
      ['TOTAL', '3'],
      ['TOTAL', '10'],
      ['TOTAL', '18'],
    ];

    for (const [t, s] of bets) {
      // Integer division rounds payouts down, so allow a hair under 0.98.
      expect(rtp(t, s), `${t}:${s}`).toBeGreaterThan(0.9795);
      expect(rtp(t, s), `${t}:${s}`).toBeLessThanOrEqual(0.98);
    }
  });

  it('never pays out on a losing bet', () => {
    for (const d of ALL_DICE) {
      if (k3Sum(d) !== 3) expect(k3('TOTAL', '3', d).payout).toBe(0n);
    }
  });
});

describe('K3 — validation and display', () => {
  it('accepts every legal selection', () => {
    for (let s = 3; s <= 18; s += 1)
      expect(() => k3Rules.validateSelection('TOTAL', String(s))).not.toThrow();
    for (const s of ['big', 'small']) k3Rules.validateSelection('SIZE', s);
    for (const s of ['odd', 'even']) k3Rules.validateSelection('PARITY', s);
    k3Rules.validateSelection('COMBO', '2,5');
  });

  it('rejects illegal ones', () => {
    expect(() => k3Rules.validateSelection('TOTAL', '2')).toThrow();
    expect(() => k3Rules.validateSelection('TOTAL', '19')).toThrow();
    expect(() => k3Rules.validateSelection('TRIPLE_EXACT', '7')).toThrow();
    expect(() => k3Rules.validateSelection('COMBO', '3,3')).toThrow(); // must differ
    expect(() => k3Rules.validateSelection('COMBO', '1')).toThrow();
    expect(() => k3Rules.validateSelection('WHAT', 'x')).toThrow();
  });

  it('describes a result for the history row', () => {
    expect(k3Rules.describe({ dice: [4, 2, 6] }).primary).toBe('4+2+6 = 12');
    expect(k3Rules.describe({ dice: [2, 2, 2] }).tags).toContain('Triple');
  });
});

// ===========================================================================
// Provably fair draw
// ===========================================================================

describe('provably fair draw', () => {
  const seed = 'a'.repeat(64);

  it('is deterministic for a given seed and period', () => {
    expect(deriveValues(seed, '202608010001', 3, 6)).toEqual(
      deriveValues(seed, '202608010001', 3, 6),
    );
  });

  it('returns the requested count, all inside range', () => {
    for (const [count, mod] of [
      [1, 10],
      [3, 6],
      [5, 10],
    ] as const) {
      const v = deriveValues(seed, 'p1', count, mod);
      expect(v).toHaveLength(count);
      for (const n of v) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(mod);
      }
    }
  });

  it('changes with the period number and with the seed', () => {
    expect(deriveValues(seed, 'p1', 3, 6).join()).not.toBe(deriveValues(seed, 'p2', 3, 6).join());
    expect(deriveValues('a'.repeat(64), 'p1', 3, 6).join()).not.toBe(
      deriveValues('b'.repeat(64), 'p1', 3, 6).join(),
    );
  });

  it('spreads digits roughly uniformly', () => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 10_000; i += 1) counts[deriveValues(seed, `p${i}`, 1, 10)[0]] += 1;
    for (const c of counts) {
      expect(c).toBeGreaterThan(850); // expect ~1000
      expect(c).toBeLessThan(1150);
    }
  });

  it('spreads dice faces roughly uniformly', () => {
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 12_000; i += 1) {
      for (const v of deriveValues(seed, `d${i}`, 3, 6)) counts[v] += 1;
    }
    for (const c of counts) {
      expect(c).toBeGreaterThan(5700); // expect ~6000
      expect(c).toBeLessThan(6300);
    }
  });

  it('commits to a hash that matches the revealed seed', () => {
    expect(hashSeed(seed)).toHaveLength(64);
    expect(hashSeed(seed)).toBe(hashSeed(seed));
    expect(hashSeed(seed)).not.toBe(hashSeed('b'.repeat(64)));
  });

  it('shapes drawn values into each game result correctly', () => {
    expect(wingoRules.buildResult([7])).toEqual({ n: 7 });
    // K3 shifts 0..5 to dice faces 1..6.
    expect(k3Rules.buildResult([0, 2, 5])).toEqual({ dice: [1, 3, 6] });
  });
});

// ===========================================================================
// Period windows and money
// ===========================================================================

describe('period windows', () => {
  const room = ROOM_BY_KEY.WINGO_1M;

  it('advances the period number every interval', () => {
    const base = Date.UTC(2026, 7, 1, 0, 0, 0);
    const a = periodWindowAt(room, base);
    const b = periodWindowAt(room, base + 60_000);
    expect(b.index).toBe(a.index + 1);
    expect(a.periodNo).not.toBe(b.periodNo);
  });

  it('keeps every instant inside a period on the same period number', () => {
    const base = Date.UTC(2026, 7, 1, 9, 30, 0);
    const start = periodWindowAt(room, base);
    for (const offset of [0, 1, 15_000, 59_999]) {
      expect(periodWindowAt(room, start.startMs + offset).periodNo).toBe(start.periodNo);
    }
    expect(periodWindowAt(room, start.startMs + 60_000).periodNo).not.toBe(start.periodNo);
  });

  it('locks before it ends, for every room', () => {
    for (const r of ALL_ROOMS) {
      const w = periodWindowAt(r, Date.now());
      expect(w.lockMs).toBeLessThan(w.endMs);
      expect(w.endMs - w.lockMs).toBe(r.lockBeforeSec * 1000);
      expect(r.lockBeforeSec).toBeLessThan(r.intervalSec);
    }
  });
});

describe('money formatting', () => {
  it('round-trips major to minor units', () => {
    expect(toMinor('100')).toBe(10_000n);
    expect(toMinor('0.01')).toBe(1n);
    expect(toMinor('1234.56')).toBe(123_456n);
  });

  it('rejects anything that is not a clean amount', () => {
    expect(() => toMinor('1.234')).toThrow();
    expect(() => toMinor('-5')).toThrow();
    expect(() => toMinor('abc')).toThrow();
  });

  it('formats minor units for display', () => {
    expect(formatMinor(10_000n)).toBe('100.00');
    expect(formatMinor(1n)).toBe('0.01');
    expect(formatMinor(0n)).toBe('0.00');
  });
});
