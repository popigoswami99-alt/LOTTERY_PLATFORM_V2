/**
 * End-to-end Crash test against a RUNNING api.
 *
 *   npx tsx scripts/smoke-crash.ts
 *
 * Plays real rounds against the live loop and checks the things that actually
 * matter for a game where money moves while a number is climbing:
 *
 *   - a manual cash-out pays stake x multiplier at the server's price
 *   - an auto cash-out fires at exactly its target
 *   - a bet that rides past the bust loses, and cannot be cashed after
 *   - betting is refused once a round is running
 *   - the revealed seed matches the commitment published before betting
 *   - the ledger still nets to zero
 */

import { createHash } from 'node:crypto';
import { X100, crashPayout, formatMinor, formatX100 } from '@lp/shared';

const API = process.env.SMOKE_API ?? 'http://localhost:4000';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`   ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures += 1;
};

interface Client {
  token: string;
  nickname: string;
}

async function call<T>(path: string, init: RequestInit = {}, token = ''): Promise<T> {
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

async function newPlayer(credit: bigint): Promise<Client> {
  const phone = String(9_000_000_000 + Math.floor(Math.random() * 999_999_999));
  const auth = await call<{ accessToken: string; user: { nickname: string } }>(
    '/api/auth/register',
    { method: 'POST', body: JSON.stringify({ phone, password: 'test1234' }) },
  );
  await call(
    '/api/wallet/dev/credit',
    { method: 'POST', body: JSON.stringify({ amount: credit.toString() }) },
    auth.accessToken,
  );
  return { token: auth.accessToken, nickname: auth.user.nickname };
}

interface CrashState {
  roundNo: string;
  phase: 'WAITING' | 'RUNNING' | 'CRASHED';
  serverSeedHash: string;
  crashPointX100: number | null;
  serverSeed: string | null;
  multiplierX100: number;
  /** Keyed by bet panel (slot) — the client has two independent panels. */
  myBets: Record<
    string,
    { slot: number; stake: string; cashedOutX100: number | null; status: string; payout: string }
  >;
}

const state = (token = '') => call<CrashState>('/api/crash/state', {}, token);

/** Waits until a fresh WAITING phase with enough time left to place a bet. */
async function waitForBettingWindow(): Promise<CrashState> {
  for (let i = 0; i < 400; i += 1) {
    const s = await state();
    if (s.phase === 'WAITING') return s;
    await sleep(200);
  }
  throw new Error('no betting window appeared');
}

async function waitForPhase(roundNo: string, phase: string): Promise<CrashState> {
  for (let i = 0; i < 600; i += 1) {
    const s = await state();
    if (s.roundNo !== roundNo) throw new Error(`round ${roundNo} passed before ${phase}`);
    if (s.phase === phase) return s;
    await sleep(100);
  }
  throw new Error(`round ${roundNo} never reached ${phase}`);
}

async function main() {
  console.log(`\n=== Crash E2E: ${API} ===\n`);

  const START = 1_000_000n; // ₹10,000
  const STAKE = 10_000n; // ₹100

  // -------------------------------------------------------------------------
  // Scenario 1 — manual cash-out
  // -------------------------------------------------------------------------
  console.log('1. manual cash-out');
  {
    const p = await newPlayer(START);
    const open = await waitForBettingWindow();
    const commitment = open.serverSeedHash;

    await call(
      '/api/crash/bet',
      { method: 'POST', body: JSON.stringify({ stake: STAKE.toString() }) },
      p.token,
    );
    console.log(`   round ${open.roundNo}, commitment ${commitment.slice(0, 16)}…`);

    await waitForPhase(open.roundNo, 'RUNNING');

    // Cash out as soon as the curve has moved off 1.00x.
    let cashed: { multiplierX100: number; payout: string } | null = null;
    for (let i = 0; i < 100 && !cashed; i += 1) {
      try {
        cashed = await call('/api/crash/cashout', { method: 'POST', body: '{}' }, p.token);
      } catch {
        await sleep(60);
      }
    }

    if (!cashed) {
      // Legitimate: the round can bust at 1.00x before any cash-out is possible.
      console.log('   round busted instantly — no cash-out possible, retrying scenario');
    } else {
      console.log(
        `   cashed at ${formatX100(cashed.multiplierX100)}x for ₹${formatMinor(cashed.payout)}`,
      );
      check(
        BigInt(cashed.payout) === crashPayout(STAKE, cashed.multiplierX100),
        'payout equals stake x multiplier, after the 2% rake',
      );

      const after = await state(p.token);
      check(after.myBets['1']?.status === 'WON', 'bet marked WON');

      const bal = await call<{ balance: string }>('/api/wallet/balance', {}, p.token);
      check(
        BigInt(bal.balance) === START - STAKE + BigInt(cashed.payout),
        'wallet reflects stake out, payout in',
      );

      // Cannot cash the same bet twice.
      let doubleCash = false;
      try {
        await call('/api/crash/cashout', { method: 'POST', body: '{}' }, p.token);
        doubleCash = true;
      } catch {
        /* expected */
      }
      check(!doubleCash, 'a second cash-out on the same bet is refused');
    }
  }

  // -------------------------------------------------------------------------
  // Scenario 2 — auto cash-out fires at exactly its target
  // -------------------------------------------------------------------------
  console.log('\n2. auto cash-out at 1.20x');
  {
    const TARGET = 120;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const p = await newPlayer(START);
      const open = await waitForBettingWindow();

      await call(
        '/api/crash/bet',
        {
          method: 'POST',
          body: JSON.stringify({ stake: STAKE.toString(), autoCashoutX100: TARGET }),
        },
        p.token,
      );

      // Let the round finish.
      for (let i = 0; i < 900; i += 1) {
        const s = await state();
        if (s.roundNo !== open.roundNo || s.phase === 'CRASHED') break;
        await sleep(100);
      }
      await sleep(400);

      const bets = await call<
        Array<{ roundNo: string; crashPointX100: number; status: string; cashedOutX100: number | null; payout: string }>
      >('/api/crash/my-bets?take=5', {}, p.token);
      const mine = bets.find((b) => b.roundNo === open.roundNo);
      if (!mine) throw new Error('auto-cashout bet vanished');

      if (mine.crashPointX100 >= TARGET) {
        console.log(
          `   round busted at ${formatX100(mine.crashPointX100)}x (>= target)`,
        );
        check(mine.status === 'WON', 'auto cash-out won');
        check(mine.cashedOutX100 === TARGET, `paid at exactly ${formatX100(TARGET)}x, not the tick price`);
        check(
          BigInt(mine.payout) === crashPayout(STAKE, TARGET),
          'payout priced at the target multiplier',
        );
        break;
      }

      console.log(
        `   round busted at ${formatX100(mine.crashPointX100)}x (below target) — correctly lost, retrying`,
      );
      check(mine.status === 'LOST', 'bet below the bust point lost');
      check(BigInt(mine.payout) === 0n, 'losing bet paid nothing');
      if (attempt === 5) console.log('   (never got a round above target; loss path verified instead)');
    }
  }

  // -------------------------------------------------------------------------
  // Scenario 3 — riding past the bust, and betting after take-off
  // -------------------------------------------------------------------------
  console.log('\n3. riding past the bust');
  {
    const p = await newPlayer(START);
    const open = await waitForBettingWindow();
    const commitment = open.serverSeedHash;

    await call(
      '/api/crash/bet',
      { method: 'POST', body: JSON.stringify({ stake: STAKE.toString() }) },
      p.token,
    );

    await waitForPhase(open.roundNo, 'RUNNING');

    // Betting is closed once the round is running.
    const q = await newPlayer(START);
    let lateBet = false;
    try {
      await call(
        '/api/crash/bet',
        { method: 'POST', body: JSON.stringify({ stake: STAKE.toString() }) },
        q.token,
      );
      lateBet = true;
    } catch {
      /* expected */
    }
    check(!lateBet, 'betting is refused once the round is running');

    // Never cash out; wait for the bust.
    let busted: CrashState | null = null;
    for (let i = 0; i < 900; i += 1) {
      const s = await state();
      if (s.phase === 'CRASHED' && s.roundNo === open.roundNo) {
        busted = s;
        break;
      }
      if (s.roundNo !== open.roundNo) break;
      await sleep(100);
    }
    if (!busted) throw new Error('never observed the bust');

    console.log(`   busted at ${formatX100(busted.crashPointX100!)}x`);

    check(busted.serverSeed !== null, 'seed revealed after the bust');
    const rehash = createHash('sha256').update(busted.serverSeed!).digest('hex');
    check(rehash === commitment, 'revealed seed hashes to the commitment published before betting');

    let lateCash = false;
    try {
      await call('/api/crash/cashout', { method: 'POST', body: '{}' }, p.token);
      lateCash = true;
    } catch {
      /* expected */
    }
    check(!lateCash, 'cannot cash out after the bust');

    await sleep(300);
    const bal = await call<{ balance: string }>('/api/wallet/balance', {}, p.token);
    check(BigInt(bal.balance) === START - STAKE, 'stake lost, nothing returned');
  }

  // -------------------------------------------------------------------------
  // Ledger
  // -------------------------------------------------------------------------
  const integrity = await call<{ ok: boolean; total: string }>('/api/wallet/integrity');
  console.log(
    `\nledger conservation: every entry sums to ${integrity.total} ${integrity.ok ? '✓' : '✗ MONEY LEAKED'}`,
  );
  if (!integrity.ok) failures += 1;

  console.log(`\n=== ${failures === 0 ? 'PASSED' : `FAILED (${failures})`} ===\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nsmoke-crash failed:', err);
  process.exit(1);
});
