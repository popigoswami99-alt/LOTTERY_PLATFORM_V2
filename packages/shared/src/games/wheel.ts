import { contractAmount } from '../core.js';
import { fairTable, type FairTable } from './combinatorics.js';

/**
 * Wheel — a turntable of equal segments, each carrying a multiplier. One spin
 * lands on one segment and pays that multiplier.
 *
 * As with Plinko and Keno the paytable is generated, not hand-tuned. Each risk
 * level is a set of tiers `{ multiplier, count }` whose counts fill the wheel
 * and whose `count * multiplier` sums to the segment count — i.e. the average
 * multiplier is exactly 1x before the rake. `fairTable` then returns those exact
 * multipliers, and the uniform 2% rake gives every risk level the identical 98%
 * RTP. Low, medium and high change only the shape (variance), never the edge.
 *
 * The whole game is a pure function of one derived value, so the client can
 * re-derive the landed segment from the revealed seed pair and check it.
 */

export const GAME_CODE_WHEEL = 'WHEEL';

/** Every risk level uses the same number of segments, for a consistent wheel. */
export const WHEEL_SEGMENTS = 30;

export type WheelRisk = 'low' | 'medium' | 'high';
export const WHEEL_RISKS: WheelRisk[] = ['low', 'medium', 'high'];

export function isValidWheelRisk(risk: string): risk is WheelRisk {
  return (WHEEL_RISKS as string[]).includes(risk);
}

/**
 * Tiers per risk level: `multX100` is the multiplier in hundredths, `count` how
 * many of the 30 segments carry it. For each profile:
 *   sum(count)          === WHEEL_SEGMENTS
 *   sum(count * multX100) === 100 * WHEEL_SEGMENTS
 * The second identity is the fairness condition (expected multiplier 1x before
 * the rake); it is asserted in the test suite for every risk.
 */
interface Tier {
  multX100: number;
  count: number;
}

const PROFILES: Record<WheelRisk, Tier[]> = {
  // Low variance: no big jackpot, most spins return something.
  low: [
    { multX100: 0, count: 7 },
    { multX100: 120, count: 15 },
    { multX100: 150, count: 8 },
  ],
  // Medium: more losing segments bought back by larger wins.
  medium: [
    { multX100: 0, count: 19 },
    { multX100: 200, count: 9 },
    { multX100: 600, count: 2 },
  ],
  // High: mostly losing, with a single rich jackpot segment.
  high: [
    { multX100: 0, count: 25 },
    { multX100: 200, count: 4 },
    { multX100: 2200, count: 1 },
  ],
};

const tableCache = new Map<WheelRisk, FairTable>();
const layoutCache = new Map<WheelRisk, number[]>();

function tableFor(risk: WheelRisk): FairTable {
  const hit = tableCache.get(risk);
  if (hit) return hit;
  const tiers = PROFILES[risk];
  const table = fairTable(
    tiers.map((t) => BigInt(t.multX100)),
    tiers.map((t) => BigInt(t.count)),
    BigInt(WHEEL_SEGMENTS),
  );
  tableCache.set(risk, table);
  return table;
}

/**
 * Which tier sits at each of the 30 segment positions, spread with a smooth
 * weighted round-robin so identical multipliers are distributed around the
 * wheel rather than clustered. Deterministic and shared, so the server's
 * scoring and the client's rendering land on the same segment.
 */
function layoutFor(risk: WheelRisk): number[] {
  const hit = layoutCache.get(risk);
  if (hit) return hit;

  const counts = PROFILES[risk].map((t) => t.count);
  const acc = counts.map(() => 0);
  const layout: number[] = [];

  for (let i = 0; i < WHEEL_SEGMENTS; i += 1) {
    for (let t = 0; t < counts.length; t += 1) acc[t] += counts[t];
    let best = 0;
    for (let t = 1; t < counts.length; t += 1) if (acc[t] > acc[best]) best = t;
    acc[best] -= WHEEL_SEGMENTS;
    layout.push(best);
  }

  layoutCache.set(risk, layout);
  return layout;
}

export interface WheelSegment {
  tier: number;
  multiplierX100: number;
}

/** The wheel as the UI draws it: one entry per segment, in order. */
export function wheelSegments(risk: WheelRisk): WheelSegment[] {
  const table = tableFor(risk);
  return layoutFor(risk).map((tier) => ({ tier, multiplierX100: table.multiplierX100(tier) }));
}

/** The distinct multipliers present at a risk level, for a legend. */
export function wheelMultipliers(risk: WheelRisk): number[] {
  const table = tableFor(risk);
  return PROFILES[risk].map((_, i) => table.multiplierX100(i));
}

/** Maps one derived value to a landed segment index in [0, WHEEL_SEGMENTS). */
export function wheelSpin(value52: number): number {
  return value52 % WHEEL_SEGMENTS;
}

/** Display multiplier of the landed segment. Do not price payouts with this. */
export function wheelMultiplierX100(risk: WheelRisk, segmentIndex: number): number {
  return tableFor(risk).multiplierX100(layoutFor(risk)[segmentIndex]);
}

/** Exact payout for the landed segment, after the rake. */
export function wheelPayout(stake: bigint, risk: WheelRisk, segmentIndex: number): bigint {
  const { num, den } = tableFor(risk).odds(layoutFor(risk)[segmentIndex]);
  if (num === 0n) return 0n;
  return (contractAmount(stake) * num) / den;
}
