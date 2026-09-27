/**
 * End-to-end test for Dragon Tiger against a RUNNING api.
 *
 *   npx tsx scripts/smoke-dragontiger.ts
 *
 * Plays real hands on all three bets, then rotates the seed pair and re-deals
 * every recorded hand from the revealed seed.
 */

import { createHash, createHmac } from 'node:crypto';
import {
  DT_COUNTS,
  DT_DRAW_VALUES,
  DT_SIDES,
  abCardLabel,
  dtDraw,
  dtMultiplierX100,
  dtPayout,
  dtWinner,
  formatMinor,
  formatX100,
  type ABCard,
  type DTSide,
} from '@lp/shared';

const API = process.env.SMOKE_API ?? 'http://localhost:4000';

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`   ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures += 1;
};

let token = '';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = (await res.json()) as { ok: boolean; data?: T; message?: string; code?: string };
  if (!res.ok || !body.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${body.code}: ${body.message}`);
  }
  return body.data as T;
}

function derive(serverSeed: string, clientSeed: string, nonce: number, cursor: number): number {
  const mac = createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:${cursor}`)
    .digest('hex');
  return Number(BigInt('0x' + mac.slice(0, 13)));
}

const START = 5_000_000n; // ₹50,000
const STAKE = 10_000n; // ₹100

interface PlayRes {
  side: DTSide;
  dragon: ABCard;
  tiger: ABCard;
  winner: DTSide;
  won: boolean;
  multiplierX100: number;
  payout: string;
  balance: string;
}

async function main() {
  console.log(`\n=== Dragon Tiger E2E: ${API} ===\n`);

  const phone = String(9_000_000_000 + Math.floor(Math.random() * 999_999_999));
  const auth = await call<{ accessToken: string; user: { nickname: string } }>(
    '/api/auth/register',
    { method: 'POST', body: JSON.stringify({ phone, password: 'test1234' }) },
  );
  token = auth.accessToken;
  await call('/api/wallet/dev/credit', {
    method: 'POST',
    body: JSON.stringify({ amount: START.toString() }),
  });
  await call('/api/instant/seed/client', {
    method: 'POST',
    body: JSON.stringify({ clientSeed: 'dt-smoke' }),
  });
  const seed0 = await call<{ serverSeedHash: string }>('/api/instant/seed');
  console.log(`player ${auth.user.nickname}, commitment ${seed0.serverSeedHash.slice(0, 16)}…\n`);

  // -------------------------------------------------------------------------
  console.log('1. Quoted odds');
  {
    const odds = await call<Record<DTSide, number>>('/api/instant/dragontiger/odds');
    console.log(
      `   dragon ${formatX100(odds.dragon)}x · tiger ${formatX100(odds.tiger)}x · tie ${formatX100(odds.tie)}x`,
    );
    for (const s of DT_SIDES) {
      check(odds[s] === dtMultiplierX100(s), `${s} quoted at its true-odds multiplier`);
    }
    check(odds.dragon === odds.tiger, 'the two sides are priced symmetrically');
    check(odds.tie > odds.dragon, 'the tie pays far more than a side');
  }

  // -------------------------------------------------------------------------
  console.log('\n2. Playing each bet');
  {
    let balance = START;
    for (const side of DT_SIDES) {
      const r = await call<PlayRes>('/api/instant/dragontiger/play', {
        method: 'POST',
        body: JSON.stringify({ stake: STAKE.toString(), side }),
      });

      const expectedWinner = dtWinner({ dragon: r.dragon, tiger: r.tiger });
      const expectedPayout = dtPayout(STAKE, side, r.winner);
      balance = balance - STAKE + BigInt(r.payout);

      console.log(
        `   backed ${side.padEnd(6)} · ${abCardLabel(r.dragon)} vs ${abCardLabel(r.tiger)} ` +
          `-> ${r.winner}${r.won ? ` +₹${formatMinor(r.payout)}` : ''}`,
      );

      check(r.winner === expectedWinner, `${side}: winner matches the higher card`);
      check(r.won === (r.winner === side), `${side}: win flag agrees with the winner`);
      check(BigInt(r.payout) === expectedPayout, `${side}: payout is exact true odds`);
      check(BigInt(r.balance) === balance, `${side}: wallet reflects the settlement`);
    }
  }

  // -------------------------------------------------------------------------
  console.log('\n3. Never the same card twice, and ties are reachable');
  {
    let ties = 0;
    let dupes = 0;
    const N = 40;
    for (let i = 0; i < N; i += 1) {
      const r = await call<PlayRes>('/api/instant/dragontiger/play', {
        method: 'POST',
        body: JSON.stringify({ stake: STAKE.toString(), side: 'dragon' }),
      });
      if (r.dragon.rank === r.tiger.rank && r.dragon.suit === r.tiger.suit) dupes += 1;
      if (r.winner === 'tie') ties += 1;
    }
    check(dupes === 0, `no hand dealt the same card to both seats (${N} hands)`);
    console.log(`   ${ties} tie(s) in ${N} hands (expected about ${(N / 17).toFixed(1)})`);
  }

  // -------------------------------------------------------------------------
  console.log('\n4. Rejecting a bad side');
  {
    let accepted = false;
    try {
      await call('/api/instant/dragontiger/play', {
        method: 'POST',
        body: JSON.stringify({ stake: STAKE.toString(), side: 'phoenix' }),
      });
      accepted = true;
    } catch {
      /* expected */
    }
    check(!accepted, 'an unknown side is refused');
  }

  // -------------------------------------------------------------------------
  console.log('\n5. Verification against the revealed seed');
  {
    const rot = await call<{
      revealed: { serverSeed: string; serverSeedHash: string; clientSeed: string };
    }>('/api/instant/seed/rotate', { method: 'POST', body: '{}' });

    const rehash = createHash('sha256').update(rot.revealed.serverSeed).digest('hex');
    check(rehash === seed0.serverSeedHash, 'revealed seed hashes to the original commitment');

    const history = await call<
      Array<{ resultData: { dragon: ABCard; tiger: ABCard; winner: DTSide } | null; nonce: number }>
    >('/api/instant/history?game=DRAGONTIGER&take=60');

    const { serverSeed, clientSeed } = rot.revealed;
    let verified = 0;
    let mismatched = 0;

    for (const h of history) {
      if (!h.resultData) continue;
      const values = Array.from({ length: DT_DRAW_VALUES }, (_, i) =>
        derive(serverSeed, clientSeed, h.nonce, i),
      );
      const expect = dtDraw(values);
      const same =
        expect.dragon.rank === h.resultData.dragon.rank &&
        expect.dragon.suit === h.resultData.dragon.suit &&
        expect.tiger.rank === h.resultData.tiger.rank &&
        expect.tiger.suit === h.resultData.tiger.suit &&
        dtWinner(expect) === h.resultData.winner;
      same ? (verified += 1) : (mismatched += 1);
    }

    console.log(`   re-dealt ${verified} hands independently`);
    check(verified >= 40, 'every recorded hand was reproducible from the seed');
    check(mismatched === 0, 'no hand differed from its re-derivation');
  }

  // -------------------------------------------------------------------------
  console.log('\n6. Sanity: the derived counts still describe the game');
  check(
    DT_COUNTS.dragon + DT_COUNTS.tiger + DT_COUNTS.tie === DT_COUNTS.total,
    'the three outcome counts partition the whole space',
  );

  const integrity = await call<{ ok: boolean; total: string }>('/api/wallet/integrity');
  console.log(
    `\nledger conservation: every entry sums to ${integrity.total} ${integrity.ok ? '✓' : '✗ MONEY LEAKED'}`,
  );
  if (!integrity.ok) failures += 1;

  console.log(`\n=== ${failures === 0 ? 'PASSED' : `FAILED (${failures})`} ===\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nsmoke-dragontiger failed:', err);
  process.exit(1);
});
