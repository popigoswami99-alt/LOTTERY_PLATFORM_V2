import { X100, contractAmount } from '../core.js';

/**
 * Crash — a multiplier climbs from 1.00x and busts at a secretly predetermined
 * point. Players bet during a short waiting window and must cash out before
 * the bust to win stake x multiplier.
 *
 * A DIFFERENT ENGINE SHAPE from the lottery games. There is no fixed period
 * derived from the clock; rounds run back to back, each as long as its own
 * crash point makes it. The phase machine is:
 *
 *   WAITING (bets open) -> RUNNING (multiplier climbing) -> CRASHED -> next
 *
 * Everything in this module is pure and shared with the browser, so the
 * multiplier the player watches climb is computed by the exact same function
 * the server uses to price a cashout. The client is never trusted for it — it
 * just avoids the two disagreeing.
 */

export const GAME_CODE_CRASH = 'CRASH';

/** Betting window before each round, in ms. */
export const CRASH_WAIT_MS = 7_000;
/** How long the bust is shown before the next round opens. */
export const CRASH_HOLD_MS = 4_000;

/**
 * Exponential growth rate, per second. ln(2)/6 puts 2.00x at six seconds,
 * which is the pacing this game is normally played at.
 */
export const CRASH_GROWTH_K = Math.LN2 / 6;

/** Hard ceiling on a crash point: 10,000.00x. */
export const MAX_CRASH_X100 = 1_000_000;
export const MIN_CRASH_X100 = 100;

/** The multiplier shown `elapsedMs` into the running phase. */
export function multiplierAtX100(elapsedMs: number): number {
  if (elapsedMs <= 0) return X100;
  const m = Math.exp(CRASH_GROWTH_K * (elapsedMs / 1000));
  return Math.max(X100, Math.floor(m * X100));
}

/** How long into the round the multiplier first reaches `x100`. */
export function timeToReachMs(x100: number): number {
  if (x100 <= X100) return 0;
  return (Math.log(x100 / X100) / CRASH_GROWTH_K) * 1000;
}

/**
 * Derives the crash point from 52 bits of seed-derived entropy.
 *
 * The distribution is exactly fair: P(crash >= t) = 100/t for any integer
 * target t. There is no hidden "instant bust" edge baked into the curve — the
 * house edge is the same 2% stake rake used by every other game here, so a
 * cashout target of 1.50x and one of 50x have identical 98% RTP.
 *
 * Proof that the flooring is harmless: floor(x) >= t is equivalent to x >= t
 * for integer t, so flooring does not move the win probability at all.
 */
export function crashPointFromValue(value52: number, bits = 52): number {
  const span = Math.pow(2, bits);
  const u = value52 / span; // uniform in [0, 1)
  const raw = (X100 / (1 - u)) * 1; // 100 / (1-u) == multiplier x100
  if (!Number.isFinite(raw)) return MAX_CRASH_X100;
  return Math.min(MAX_CRASH_X100, Math.max(MIN_CRASH_X100, Math.floor(raw)));
}

/** Total running time of a round that busts at `crashX100`. */
export function roundDurationMs(crashX100: number): number {
  return timeToReachMs(crashX100);
}

/**
 * Payout for cashing out at `cashoutX100`. Applies the same 2% rake as every
 * other game, then multiplies. Integer maths throughout.
 */
export function crashPayout(stake: bigint, cashoutX100: number): bigint {
  return (contractAmount(stake) * BigInt(cashoutX100)) / BigInt(X100);
}

export type CrashPhase = 'WAITING' | 'RUNNING' | 'CRASHED';

export const CRASH_EVENTS = {
  /** Server -> client, several times a second: whole round state. */
  STATE: 'crash:state',
  /** Server -> client: the round just busted, seed revealed. */
  BUST: 'crash:bust',
  /** Server -> client: someone cashed out (for the live player list). */
  CASHOUT: 'crash:cashout',
} as const;

export interface CrashStatePayload {
  roundNo: string;
  phase: CrashPhase;
  serverSeedHash: string;
  serverNowMs: number;
  /** When the running phase began. Clients derive the multiplier from this. */
  startedAtMs: number | null;
  /** When the current waiting phase ends (phase WAITING only). */
  waitingEndsAtMs: number | null;
  /** Present only once the round has busted. */
  crashPointX100: number | null;
  serverSeed: string | null;
  /** Live multiplier at the moment this was emitted (RUNNING only). */
  multiplierX100: number;
}

export interface CrashCashoutPayload {
  roundNo: string;
  nickname: string;
  multiplierX100: number;
  payout: string;
}
