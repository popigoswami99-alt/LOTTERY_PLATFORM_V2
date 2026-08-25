import { NO_ODDS, payoutFor, type Odds, type RoomConfig } from '../core.js';
import { InvalidBetError, type GameRules, type Outcome, type ResolvableBet } from './types.js';

/**
 * Win Go — a digit 0-9 is drawn each period. Players bet on the digit, its
 * colour, or its size.
 */

export const GAME_CODE_WINGO = 'WINGO';

export type Colour = 'green' | 'red' | 'violet';
export type Size = 'big' | 'small';

export interface WinGoResult {
  n: number;
}

export const WINGO_ROOMS: RoomConfig[] = [
  { key: 'WINGO_30S', gameCode: GAME_CODE_WINGO, label: 'Win Go 30s', intervalSec: 30, lockBeforeSec: 5 },
  { key: 'WINGO_1M', gameCode: GAME_CODE_WINGO, label: 'Win Go 1Min', intervalSec: 60, lockBeforeSec: 5 },
  { key: 'WINGO_3M', gameCode: GAME_CODE_WINGO, label: 'Win Go 3Min', intervalSec: 180, lockBeforeSec: 10 },
  { key: 'WINGO_5M', gameCode: GAME_CODE_WINGO, label: 'Win Go 5Min', intervalSec: 300, lockBeforeSec: 10 },
  { key: 'WINGO_10M', gameCode: GAME_CODE_WINGO, label: 'Win Go 10Min', intervalSec: 600, lockBeforeSec: 15 },
];

/**
 * Colours attached to each digit. 0 and 5 are dual-colour — that is what makes
 * violet payable at all — so this returns an array.
 */
export function coloursOf(n: number): Colour[] {
  if (n === 0) return ['violet', 'red'];
  if (n === 5) return ['violet', 'green'];
  return n % 2 === 1 ? ['green'] : ['red'];
}

export function sizeOf(n: number): Size {
  return n >= 5 ? 'big' : 'small';
}

export const WINGO_ODDS = {
  NUMBER: { num: 9, den: 1 },
  COLOUR_PLAIN: { num: 2, den: 1 },
  /** Green/red when the drawn digit is 0 or 5 — dual-colour digits pay less. */
  COLOUR_ON_DUAL: { num: 3, den: 2 },
  VIOLET: { num: 9, den: 2 },
  SIZE: { num: 2, den: 1 },
} as const satisfies Record<string, Odds>;

export const wingoRules: GameRules<WinGoResult> = {
  gameCode: GAME_CODE_WINGO,
  label: 'Win Go',
  rooms: WINGO_ROOMS,

  /** One value in 0..9 — the drawn digit. */
  draw: { count: 1, modulus: 10 },
  buildResult: ([n]) => ({ n }),

  resultDigit: (r) => r.n,

  validateSelection(betType, selection) {
    switch (betType) {
      case 'NUMBER':
        if (!/^[0-9]$/.test(selection)) throw new InvalidBetError('Number must be 0-9');
        return;
      case 'COLOUR':
        if (!['green', 'red', 'violet'].includes(selection))
          throw new InvalidBetError('Colour must be green, red or violet');
        return;
      case 'SIZE':
        if (!['big', 'small'].includes(selection))
          throw new InvalidBetError('Size must be big or small');
        return;
      default:
        throw new InvalidBetError(`Unknown bet type: ${betType}`);
    }
  },

  displayOdds(betType, selection) {
    if (betType === 'NUMBER') return WINGO_ODDS.NUMBER;
    if (betType === 'SIZE') return WINGO_ODDS.SIZE;
    return selection === 'violet' ? WINGO_ODDS.VIOLET : WINGO_ODDS.COLOUR_PLAIN;
  },

  resolve(bet: ResolvableBet, result): Outcome {
    const drawn = result.n;
    const colours = coloursOf(drawn);
    const isDual = drawn === 0 || drawn === 5;

    let odds: Odds | null = null;

    switch (bet.betType) {
      case 'NUMBER':
        if (Number(bet.selection) === drawn) odds = WINGO_ODDS.NUMBER;
        break;
      case 'COLOUR': {
        const pick = bet.selection as Colour;
        if (colours.includes(pick)) {
          odds =
            pick === 'violet'
              ? WINGO_ODDS.VIOLET
              : isDual
                ? WINGO_ODDS.COLOUR_ON_DUAL
                : WINGO_ODDS.COLOUR_PLAIN;
        }
        break;
      }
      case 'SIZE':
        if (bet.selection === sizeOf(drawn)) odds = WINGO_ODDS.SIZE;
        break;
    }

    if (!odds) return { won: false, odds: NO_ODDS, payout: 0n };
    return { won: true, odds, payout: payoutFor(bet.stake, odds) };
  },

  describe(result) {
    return {
      primary: String(result.n),
      tags: [sizeOf(result.n) === 'big' ? 'Big' : 'Small', ...coloursOf(result.n)],
    };
  },
};

// --- Backwards-compatible helpers used by the existing WinGo UI and tests ---

export function displayOdds(betType: string, selection: string): Odds {
  return wingoRules.displayOdds(betType, selection);
}

export function resolveBet(bet: ResolvableBet, drawn: number): Outcome {
  return wingoRules.resolve(bet, { n: drawn });
}
