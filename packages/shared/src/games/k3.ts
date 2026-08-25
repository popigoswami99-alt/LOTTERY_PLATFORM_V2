import { NO_ODDS, payoutFor, type Odds, type RoomConfig } from '../core.js';
import { InvalidBetError, type GameRules, type Outcome, type ResolvableBet } from './types.js';

/**
 * K3 — three six-sided dice are rolled each period (216 equally likely
 * outcomes). Players bet on the total, its size or parity, on triples,
 * doubles, or on a pair of numbers both appearing.
 *
 * ODDS POLICY
 * -----------
 * Every payout here is the TRUE odds of the bet (216 / winning-outcomes),
 * expressed as an exact rational. The house edge comes from one place only:
 * the 2% stake rake in `contractAmount`. That means every K3 bet has the same
 * 98% RTP, which the test suite asserts exhaustively by enumerating all 216
 * outcomes.
 *
 * This is a deliberate departure from the genre's usual practice of baking a
 * second, per-bet-type edge into the published multipliers. It keeps the edge
 * auditable in a single constant. To switch to genre-standard odds, replace
 * the `fair()` calls below with fixed rationals — nothing else changes.
 */

export const GAME_CODE_K3 = 'K3';

export interface K3Result {
  dice: [number, number, number];
}

export const K3_ROOMS: RoomConfig[] = [
  { key: 'K3_1M', gameCode: GAME_CODE_K3, label: 'K3 1Min', intervalSec: 60, lockBeforeSec: 5 },
  { key: 'K3_3M', gameCode: GAME_CODE_K3, label: 'K3 3Min', intervalSec: 180, lockBeforeSec: 10 },
  { key: 'K3_5M', gameCode: GAME_CODE_K3, label: 'K3 5Min', intervalSec: 300, lockBeforeSec: 10 },
  { key: 'K3_10M', gameCode: GAME_CODE_K3, label: 'K3 10Min', intervalSec: 600, lockBeforeSec: 15 },
];

export const K3_TOTAL_OUTCOMES = 216;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** True odds for a bet that wins on `winningOutcomes` of the 216. */
function fair(winningOutcomes: number): Odds {
  const g = gcd(K3_TOTAL_OUTCOMES, winningOutcomes);
  return { num: K3_TOTAL_OUTCOMES / g, den: winningOutcomes / g };
}

/** Number of ordered triples summing to s, for s in 3..18. */
const SUM_COUNTS: Record<number, number> = {
  3: 1, 4: 3, 5: 6, 6: 10, 7: 15, 8: 21, 9: 25, 10: 27,
  11: 27, 12: 25, 13: 21, 14: 15, 15: 10, 16: 6, 17: 3, 18: 1,
};

export const K3_MIN_SUM = 3;
export const K3_MAX_SUM = 18;

function sumOf(dice: readonly number[]): number {
  return dice[0] + dice[1] + dice[2];
}

function isTriple(dice: readonly number[]): boolean {
  return dice[0] === dice[1] && dice[1] === dice[2];
}

/** The face that appears exactly twice, or null when there is no pair. */
function pairFace(dice: readonly number[]): number | null {
  if (isTriple(dice)) return null;
  const [a, b, c] = dice;
  if (a === b) return a;
  if (a === c) return a;
  if (b === c) return b;
  return null;
}

/**
 * Size and parity bets lose on ANY triple, not just on 3 and 18. That
 * exclusion is what makes them a fair 105/216 rather than 108/216, and it is
 * the single most commonly mis-implemented rule in this game.
 */
function sizeOf(dice: readonly number[]): 'big' | 'small' | null {
  if (isTriple(dice)) return null;
  return sumOf(dice) >= 11 ? 'big' : 'small';
}

function parityOf(dice: readonly number[]): 'odd' | 'even' | null {
  if (isTriple(dice)) return null;
  return sumOf(dice) % 2 === 1 ? 'odd' : 'even';
}

/** Winning-outcome counts, used for both odds and the RTP assertions. */
export const K3_COUNTS = {
  SIZE: 105, // 11-17 excluding triples
  PARITY: 105,
  TRIPLE_ANY: 6,
  TRIPLE_EXACT: 1,
  DOUBLE_EXACT: 15, // exactly two of a given face: C(3,2) * 5 others
  COMBO: 30, // both of two distinct faces present: 216 - 125 - 125 + 64
} as const;

export const K3_ODDS = {
  SIZE: fair(K3_COUNTS.SIZE),
  PARITY: fair(K3_COUNTS.PARITY),
  TRIPLE_ANY: fair(K3_COUNTS.TRIPLE_ANY),
  TRIPLE_EXACT: fair(K3_COUNTS.TRIPLE_EXACT),
  DOUBLE_EXACT: fair(K3_COUNTS.DOUBLE_EXACT),
  COMBO: fair(K3_COUNTS.COMBO),
} as const;

function totalOdds(sum: number): Odds {
  return fair(SUM_COUNTS[sum]);
}

