import { NO_ODDS, payoutFor, type Odds, type RoomConfig } from '../core.js';
import { InvalidBetError, type GameRules, type Outcome, type ResolvableBet } from './types.js';

/**
 * 4D — four digits A B C D, each 0-9, drawn independently, plus their SUM
 * (0-36). Players bet on any one position or on the sum.
 *
 * Positions (A-D) behave exactly like Win Go: NUMBER is 1-in-10 at 9x (88.2%
 * RTP); SIZE and PARITY each split the ten digits exactly in half at 2x
 * (98% RTP).
 *
 * The SUM needs different treatment than 5D's. 5D's sum spans 0-45 -- 46
 * values, an EVEN count with no self-paired midpoint -- so Big/Small splits
 * exactly in half by symmetry. 4D's sum spans 0-36 -- 37 values, an ODD count
 * whose midpoint (18) maps to itself under the complement d -> 9-d -- so
 * Big (>=18) and Small (<=17) are NOT the same size (5,335 vs 4,665 of the
 * 10,000 draws). Rather than exclude the midpoint as a push, both sides are
 * priced at their own TRUE odds -- the same "honest asymmetric" treatment
 * this codebase already gives Andar Bahar: the short side pays more than the
 * long side, and both still carry the identical 98% RTP.
 *
 * SUM_PARITY has no such issue: each digit is odd with probability exactly
 * 1/2, independently of the others, so the sum's parity is an exact coin
 * flip regardless of the sum's own (very non-uniform) distribution. It pays
 * a flat 2x like every other parity bet.
 *
 * SUM cannot be bet as an exact NUMBER: unlike a single digit, P(sum = k) is
 * far from uniform (670 of 10,000 draws at the peak vs 1 at the extremes), so
 * a flat payout would not hold RTP constant across k. 5D applies the same
 * rule for the same reason.
 */

export const GAME_CODE_4D = '4D';

export type FourDPos = 'A' | 'B' | 'C' | 'D' | 'SUM';
export const FOURD_POSITIONS: FourDPos[] = ['A', 'B', 'C', 'D', 'SUM'];
export type FourDKind = 'NUMBER' | 'SIZE' | 'PARITY';

export interface FourDResult {
  /** The four drawn digits, in order A..D. */
  digits: number[];
  /** A + B + C + D, 0..36. */
  sum: number;
}

export const FOURD_ROOMS: RoomConfig[] = [
  { key: '4D_1M', gameCode: GAME_CODE_4D, label: '4D 1Min', intervalSec: 60, lockBeforeSec: 5 },
  { key: '4D_3M', gameCode: GAME_CODE_4D, label: '4D 3Min', intervalSec: 180, lockBeforeSec: 10 },
  { key: '4D_5M', gameCode: GAME_CODE_4D, label: '4D 5Min', intervalSec: 300, lockBeforeSec: 10 },
  { key: '4D_10M', gameCode: GAME_CODE_4D, label: '4D 10Min', intervalSec: 600, lockBeforeSec: 15 },
];

const POS_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
const SUM_MIN = 0;
const SUM_MAX = 36;
const TOTAL_DRAWS = 10_000; // 10^4

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** True odds for a bet that wins on `winningDraws` of the 10,000. */
function fair(winningDraws: number): Odds {
  const g = gcd(TOTAL_DRAWS, winningDraws);
  return { num: TOTAL_DRAWS / g, den: winningDraws / g };
}

/**
 * Number of ways to land each sum 0..36, by convolving four uniform 0-9
 * digits. Computed once and cached -- this is what SUM_SIZE's true odds are
 * priced from, and what the test suite checks against a full 10,000-draw
 * enumeration.
 */
function computeSumWays(): number[] {
  let ways = [1]; // zero digits drawn so far: sum 0 with 1 way
  for (let digit = 0; digit < 4; digit += 1) {
    const next = new Array(ways.length + 9).fill(0);
    for (let s = 0; s < ways.length; s += 1) {
      if (ways[s] === 0) continue;
      for (let d = 0; d <= 9; d += 1) next[s + d] += ways[s];
    }
    ways = next;
  }
  return ways; // index 0..36
}

let sumWaysCache: number[] | null = null;
export function fourDSumWays(): readonly number[] {
  return (sumWaysCache ??= computeSumWays());
}

/** Draws at or above the SUM Big threshold (18) — the larger, cheaper side. */
function sumBigCount(): number {
  const ways = fourDSumWays();
  let count = 0;
  for (let s = 18; s <= SUM_MAX; s += 1) count += ways[s];
  return count;
}

let sumBigOddsCache: Odds | null = null;
let sumSmallOddsCache: Odds | null = null;

