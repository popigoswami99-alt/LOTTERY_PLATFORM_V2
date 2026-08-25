import { X100, contractAmount } from '../core.js';

/**
 * Instant games — Dice, Limbo and Mines.
 *
 * A THIRD engine shape. The lottery games share a clock-derived period; Crash
 * shares a continuous round; these are single-player and resolve immediately,
 * with no shared state at all.
 *
 * That changes the fairness scheme. There is no per-round commitment to
 * publish, so instead each player holds a SEED PAIR:
 *
 *   - a server seed, of which only SHA-256(serverSeed) is shown,
 *   - a client seed the player chooses and can change at any time,
 *   - a nonce that increments on every bet.
 *
 * Each outcome is HMAC-SHA256(serverSeed, `clientSeed:nonce:cursor`). The
 * player can rotate the pair whenever they like: the old server seed is
 * revealed and a new commitment issued, letting them re-derive and check every
 * bet they made under it. Because the player contributes the client seed, the
 * operator cannot pick a server seed that is favourable against a known
 * sequence of bets.
 *
 * All payout maths is integer. Multipliers are hundredths, as in Crash.
 */

export const GAME_CODE_DICE = 'DICE';
export const GAME_CODE_LIMBO = 'LIMBO';
export const GAME_CODE_MINES = 'MINES';

/** Applies the same 2% rake as every other game, then multiplies. */
export function instantPayout(stake: bigint, multiplierX100: number): bigint {
  return (contractAmount(stake) * BigInt(multiplierX100)) / BigInt(X100);
}

// ---------------------------------------------------------------------------
// Dice
// ---------------------------------------------------------------------------

/** Rolls land on 0..9999, displayed as 0.00 - 99.99. */
export const DICE_ROLL_SPAN = 10_000;
export const DICE_MAX_ROLL = DICE_ROLL_SPAN - 1;

/** Win chance is clamped to 1% - 99%, which caps the multiplier at 100x. */
export const DICE_MIN_WIN_COUNT = 100;
export const DICE_MAX_WIN_COUNT = 9_900;

export type DiceDirection = 'over' | 'under';

/** Maps 52 bits of entropy to a roll in 0..9999. */
export function diceRollFromValue(value52: number, bits = 52): number {
  const span = Math.pow(2, bits);
  return Math.min(DICE_MAX_ROLL, Math.floor((value52 / span) * DICE_ROLL_SPAN));
}

/** How many of the 10,000 outcomes win, for this target and direction. */
export function diceWinCount(target: number, direction: DiceDirection): number {
  return direction === 'under' ? target : DICE_MAX_ROLL - target;
}

export function diceWins(roll: number, target: number, direction: DiceDirection): boolean {
  return direction === 'under' ? roll < target : roll > target;
}

/**
 * True odds for the chosen win chance, rounded down to hundredths FOR DISPLAY.
 *
 * Do not price a payout with this — see `dicePayout`. At 75% win chance the
 * true multiplier is 1.3333x and this returns 1.33x, which would quietly cost
 * the player an extra 0.25% on top of the rake.
 */
export function diceMultiplierX100(winCount: number): number {
  return Math.floor((X100 * DICE_ROLL_SPAN) / winCount);
}

/**
 * Exact payout at true odds: stake x (10000 / winCount), after the rake.
 *
 * Kept as one rational division so no intermediate rounding happens. This is
 * what keeps RTP at exactly 98% for every win chance instead of drifting
 * against the player at low multipliers.
 */
export function dicePayout(stake: bigint, winCount: number): bigint {
  return (contractAmount(stake) * BigInt(DICE_ROLL_SPAN)) / BigInt(winCount);
}

export function isValidDiceTarget(target: number, direction: DiceDirection): boolean {
  if (!Number.isInteger(target) || target < 0 || target > DICE_MAX_ROLL) return false;
  const count = diceWinCount(target, direction);
  return count >= DICE_MIN_WIN_COUNT && count <= DICE_MAX_WIN_COUNT;
}

