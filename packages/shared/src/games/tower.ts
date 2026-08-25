import { X100, contractAmount } from '../core.js';

export const GAME_CODE_CHICKEN = 'CHICKEN';

export const TOWER_ROWS = 10;
export const TOWER_COLS = 5;
export const TOWER_MIN_MINES = 1;
export const TOWER_MAX_MINES = 4;

/**
 * Multiplier after `rowsCleared` with `mines` per row.
 * Probability of clearing one row is (5 - mines) / 5.
 * Probability of clearing `k` rows is P = ((5 - mines) / 5)^k.
 * Exact odds inverse = 1 / P = 5^k / (5 - mines)^k.
 */
export function towerOdds(mines: number, rowsCleared: number): { num: bigint; den: bigint } | null {
  const safe = TOWER_COLS - mines;
  if (rowsCleared <= 0) return { num: 1n, den: 1n };
  if (rowsCleared > TOWER_ROWS) return null;

  let num = 1n;
  let den = 1n;
  for (let i = 0; i < rowsCleared; i += 1) {
    num *= BigInt(TOWER_COLS);
    den *= BigInt(safe);
  }
  return { num, den };
}

/** Rounded down to hundredths FOR DISPLAY. Do not price payouts with this. */
export function towerMultiplierX100(mines: number, rowsCleared: number): number {
  const odds = towerOdds(mines, rowsCleared);
  if (!odds) return 0;
  return Number((BigInt(X100) * odds.num) / odds.den);
}

/**
 * Exact payout at true odds, after the rake.
 */
export function towerPayout(stake: bigint, mines: number, rowsCleared: number): bigint {
  const odds = towerOdds(mines, rowsCleared);
  if (!odds) return 0n;
  return (contractAmount(stake) * odds.num) / odds.den;
}

/** Full multiplier ladder for a mine count — what the UI shows per step. */
export function towerLadder(mines: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= TOWER_ROWS; k += 1) out.push(towerMultiplierX100(mines, k));
  return out;
}

export function isValidTowerMineCount(mines: number): boolean {
  return Number.isInteger(mines) && mines >= TOWER_MIN_MINES && mines <= TOWER_MAX_MINES;
}

/**
 * Places `mines` mines on a single row using a Fisher-Yates shuffle driven by
 * caller-supplied random values.
 * Returns an array of mine positions (0-4) for this row.
 */
export function towerRowMinesFromValues(values: number[], mines: number): number[] {
  const deck = [0, 1, 2, 3, 4];
  for (let i = 0; i < mines; i += 1) {
    const swap = i + (values[i] % (TOWER_COLS - i));
    const tmp = deck[i];
    deck[i] = deck[swap];
    deck[swap] = tmp;
  }
  return deck.slice(0, mines);
}
