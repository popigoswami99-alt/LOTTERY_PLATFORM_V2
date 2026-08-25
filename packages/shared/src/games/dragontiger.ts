import { contractAmount } from '../core.js';
import { abCardFromIndex, type ABCard } from './andarbahar.js';

/**
 * Dragon Tiger.
 *
 * One card to Dragon, one to Tiger, both from the same 52-card deck. The
 * higher rank wins; equal ranks are a Tie. Suits are irrelevant — there is no
 * tiebreak, which is what makes Tie a real, payable outcome.
 *
 * Ace is LOW (rank 1) and King is HIGH (rank 13), the standard ordering.
 *
 * EXACT PROBABILITIES
 * -------------------
 * Two distinct cards drawn from 52 give 52 x 51 = 2652 ordered outcomes.
 * A tie needs both cards of the same rank: 13 ranks x 4 x 3 = 156 of them.
 * The remaining 2496 split evenly by symmetry:
 *
 *   P(dragon) = P(tiger) = 1248 / 2652 = 8/17  ≈ 47.06%
 *   P(tie)                =  156 / 2652 = 1/17  ≈  5.88%
 *
 * Each is paid the exact inverse — 17/8 (2.125x) on Dragon or Tiger, 17x on
 * Tie — so the 2% rake is the only edge and all three bets return 98%.
 *
 * Note this drops the usual "tie returns half your stake" rule. That rule
 * exists to hide a house edge inside an even-money payout; here a tie simply
 * loses, and Dragon/Tiger pay 2.125x rather than 2x to compensate. Same game,
 * edge stated once instead of buried in a side rule.
 */

export const GAME_CODE_DRAGON_TIGER = 'DRAGONTIGER';

export type DTSide = 'dragon' | 'tiger' | 'tie';
export const DT_SIDES: DTSide[] = ['dragon', 'tiger', 'tie'];

export const DT_DECK = 52;
export const DT_RANKS = 13;
export const DT_SUITS = 4;

/** Two values: one per card. The second skips the first to stay distinct. */
export const DT_DRAW_VALUES = 2;

function counts(): { dragon: bigint; tiger: bigint; tie: bigint; total: bigint } {
  const total = DT_DECK * (DT_DECK - 1); // ordered pairs of distinct cards
  const tie = DT_RANKS * DT_SUITS * (DT_SUITS - 1);
  const decided = (total - tie) / 2; // symmetric between the two sides
  return {
    dragon: BigInt(decided),
    tiger: BigInt(decided),
    tie: BigInt(tie),
    total: BigInt(total),
  };
}

export const DT_COUNTS = counts();

export interface DTDraw {
  dragon: ABCard;
  tiger: ABCard;
}

/**
 * Draws two DISTINCT cards from caller-supplied random values.
 *
 * The second index is taken modulo 51 and then shifted past the first, which
 * keeps every remaining card equally likely — sampling 0..51 twice and
 * rejecting collisions would bias nothing but would not be reproducible in a
 * fixed number of values.
 */
export function dtDraw(values: number[]): DTDraw {
  const first = values[0] % DT_DECK;
  const raw = values[1] % (DT_DECK - 1);
  const second = raw < first ? raw : raw + 1;
  return { dragon: abCardFromIndex(first), tiger: abCardFromIndex(second) };
}

export function dtWinner(draw: DTDraw): DTSide {
  if (draw.dragon.rank > draw.tiger.rank) return 'dragon';
  if (draw.tiger.rank > draw.dragon.rank) return 'tiger';
  return 'tie';
}

export function isValidDTSide(side: string): side is DTSide {
  return (DT_SIDES as string[]).includes(side);
}

function winCountFor(side: DTSide): bigint {
  if (side === 'tie') return DT_COUNTS.tie;
  return side === 'dragon' ? DT_COUNTS.dragon : DT_COUNTS.tiger;
}

/** Exact odds for a side: total outcomes over the ones that win it. */
export function dtOdds(side: DTSide): { num: bigint; den: bigint } {
  return { num: DT_COUNTS.total, den: winCountFor(side) };
}

/** Display multiplier, rounded DOWN so we never advertise above what we pay. */
export function dtMultiplierX100(side: DTSide): number {
  const { num, den } = dtOdds(side);
  return Number((100n * num) / den);
}

/** Exact payout after the rake. Zero when the side did not win. */
export function dtPayout(stake: bigint, side: DTSide, winner: DTSide): bigint {
  if (side !== winner) return 0n;
  const { num, den } = dtOdds(side);
  return (contractAmount(stake) * num) / den;
}