/**
 * Public helpers, prefixed so they never collide with another game's notion of
 * "size" or "sum" when everything is re-exported from the package root.
 */
export {
  SUM_COUNTS as K3_SUM_COUNTS,
  sumOf as k3Sum,
  isTriple as k3IsTriple,
  pairFace as k3PairFace,
  sizeOf as k3Size,
  parityOf as k3Parity,
  totalOdds as k3TotalOdds,
};

/** Parses a "1,2" combo selection into its two distinct faces. */
function parseCombo(selection: string): [number, number] {
  const parts = selection.split(',').map((s) => Number(s.trim()));
  if (
    parts.length !== 2 ||
    parts.some((n) => !Number.isInteger(n) || n < 1 || n > 6) ||
    parts[0] === parts[1]
  ) {
    throw new InvalidBetError('Combination must be two different faces, e.g. "1,2"');
  }
  return [parts[0], parts[1]];
}

const isFace = (s: string) => /^[1-6]$/.test(s);

export const k3Rules: GameRules<K3Result> = {
  gameCode: GAME_CODE_K3,
  label: 'K3',
  rooms: K3_ROOMS,

  /** Three values in 0..5, shifted to dice faces 1..6. */
  draw: { count: 3, modulus: 6 },
  buildResult: (v) => ({ dice: [v[0] + 1, v[1] + 1, v[2] + 1] }),

  // A K3 result is three dice, not one digit.
  resultDigit: () => null,

  validateSelection(betType, selection) {
    switch (betType) {
      case 'TOTAL': {
        const n = Number(selection);
        if (!Number.isInteger(n) || n < K3_MIN_SUM || n > K3_MAX_SUM)
          throw new InvalidBetError('Total must be between 3 and 18');
        return;
      }
      case 'SIZE':
        if (!['big', 'small'].includes(selection))
          throw new InvalidBetError('Size must be big or small');
        return;
      case 'PARITY':
        if (!['odd', 'even'].includes(selection))
          throw new InvalidBetError('Parity must be odd or even');
        return;
      case 'TRIPLE_ANY':
        if (selection !== 'any') throw new InvalidBetError('Selection must be "any"');
        return;
      case 'TRIPLE_EXACT':
      case 'DOUBLE_EXACT':
        if (!isFace(selection)) throw new InvalidBetError('Face must be 1-6');
        return;
      case 'COMBO':
        parseCombo(selection);
        return;
      default:
        throw new InvalidBetError(`Unknown bet type: ${betType}`);
    }
  },

  displayOdds(betType, selection) {
    switch (betType) {
      case 'TOTAL':
        return totalOdds(Number(selection));
      case 'SIZE':
        return K3_ODDS.SIZE;
      case 'PARITY':
        return K3_ODDS.PARITY;
      case 'TRIPLE_ANY':
        return K3_ODDS.TRIPLE_ANY;
      case 'TRIPLE_EXACT':
        return K3_ODDS.TRIPLE_EXACT;
      case 'DOUBLE_EXACT':
        return K3_ODDS.DOUBLE_EXACT;
      case 'COMBO':
        return K3_ODDS.COMBO;
      default:
        return NO_ODDS;
    }
  },

  resolve(bet: ResolvableBet, result): Outcome {
    const { dice } = result;
    let odds: Odds | null = null;

    switch (bet.betType) {
      case 'TOTAL':
        if (sumOf(dice) === Number(bet.selection)) odds = totalOdds(sumOf(dice));
        break;

      case 'SIZE':
        if (sizeOf(dice) === bet.selection) odds = K3_ODDS.SIZE;
        break;

      case 'PARITY':
        if (parityOf(dice) === bet.selection) odds = K3_ODDS.PARITY;
        break;

      case 'TRIPLE_ANY':
        if (isTriple(dice)) odds = K3_ODDS.TRIPLE_ANY;
        break;

      case 'TRIPLE_EXACT':
        if (isTriple(dice) && dice[0] === Number(bet.selection)) odds = K3_ODDS.TRIPLE_EXACT;
        break;

      case 'DOUBLE_EXACT':
        if (pairFace(dice) === Number(bet.selection)) odds = K3_ODDS.DOUBLE_EXACT;
        break;

      case 'COMBO': {
        const [x, y] = parseCombo(bet.selection);
        if (dice.includes(x) && dice.includes(y)) odds = K3_ODDS.COMBO;
        break;
      }
    }

    if (!odds) return { won: false, odds: NO_ODDS, payout: 0n };
    return { won: true, odds, payout: payoutFor(bet.stake, odds) };
  },

  describe(result) {
    const { dice } = result;
    const tags: string[] = [];
    const size = sizeOf(dice);
    const parity = parityOf(dice);
    if (size) tags.push(size === 'big' ? 'Big' : 'Small');
    if (parity) tags.push(parity === 'odd' ? 'Odd' : 'Even');
    if (isTriple(dice)) tags.push('Triple');
    return { primary: `${dice.join('+')} = ${sumOf(dice)}`, tags };
  },
};
