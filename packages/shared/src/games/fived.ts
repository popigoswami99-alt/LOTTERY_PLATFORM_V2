import { NO_ODDS, payoutFor, type Odds, type RoomConfig } from '../core.js';
import { InvalidBetError, type GameRules, type Outcome, type ResolvableBet } from './types.js';

/**
 * 5D — five digits A B C D E, each 0-9, drawn independently, plus their SUM
 * (0-45). Players bet on any one position or on the sum.
 *
 * Every bet reduces to a Win Go-shaped wager, so the whole family's odds and
 * RTP carry straight over:
 *
 *   - NUMBER (positions only): the exact digit, 1 in 10, pays 9x -> 88.2% RTP.
 *   - SIZE:  Big/Small. For a position Big is 5-9; for the SUM Big is 23-45.
 *            Both split the outcomes exactly in half, pays 2x -> 98% RTP.
 *   - PARITY: Odd/Even, also an exact half, pays 2x -> 98% RTP.
 *
 * The two SUM splits are exactly even for non-obvious reasons, and the test
 * suite enumerates all 100,000 draws to prove it: the sum is symmetric about
 * 22.5 so P(sum >= 23) = P(sum <= 22) = 1/2, and the sum's parity is the parity
 * of how many of the five digits are odd, which is Binomial(5, 1/2) and lands
 * odd exactly half the time.
 */

export const GAME_CODE_5D = '5D';

export type FiveDPos = 'A' | 'B' | 'C' | 'D' | 'E' | 'SUM';
export const FIVED_POSITIONS: FiveDPos[] = ['A', 'B', 'C', 'D', 'E', 'SUM'];
export type FiveDKind = 'NUMBER' | 'SIZE' | 'PARITY';

export interface FiveDResult {
  /** The five drawn digits, in order A..E. */
  digits: number[];
  /** A + B + C + D + E, 0..45. */
  sum: number;
}

export const FIVED_ROOMS: RoomConfig[] = [
  { key: '5D_1M', gameCode: GAME_CODE_5D, label: '5D 1Min', intervalSec: 60, lockBeforeSec: 5 },
  { key: '5D_3M', gameCode: GAME_CODE_5D, label: '5D 3Min', intervalSec: 180, lockBeforeSec: 10 },
  { key: '5D_5M', gameCode: GAME_CODE_5D, label: '5D 5Min', intervalSec: 300, lockBeforeSec: 10 },
  { key: '5D_10M', gameCode: GAME_CODE_5D, label: '5D 10Min', intervalSec: 600, lockBeforeSec: 15 },
];

export const FIVED_ODDS = {
  NUMBER: { num: 9, den: 1 },
  SIZE: { num: 2, den: 1 },
  PARITY: { num: 2, den: 1 },
} as const satisfies Record<string, Odds>;

const POS_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

/** The value a position resolves against: a single digit, or the sum. */
export function valueAt(result: FiveDResult, pos: FiveDPos): number {
  return pos === 'SUM' ? result.sum : result.digits[POS_INDEX[pos]];
}

/** Big/Small threshold: 23 for the sum (0-45), 5 for a single digit (0-9). */
export function sizeOfAt(pos: FiveDPos, value: number): 'big' | 'small' {
  const threshold = pos === 'SUM' ? 23 : 5;
  return value >= threshold ? 'big' : 'small';
}

export function parityOf(value: number): 'odd' | 'even' {
  return value % 2 === 1 ? 'odd' : 'even';
}

/** Splits "A_SIZE" into its position and kind, validating both. */
function parseBetType(betType: string): { pos: FiveDPos; kind: FiveDKind } {
  const [pos, kind] = betType.split('_');
  if (!FIVED_POSITIONS.includes(pos as FiveDPos)) {
    throw new InvalidBetError(`Unknown position: ${pos}`);
  }
  if (!['NUMBER', 'SIZE', 'PARITY'].includes(kind)) {
    throw new InvalidBetError(`Unknown bet kind: ${kind}`);
  }
  if (kind === 'NUMBER' && pos === 'SUM') {
    throw new InvalidBetError('The sum cannot be bet as an exact number');
  }
  return { pos: pos as FiveDPos, kind: kind as FiveDKind };
}

export const fiveDRules: GameRules<FiveDResult> = {
  gameCode: GAME_CODE_5D,
  label: '5D',
  rooms: FIVED_ROOMS,

  /** Five digits in 0..9. */
  draw: { count: 5, modulus: 10 },
  buildResult: (values) => ({
    digits: values.slice(0, 5),
    sum: values.slice(0, 5).reduce((a, b) => a + b, 0),
  }),

  // 5D has no single denormalised digit — its result is five of them.
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

  displayOdds(betType) {
    const { kind } = parseBetType(betType);
    return FIVED_ODDS[kind];
  },

  resolve(bet: ResolvableBet, result): Outcome {
    const { pos, kind } = parseBetType(bet.betType);
    const value = valueAt(result, pos);

    let odds: Odds | null = null;
    switch (kind) {
      case 'NUMBER':
        if (Number(bet.selection) === value) odds = FIVED_ODDS.NUMBER;
        break;
      case 'SIZE':
        if (bet.selection === sizeOfAt(pos, value)) odds = FIVED_ODDS.SIZE;
        break;
      case 'PARITY':
        if (bet.selection === parityOf(value)) odds = FIVED_ODDS.PARITY;
        break;
    }

    if (!odds) return { won: false, odds: NO_ODDS, payout: 0n };
    return { won: true, odds, payout: payoutFor(bet.stake, odds) };
  },

  describe(result) {
    return {
      primary: `${result.digits.join(' ')} = ${result.sum}`,
      tags: [
        sizeOfAt('SUM', result.sum) === 'big' ? 'Big' : 'Small',
        parityOf(result.sum) === 'odd' ? 'Odd' : 'Even',
      ],
    };
  },
};
