import type { Odds, RoomConfig } from '../core.js';

/**
 * The contract every game engine implements.
 *
 * Adding a game means writing one of these and registering it — the period
 * scheduler, bet placement, settlement, the ledger and the socket layer are
 * all game-agnostic and need no changes.
 *
 * Every method here is PURE. A game's rules never touch the database, the
 * clock, or the network, which is what makes them exhaustively testable and
 * lets the web client import the exact same module the server settles with.
 */
export interface GameRules<TResult = unknown> {
  gameCode: string;
  label: string;
  rooms: RoomConfig[];

  /**
   * Number of independent random values this game's draw consumes, and the
   * range of each. The server turns the committed seed into exactly this many
   * values and hands them to `buildResult`; keeping the crypto server-side is
   * what lets this module stay browser-safe.
   */
  draw: { count: number; modulus: number };

  /** Turns the drawn random values into this game's result object. */
  buildResult(values: number[]): TResult;

  /**
   * Denormalised single digit for games that have one, used for history
   * display and indexing. Null for games whose result is not one digit.
   */
  resultDigit(result: TResult): number | null;

  /** Throws if this bet type / selection pair is not a legal bet. */
  validateSelection(betType: string, selection: string): void;

  /** Odds shown on the bet panel before the result is known. */
  displayOdds(betType: string, selection: string): Odds;

  /** Decides one bet against a result. THE function that turns a draw into money. */
  resolve(bet: ResolvableBet, result: TResult): Outcome;

  /** Compact summary for a history row. */
  describe(result: TResult): ResultSummary;
}

export interface ResolvableBet {
  betType: string;
  selection: string;
  stake: bigint;
}

export interface Outcome {
  won: boolean;
  odds: Odds;
  /** Gross amount credited back to the player. 0 when the bet loses. */
  payout: bigint;
}

export interface ResultSummary {
  /** Main value shown in the history table, e.g. "7" or "4+2+6 = 12". */
  primary: string;
  /** Secondary chips, e.g. ["Big", "Green"]. */
  tags: string[];
}

export class InvalidBetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBetError';
  }
}