/** Formats a roll or target for display: 4523 -> "45.23". */
export function formatRoll(v: number): string {
  return (v / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Limbo
// ---------------------------------------------------------------------------

export const LIMBO_MIN_TARGET_X100 = 101; // 1.01x
export const LIMBO_MAX_TARGET_X100 = 1_000_000; // 10,000.00x

/**
 * Limbo draws a multiplier from exactly the same fair distribution as Crash —
 * P(result >= t) = 100/t — but resolves instantly instead of climbing. Win if
 * the drawn multiplier reached your target.
 */
export function limboResultFromValue(value52: number, bits = 52): number {
  const span = Math.pow(2, bits);
  const u = value52 / span;
  const raw = X100 / (1 - u);
  if (!Number.isFinite(raw)) return LIMBO_MAX_TARGET_X100;
  return Math.min(LIMBO_MAX_TARGET_X100, Math.max(X100, Math.floor(raw)));
}

export function limboWins(resultX100: number, targetX100: number): boolean {
  return resultX100 >= targetX100;
}

export function isValidLimboTarget(targetX100: number): boolean {
  return (
    Number.isInteger(targetX100) &&
    targetX100 >= LIMBO_MIN_TARGET_X100 &&
    targetX100 <= LIMBO_MAX_TARGET_X100
  );
}

// ---------------------------------------------------------------------------
// Mines
// ---------------------------------------------------------------------------

export const MINES_TILES = 25; // 5 x 5
export const MINES_MIN = 1;
export const MINES_MAX = 24;

/**
 * Multiplier after `revealed` safe tiles with `mines` mines on the board.
 *
 * This is the exact inverse of the probability of getting that far:
 *
 *   1 / P = product over i of (25 - i) / (25 - mines - i)
 *
 * Computed with BigInt because the products overflow double precision well
 * before the last tile, and a rounding error here is a payout error.
 */
export function minesOdds(mines: number, revealed: number): { num: bigint; den: bigint } | null {
  const safe = MINES_TILES - mines;
  if (revealed <= 0) return { num: 1n, den: 1n };
  if (revealed > safe) return null;

  let num = 1n;
  let den = 1n;
  for (let i = 0; i < revealed; i += 1) {
    num *= BigInt(MINES_TILES - i);
    den *= BigInt(safe - i);
  }
  return { num, den };
}

/** Rounded down to hundredths FOR DISPLAY. Do not price payouts with this. */
export function minesMultiplierX100(mines: number, revealed: number): number {
  const odds = minesOdds(mines, revealed);
  if (!odds) return 0;
  return Number((BigInt(X100) * odds.num) / odds.den);
}

/**
 * Exact payout at true odds, after the rake.
 *
 * The ladder rational must be applied in one division. Rounding it to
 * hundredths first costs the player up to 0.6% at the low rungs — at 1 mine
 * and 2 reveals the true multiplier is 1.0869x, and 1.08x is not the same bet.
 */
export function minesPayout(stake: bigint, mines: number, revealed: number): bigint {
  const odds = minesOdds(mines, revealed);
  if (!odds) return 0n;
  return (contractAmount(stake) * odds.num) / odds.den;
}

/** Full multiplier ladder for a mine count — what the UI shows per step. */
export function minesLadder(mines: number): number[] {
  const safe = MINES_TILES - mines;
  const out: number[] = [];
  for (let k = 1; k <= safe; k += 1) out.push(minesMultiplierX100(mines, k));
  return out;
}

export function isValidMineCount(mines: number): boolean {
  return Number.isInteger(mines) && mines >= MINES_MIN && mines <= MINES_MAX;
}

/**
 * Places `mines` mines on the board using a Fisher-Yates shuffle driven by
 * caller-supplied random values (one per swap, each already reduced to range).
 *
 * Taking the values as an argument keeps this pure and browser-safe: the
 * server derives them from the seed pair and passes them in, and a player
 * verifying a past bet can re-derive them and call this exact function.
 */
export function placeMines(mines: number, values: number[]): number[] {
  const deck = Array.from({ length: MINES_TILES }, (_, i) => i);
  for (let i = MINES_TILES - 1, v = 0; i > 0; i -= 1, v += 1) {
    const j = values[v] % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, mines).sort((a, b) => a - b);
}

/** Swaps a Fisher-Yates shuffle needs — how many random values to derive. */
export const MINES_SHUFFLE_VALUES = MINES_TILES - 1;

export interface SeedInfo {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}
