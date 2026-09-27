/**
 * End-to-end smoke test against a RUNNING api.
 *
 *   npm run dev:api                       # in one terminal
 *   npx tsx scripts/smoke.ts              # runs every registered game
 *   npx tsx scripts/smoke.ts WINGO_30S    # or one specific room
 *
 * For each room it registers a fresh player, credits a dev balance, covers
 * every bet type on a live period, waits for the real scheduler to draw it,
 * then checks that payouts match what the shared rules say they should be,
 * that the revealed seed matches the pre-published commitment, and that the
 * ledger still balances to zero across the whole system.
 */

import { createHash } from 'node:crypto';
import { GAMES, formatMinor, rulesForRoom, type GameRules } from '@lp/shared';

const API = process.env.SMOKE_API ?? 'http://localhost:4000';

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
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${body.code}: ${body.message}`);
  }
  return body.data as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface State {
  periodNo: string;
  status: string;
  remainingMs: number;
  serverSeedHash: string;
}

/** The bets each game is exercised with — at least one of every bet type. */
const BET_MATRIX: Record<string, Array<{ betType: string; selection: string }>> = {
  WINGO: [
    { betType: 'COLOUR', selection: 'green' },
    { betType: 'COLOUR', selection: 'red' },
    { betType: 'COLOUR', selection: 'violet' },
    { betType: 'SIZE', selection: 'big' },
    { betType: 'SIZE', selection: 'small' },
    { betType: 'NUMBER', selection: '7' },
  ],
  K3: [
    { betType: 'SIZE', selection: 'big' },
    { betType: 'SIZE', selection: 'small' },
    { betType: 'PARITY', selection: 'odd' },
    { betType: 'PARITY', selection: 'even' },
    { betType: 'TOTAL', selection: '10' },
    { betType: 'TRIPLE_ANY', selection: 'any' },
    { betType: 'TRIPLE_EXACT', selection: '6' },
    { betType: 'DOUBLE_EXACT', selection: '3' },
    { betType: 'COMBO', selection: '2,5' },
  ],
};

let failures = 0;

async function testRoom(roomKey: string): Promise<void> {
  const rules = rulesForRoom(roomKey) as GameRules<unknown>;
  const bets = BET_MATRIX[rules.gameCode];
  if (!bets) {
    console.log(`\n--- ${roomKey}: no bet matrix for ${rules.gameCode}, skipping ---`);
    return;
  }

  console.log(`\n=== ${rules.label} · ${roomKey} ===`);

  // 1, 2 & 3. Get a funded player and every bet onto ONE period ---------------
  //
  // The 30s room locks 5s before it ends, and placing a full bet matrix takes
  // several sequential requests. If the period rolls over mid-way the bets
  // split across two periods, and the later checks — which only look at one
  // period — would report a mismatch that is an artefact of the test, not a
  // fault in the server.
  //
  // So: demand real headroom, and if a bet still lands on a different period,
  // abandon that player entirely and start again with a fresh one. Retrying on
  // the SAME player would leave the discarded stakes on their balance and
  // break the arithmetic check at step 8.
  const START = 1_000_000n; // ₹10,000
  const STAKE = '10000'; // ₹100 each
  const HEADROOM_MS = 12_000;

  let state!: State;
  let staked = 0n;

  for (let attempt = 1; ; attempt += 1) {
    if (attempt > 4) throw new Error('could not place a full bet matrix inside one period');

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
    console.log(`1. ${auth.user.nickname} credited ₹${formatMinor(START)}`);

    state = await call<State>(`/api/rooms/${roomKey}/state`);
    while (state.status !== 'OPEN' || state.remainingMs < HEADROOM_MS) {
      await sleep(500);
      state = await call<State>(`/api/rooms/${roomKey}/state`);
    }
    console.log(
      `2. period ${state.periodNo}, ${Math.round(state.remainingMs / 1000)}s left, commitment ${state.serverSeedHash.slice(0, 16)}…`,
    );

    staked = 0n;
    let split = false;

    for (const b of bets) {
      const r = await call<{ stake: string; periodNo: string }>(`/api/rooms/${roomKey}/bet`, {
        method: 'POST',
        body: JSON.stringify({ ...b, unitAmount: STAKE, multiplier: 1 }),
      });
      if (r.periodNo !== state.periodNo) {
        split = true;
        break;
      }
      staked += BigInt(r.stake);
    }

    if (!split) break;
    console.log('   period rolled over mid-placement — starting over with a fresh player');
    await sleep(1000);
  }

  console.log(`3. placed ${bets.length} bets, staked ₹${formatMinor(staked)}`);

  // 4. Betting must close ------------------------------------------------------
  for (;;) {
    const s = await call<State>(`/api/rooms/${roomKey}/state`);
    if (s.periodNo !== state.periodNo) break;
    if (s.status === 'LOCKED') {
      try {
        await call(`/api/rooms/${roomKey}/bet`, {
          method: 'POST',
          body: JSON.stringify({ ...bets[0], unitAmount: STAKE, multiplier: 1 }),
        });
        console.log('4. ✗ FAIL: a bet was accepted after lock');
        failures += 1;
      } catch {
        console.log('4. betting correctly rejected after lock');
      }
      break;
    }
    await sleep(500);
  }

  // 5. Wait for the draw -------------------------------------------------------
  interface ResultRow {
    periodNo: string;
    result: unknown;
    serverSeed: string;
    summary: { primary: string; tags: string[] };
  }
  let drawn: ResultRow | undefined;
  for (let i = 0; i < 45 && !drawn; i += 1) {
    await sleep(1000);
    const rows = await call<ResultRow[]>(`/api/rooms/${roomKey}/results?take=5`);
    drawn = rows.find((r) => r.periodNo === state.periodNo);
  }
  if (!drawn) throw new Error(`period ${state.periodNo} was never drawn`);
  console.log(`5. drawn: ${drawn.summary.primary}  [${drawn.summary.tags.join(', ')}]`);

  // 6. Verify the commitment ---------------------------------------------------
  const rehash = createHash('sha256').update(drawn.serverSeed).digest('hex');
  const fair = rehash === state.serverSeedHash;
  console.log(`6. revealed seed matches the pre-published commitment: ${fair ? 'YES' : 'NO'}`);
  if (!fair) failures += 1;

  // 7. Check every payout against the shared rules -----------------------------
  interface MyBet {
    periodNo: string;
    betType: string;
    selection: string;
    stake: string;
    status: string;
    payout: string;
  }
  // Belt and braces: settlement is a separate pass from the draw, so wait for
  // every bet on this period to leave PENDING before judging the payouts.
  let mine: MyBet[] = [];
  for (let i = 0; i < 30; i += 1) {
    mine = (await call<MyBet[]>(`/api/rooms/${roomKey}/my-bets?take=50`)).filter(
      (b) => b.periodNo === state.periodNo,
    );
    if (mine.length === bets.length && mine.every((b) => b.status !== 'PENDING')) break;
    await sleep(300);
  }

  let expectedTotal = 0n;
  let mismatches = 0;

  for (const b of mine) {
    const expected = rules.resolve(
      { betType: b.betType, selection: b.selection, stake: BigInt(b.stake) },
      drawn.result,
    );
    expectedTotal += expected.payout;
    const ok = expected.payout === BigInt(b.payout);
    if (!ok) {
      mismatches += 1;
      console.log(
        `   ✗ ${b.betType}:${b.selection} paid ₹${formatMinor(b.payout)}, expected ₹${formatMinor(expected.payout)}`,
      );
    }
  }
  const won = mine.filter((b) => b.status === 'WON').length;
  console.log(
    `7. settled ${mine.length} bets (${won} won), payouts ${mismatches === 0 ? 'all correct ✓' : `${mismatches} WRONG ✗`}`,
  );
  if (mismatches > 0) failures += 1;

  // 8. Wallet arithmetic --------------------------------------------------------
  const bal = await call<{ balance: string }>('/api/wallet/balance');
  const expectedBal = START - staked + expectedTotal;
  const balOk = BigInt(bal.balance) === expectedBal;
  console.log(
    `8. balance ₹${formatMinor(bal.balance)} (expected ₹${formatMinor(expectedBal)}) ${balOk ? '✓' : '✗'}`,
  );
  if (!balOk) failures += 1;
}

async function main() {
  const only = process.argv[2];
  const rooms = only
    ? [only]
    : // One room per game — the fastest interval each game offers.
      Object.values(GAMES).map(
        (g) => [...g.rooms].sort((a, b) => a.intervalSec - b.intervalSec)[0].key,
      );

  console.log(`E2E smoke: ${API}`);
  console.log(`rooms: ${rooms.join(', ')}`);

  for (const room of rooms) await testRoom(room);

  // Global conservation, once, at the end ------------------------------------
  const integrity = await call<{ ok: boolean; total: string }>('/api/wallet/integrity');
  console.log(
    `\nledger conservation: every entry ever written sums to ${integrity.total} ${integrity.ok ? '✓' : '✗ MONEY LEAKED'}`,
  );
  if (!integrity.ok) failures += 1;

  console.log(`\n=== ${failures === 0 ? 'PASSED' : `FAILED (${failures})`} ===\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nsmoke failed:', err);
  process.exit(1);
});