function sumBigOdds(): Odds {
  return (sumBigOddsCache ??= fair(sumBigCount()));
}
function sumSmallOdds(): Odds {
  return (sumSmallOddsCache ??= fair(TOTAL_DRAWS - sumBigCount()));
}

export const FOURD_ODDS = {
  NUMBER: { num: 9, den: 1 },
  SIZE: { num: 2, den: 1 },
  PARITY: { num: 2, den: 1 },
} as const satisfies Record<string, Odds>;

/** The value a position resolves against: a single digit, or the sum. */
export function fourDValueAt(result: FourDResult, pos: FourDPos): number {
  return pos === 'SUM' ? result.sum : result.digits[POS_INDEX[pos]];
}

export function fourDSizeOfAt(pos: FourDPos, value: number): 'big' | 'small' {
  if (pos === 'SUM') return value >= 18 ? 'big' : 'small';
  return value >= 5 ? 'big' : 'small';
}

export function fourDParityOf(value: number): 'odd' | 'even' {
  return value % 2 === 1 ? 'odd' : 'even';
}

/** Splits "A_SIZE" into its position and kind, validating both. */
function parseBetType(betType: string): { pos: FourDPos; kind: FourDKind } {
  const [pos, kind] = betType.split('_');
  if (!FOURD_POSITIONS.includes(pos as FourDPos)) {
    throw new InvalidBetError(`Unknown position: ${pos}`);
  }
  if (!['NUMBER', 'SIZE', 'PARITY'].includes(kind)) {
    throw new InvalidBetError(`Unknown bet kind: ${kind}`);
  }
  if (kind === 'NUMBER' && pos === 'SUM') {
    throw new InvalidBetError('The sum cannot be bet as an exact number');
  }
  return { pos: pos as FourDPos, kind: kind as FourDKind };
}

/** SIZE odds for a position: flat 2x for A-D, true (asymmetric) odds for SUM. */
function sizeOddsFor(pos: FourDPos, selection: string): Odds {
  if (pos !== 'SUM') return FOURD_ODDS.SIZE;
  return selection === 'big' ? sumBigOdds() : sumSmallOdds();
}

export const fourDRules: GameRules<FourDResult> = {
  gameCode: GAME_CODE_4D,
  label: '4D',
  rooms: FOURD_ROOMS,

  /** Four digits in 0..9. */
  draw: { count: 4, modulus: 10 },
  buildResult: (values) => ({
    digits: values.slice(0, 4),
    sum: values.slice(0, 4).reduce((a, b) => a + b, 0),
  }),

  // 4D has no single denormalised digit — its result is four of them.
  resultDigit: () => null,

  validateSelection(betType, selection) {
    const { kind } = parseBetType(betType);
    switch (kind) {
      case 'NUMBER':
        if (!/^[0-9]$/.test(selection)) throw new InvalidBetError('Number must be 0-9');
        return;
      case 'SIZE':
        if (!['big', 'small'].includes(selection)) {
          throw new InvalidBetError('Size must be big or small');
        }
        return;
      case 'PARITY':
        if (!['odd', 'even'].includes(selection)) {
          throw new InvalidBetError('Parity must be odd or even');
        }
        return;
    }
  },

  displayOdds(betType, selection) {
    const { pos, kind } = parseBetType(betType);
    switch (kind) {
      case 'NUMBER':
        return FOURD_ODDS.NUMBER;
      case 'SIZE':
        return sizeOddsFor(pos, selection);
      case 'PARITY':
        return FOURD_ODDS.PARITY;
    }
  },

  resolve(bet: ResolvableBet, result): Outcome {
    const { pos, kind } = parseBetType(bet.betType);
    const value = fourDValueAt(result, pos);

    let odds: Odds | null = null;
    switch (kind) {
      case 'NUMBER':
        if (Number(bet.selection) === value) odds = FOURD_ODDS.NUMBER;
        break;
      case 'SIZE':
        if (bet.selection === fourDSizeOfAt(pos, value)) odds = sizeOddsFor(pos, bet.selection);
        break;
      case 'PARITY':
        if (bet.selection === fourDParityOf(value)) odds = FOURD_ODDS.PARITY;
        break;
    }

    if (!odds) return { won: false, odds: NO_ODDS, payout: 0n };
    return { won: true, odds, payout: payoutFor(bet.stake, odds) };
  },

  describe(result) {
    return {
      primary: `${result.digits.join(' ')} = ${result.sum}`,
      tags: [
        fourDSizeOfAt('SUM', result.sum) === 'big' ? 'Big' : 'Small',
        fourDParityOf(result.sum) === 'odd' ? 'Odd' : 'Even',
      ],
    };
  },
};
