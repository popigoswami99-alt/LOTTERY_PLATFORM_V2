import { contractAmount } from '../core.js';

/**
 * MotoRace — pick one of N racers before the start; the winner is derived
 * from one draw off the player's seed pair, exactly as Wheel derives its
 * landed segment.
 *
 * Unlike Wheel there is no risk profile to choose: every racer has the same
 * 1-in-N chance, so the true odds are simply N, paid flat to whoever picks
 * the winner. This is the "honest" version of a race game -- no favourite,
 * no long shot, no hidden edge folded into the odds board. The house edge is
 * the usual 2% rake and nothing else, so every pick carries the identical
 * 98% RTP regardless of which racer is chosen.
 */

export const GAME_CODE_MOTORACE = 'MOTORACE';

/** Eight lanes reads well on a mobile-width race strip. */
export const MOTORACE_RACERS = 8;

export function isValidMotoRacePick(pick: number): boolean {
  return Number.isInteger(pick) && pick >= 0 && pick < MOTORACE_RACERS;
}

/** Maps one derived value to a winning lane in [0, MOTORACE_RACERS). */
export function motoRaceWinner(value52: number): number {
  return value52 % MOTORACE_RACERS;
}

/** True odds for any pick: N racers, uniform, so the fair multiplier is N. */
export function motoRaceOdds(): { num: bigint; den: bigint } {
  return { num: BigInt(MOTORACE_RACERS), den: 1n };
}

/** Display multiplier in hundredths — exact here since N divides evenly. */
export function motoRaceMultiplierX100(): number {
  return MOTORACE_RACERS * 100;
}

/** Exact payout after the rake. Zero unless the pick matches the winner. */
export function motoRacePayout(stake: bigint, pick: number, winner: number): bigint {
  if (pick !== winner) return 0n;
  const { num, den } = motoRaceOdds();
  return (contractAmount(stake) * num) / den;
}
