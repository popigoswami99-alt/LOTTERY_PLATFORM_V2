import { contractAmount } from '../core.js';
import { binomial } from './combinatorics.js';
import { HILO_SUIT_SYMBOLS, cardLabel, type HiloCard } from './hilo.js';

/**
 * Andar Bahar.
 *
 * A joker is turned face up, then cards are dealt alternately to two piles —
 * Andar (inside) and Bahar (outside). The first pile to receive a card of the
 * joker's RANK wins. Suits are irrelevant; only rank matters.
 *
 * WHY THE TWO SIDES PAY DIFFERENTLY
 * ---------------------------------
 * The joker's colour decides which pile is dealt first, and going first is a
 * real edge: after the joker there are 51 cards holding 3 matches, and the
 * side receiving positions 1,3,5,… wins whenever the earliest match lands on
 * an odd position.
 *
 *   P(first side)  = 10725 / 20825  ≈ 51.50%
 *   P(second side) = 10100 / 20825  ≈ 48.50%
 *
 * Both counts are exact: the earliest of 3 marked cards among 51 falls at
 * position k with probability C(51-k, 2) / C(51, 3), and the two sums below
 * are computed from that rather than hard-coded.
 *
 * Each side is then paid the exact inverse of its own probability, so the 2%
 * stake rake is the only house edge and BOTH sides return 98%. Picking the
 * long side buys variance, not value — which is the honest version of a game
 * usually sold with a hidden edge baked into the short side.
 */

export const GAME_CODE_ANDAR_BAHAR = 'ANDARBAHAR';

export type ABSide = 'andar' | 'bahar';
export type ABCard = HiloCard;

export const AB_DECK = 52;
/** A Fisher-Yates pass over 52 cards needs 51 swaps. */
export const AB_SHUFFLE_VALUES = AB_DECK - 1;

/** Cards left once the joker is out, and how many of them match its rank. */
const REMAINING = 51;
const MATCHES = 3;

/**
 * Winning-position counts, derived rather than asserted.
 * Odd deal positions go to the side dealt first.
 */
function positionCounts(): { first: bigint; second: bigint; total: bigint } {
  let first = 0n;
  let second = 0n;
  for (let k = 1; k <= REMAINING; k += 1) {
    const ways = binomial(REMAINING - k, MATCHES - 1);
    if (k % 2 === 1) first += ways;
    else second += ways;
  }
  return { first, second, total: binomial(REMAINING, MATCHES) };
}

export const AB_COUNTS = positionCounts();

export function abCardFromIndex(index: number): ABCard {
  const i = ((index % AB_DECK) + AB_DECK) % AB_DECK;
  return { rank: Math.floor(i / 4) + 1, suit: i % 4 };
}

export { cardLabel as abCardLabel, HILO_SUIT_SYMBOLS as AB_SUIT_SYMBOLS };

/** Suits 0 and 3 are the black ones (spades, clubs). */
export function isBlack(card: ABCard): boolean {
  return card.suit === 0 || card.suit === 3;
}

/**
 * A black joker sends the first card to Andar, a red one to Bahar — the
 * standard convention, and the reason the sides are symmetric before the
 * joker is known.
 */
export function firstSideFor(joker: ABCard): ABSide {
  return isBlack(joker) ? 'andar' : 'bahar';
}

export function otherSide(side: ABSide): ABSide {
  return side === 'andar' ? 'bahar' : 'andar';
}

/**
 * Shuffles the full deck from caller-supplied random values. Pure, so a player
 * verifying a past hand re-derives the values and calls this exact function.
 */
export function abShuffle(values: number[]): number[] {
  const deck = Array.from({ length: AB_DECK }, (_, i) => i);
  for (let i = AB_DECK - 1, v = 0; i > 0; i -= 1, v += 1) {
    const j = values[v] % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export interface ABHand {
  joker: ABCard;
  firstSide: ABSide;
  andar: ABCard[];
  bahar: ABCard[];
  winner: ABSide;
  /** 1-based position of the matching card in the deal order. */
  matchAt: number;
}

/**
 * Deals a hand from a shuffled deck: card 0 is the joker, the rest alternate
 * starting with `firstSideFor(joker)` until a rank match appears.
 *
 * A match is guaranteed — three of the remaining 51 cards share the joker's
 * rank — so `winner` is always set.
 */
export function abDeal(deck: number[]): ABHand {
  const joker = abCardFromIndex(deck[0]);
  const firstSide = firstSideFor(joker);

  const andar: ABCard[] = [];
  const bahar: ABCard[] = [];

  for (let i = 1; i < deck.length; i += 1) {
    const card = abCardFromIndex(deck[i]);
    const pos = i - 1; // 0-based position in the deal
    const side: ABSide = pos % 2 === 0 ? firstSide : otherSide(firstSide);
    (side === 'andar' ? andar : bahar).push(card);

    if (card.rank === joker.rank) {
      return { joker, firstSide, andar, bahar, winner: side, matchAt: pos + 1 };
    }
  }

  // Unreachable: 3 of the 51 remaining cards always match.
  throw new Error('andar bahar: deck contained no matching rank');
}

/** Exact odds for a side, given which side is dealt first. */
export function abOdds(side: ABSide, firstSide: ABSide): { num: bigint; den: bigint } {
  const wins = side === firstSide ? AB_COUNTS.first : AB_COUNTS.second;
  return { num: AB_COUNTS.total, den: wins };
}

/** Display multiplier, rounded DOWN so we never advertise above what we pay. */
export function abMultiplierX100(side: ABSide, firstSide: ABSide): number {
  const { num, den } = abOdds(side, firstSide);
  return Number((100n * num) / den);
}

/** Exact payout after the rake. Zero if the side lost. */
export function abPayout(
  stake: bigint,
  side: ABSide,
  firstSide: ABSide,
  winner: ABSide,
): bigint {
  if (side !== winner) return 0n;
  const { num, den } = abOdds(side, firstSide);
  return (contractAmount(stake) * num) / den;
}
