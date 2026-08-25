import { contractAmount } from '../core.js';

/**
 * Hi-Lo — a card is shown and the player calls whether the next will be higher
 * or lower. Correct calls compound the multiplier; the player can cash out at
 * any point, and one wrong call loses everything.
 *
 * Cards are drawn WITH replacement from a full 52-card deck, which is the
 * standard for provably-fair Hi-Lo: it keeps each step's odds a function of
 * the visible card alone, so the player can always see exactly what they are
 * being offered.
 *
 * Ties count as wins for whichever side was called. With ranks 1..13:
 *
 *   P(next >= r) = (14 - r) / 13      P(next <= r) = r / 13
 *
 * Each step pays the exact inverse of its own probability, so the compounded
 * multiplier after any run of calls is fair, and the rake is the only edge.
 */

export const GAME_CODE_HILO = 'HILO';

export const HILO_DECK = 52;
export const HILO_RANKS = 13;

export type HiloCall = 'higher' | 'lower';

export interface HiloCard {
  /** 1 = Ace (low) through 13 = King. */
  rank: number;
  /** 0 = spades, 1 = hearts, 2 = diamonds, 3 = clubs. */
  suit: number;
}

export const HILO_SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function cardFromValue(value52: number): HiloCard {
  const idx = value52 % HILO_DECK;
  return { rank: Math.floor(idx / 4) + 1, suit: idx % 4 };
}

export function cardLabel(card: HiloCard): string {
  return `${RANK_LABELS[card.rank]}${HILO_SUIT_SYMBOLS[card.suit]}`;
}

/**
 * Winning outcomes out of 13 for a call against the shown rank.
 * "higher" includes a tie; so does "lower".
 */
export function hiloWinCount(rank: number, call: HiloCall): number {
  return call === 'higher' ? 14 - rank : rank;
}

export function hiloWins(shown: HiloCard, next: HiloCard, call: HiloCall): boolean {
  return call === 'higher' ? next.rank >= shown.rank : next.rank <= shown.rank;
}

/**
 * A call with 13/13 winning outcomes is a certainty and pays 1x — offering it
 * would just be a way to waste the rake, so the UI disables it.
 */
export function isTrivialCall(rank: number, call: HiloCall): boolean {
  return hiloWinCount(rank, call) >= HILO_RANKS;
}

/** Step odds as an exact rational: 13 / winCount. */
export function hiloStepOdds(rank: number, call: HiloCall): { num: bigint; den: bigint } {
  return { num: BigInt(HILO_RANKS), den: BigInt(hiloWinCount(rank, call)) };
}

export function hiloStepMultiplierX100(rank: number, call: HiloCall): number {
  return Math.floor((100 * HILO_RANKS) / hiloWinCount(rank, call));
}

/**
 * Compounds a run of correct calls into one exact rational. Kept as a single
 * unreduced fraction so no rounding creeps in step by step — over a long run
 * that drift would be the player's money.
 */
export function hiloCompound(steps: Array<{ rank: number; call: HiloCall }>): {
  num: bigint;
  den: bigint;
} {
  let num = 1n;
  let den = 1n;
  for (const s of steps) {
    const o = hiloStepOdds(s.rank, s.call);
    num *= o.num;
    den *= o.den;
  }
  return { num, den };
}

export function hiloMultiplierX100(steps: Array<{ rank: number; call: HiloCall }>): number {
  const { num, den } = hiloCompound(steps);
  return Number((100n * num) / den);
}

/** Exact payout for a run of correct calls, after the rake. */
export function hiloPayout(
  stake: bigint,
  steps: Array<{ rank: number; call: HiloCall }>,
): bigint {
  const { num, den } = hiloCompound(steps);
  return (contractAmount(stake) * num) / den;
}
