/**
 * Engine-agnostic primitives: money, odds, period timing, socket contract.
 *
 * Nothing here knows about any particular game. Game rules live in ./games.
 */

// ---------------------------------------------------------------------------
// Odds — exact rationals, so 1.5x and 4.5x never touch a float
// ---------------------------------------------------------------------------

export interface Odds {
  num: number;
  den: number;
}

export const NO_ODDS: Odds = { num: 0, den: 1 };

/**
 * Multipliers are integer hundredths everywhere: 250 = 2.50x. Shared by Crash
 * and the instant games so there is one representation, never a float.
 */
export const X100 = 100;

export function formatX100(x100: number): string {
  return (x100 / X100).toFixed(2);
}

/** Parses "2.50" into 250, rejecting anything that is not a clean multiplier. */
export function parseMultiplier(text: string): number {
  const s = String(text).trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) throw new Error(`invalid multiplier: ${text}`);
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * X100 + Number(frac.padEnd(2, '0'));
}

export function oddsLabel(o: Odds): string {
  const v = o.num / o.den;
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '')}X`;
}

// ---------------------------------------------------------------------------
// House edge
// ---------------------------------------------------------------------------

/**
 * Fee taken off the stake before odds are applied, in basis points.
 * 200 bps = 2%, the standard rake for this game family.
 */
export const HOUSE_FEE_BPS = 200n;
export const BASIS = 10_000n;

/** Stake minus the house fee — the amount odds are actually applied to. */
export function contractAmount(stake: bigint): bigint {
  return (stake * (BASIS - HOUSE_FEE_BPS)) / BASIS;
}

/** Applies odds to a stake. Integer maths throughout; rounds down. */
export function payoutFor(stake: bigint, odds: Odds): bigint {
  return (contractAmount(stake) * BigInt(odds.num)) / BigInt(odds.den);
}

// ---------------------------------------------------------------------------
// Rooms and period timing
// ---------------------------------------------------------------------------

export interface RoomConfig {
  /** Stable key used in URLs, DB rows and socket channels, e.g. "WINGO_1M". */
  key: string;
  gameCode: string;
  label: string;
  /** Length of one period, in seconds. */
  intervalSec: number;
  /** Betting closes this many seconds before the period ends. */
  lockBeforeSec: number;
}

/**
 * Game day starts at midnight in this offset. Fixed rather than server-local so
 * period numbers stay stable regardless of where the process runs.
 * 330 = IST (UTC+5:30).
 */
export const GAME_TZ_OFFSET_MIN = 330;

export interface PeriodWindow {
  periodNo: string;
  index: number;
  startMs: number;
  lockMs: number;
  endMs: number;
}

/**
 * Maps any instant to the period containing it. Pure clock arithmetic — the
 * server never stores "the current period", it derives it, so a restart can
 * never lose track of where it is.
 */
export function periodWindowAt(room: RoomConfig, atMs: number): PeriodWindow {
  const offsetMs = GAME_TZ_OFFSET_MIN * 60_000;
  const local = atMs + offsetMs;
  const dayStartLocal = Math.floor(local / 86_400_000) * 86_400_000;

  const intervalMs = room.intervalSec * 1000;
  const index = Math.floor((local - dayStartLocal) / intervalMs);

  const startMs = dayStartLocal + index * intervalMs - offsetMs;
  const endMs = startMs + intervalMs;
  const lockMs = endMs - room.lockBeforeSec * 1000;

  const d = new Date(dayStartLocal);
  const ymd =
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');

  return {
    periodNo: `${ymd}${String(index + 1).padStart(4, '0')}`,
    index,
    startMs,
    lockMs,
    endMs,
  };
}

// ---------------------------------------------------------------------------
// Money formatting (display only — never used for calculation)
// ---------------------------------------------------------------------------

export const MINOR_PER_MAJOR = 100n;

export function formatMinor(minor: bigint | string | number): string {
  const v = typeof minor === 'bigint' ? minor : BigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const major = abs / MINOR_PER_MAJOR;
  const rest = abs % MINOR_PER_MAJOR;
  const s = `${major.toLocaleString('en-IN')}.${String(rest).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

export function toMinor(major: number | string): bigint {
  const s = String(major).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`invalid amount: ${major}`);
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole) * MINOR_PER_MAJOR + BigInt(frac.padEnd(2, '0'));
}

// ---------------------------------------------------------------------------
// Socket contract
// ---------------------------------------------------------------------------

export const SOCKET_EVENTS = {
  JOIN_ROOM: 'room:join',
  LEAVE_ROOM: 'room:leave',
  /** Server -> client: current period + remaining ms, emitted every second. */
  TICK: 'period:tick',
  /** Server -> client: betting just closed for the current period. */
  LOCKED: 'period:locked',
  /** Server -> client: result drawn and settled. */
  RESULT: 'period:result',
  /** Server -> client (private room): balance changed. */
  BALANCE: 'wallet:balance',
} as const;

export interface TickPayload {
  gameCode: string;
  roomKey: string;
  periodNo: string;
  serverSeedHash: string;
  status: 'OPEN' | 'LOCKED';
  /** Server time when this tick was emitted — clients sync their clock to it. */
  serverNowMs: number;
  endMs: number;
  lockMs: number;
  remainingMs: number;
}

export interface ResultPayload {
  gameCode: string;
  roomKey: string;
  periodNo: string;
  /** Game-specific result object. Shape is defined by each game's rules. */
  result: unknown;
  /** Denormalised single digit for games that have one (WinGo, TRX). */
  resultNumber: number | null;
  /** Revealed after the draw so players can verify serverSeedHash. */
  serverSeed: string;
}
