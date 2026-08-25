/**
 * Focused test for the two rebuilt game clients: Aviator (crash) and Dice.
 *
 *   npx tsx scripts/smoke-ui-games.ts
 *
 * Checks only what the UI rework touched:
 *   - both Aviator bet panels take independent bets on one round
 *   - each panel cashes out separately and is priced separately
 *   - the live "All Bets" list reports them with masked names
 *   - Dice rolls in both directions with the mirrored targets the two buttons send
 *   - the ledger still nets to zero
 */

import {
  DICE_ROLL_SPAN,
  dicePayout,
  diceWinCount,
  formatMinor,
  formatX100,
} from '@lp/shared';

const API = process.env.SMOKE_API ?? 'http://localhost:4000';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`   ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures += 1;
};

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

async function newPlayer(credit: bigint) {
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
  crashPointX100: number | null;
  multiplierX100: number;
  myBets: Record<string, { slot: number; stake: string; cashedOutX100: number | null; status: string; payout: string }>;
}

const START = 2_000_000n; // ₹20,000
const STAKE_A = 10_000n; // ₹100
const STAKE_B = 25_000n; // ₹250
const AUTO_TARGET = 105; // 1.05x

async function main() {
  console.log(`\n=== Aviator + Dice UI test: ${API} ===\n`);

  // =========================================================================
  console.log('1. Aviator — two independent bet panels');
  {
    const p = await newPlayer(START);

    // Wait for a betting window.
    let st: CrashState | null = null;
    for (let i = 0; i < 400; i += 1) {
      st = await call<CrashState>('/api/crash/state', {}, p.token);
      if (st.phase === 'WAITING') break;
      await sleep(200);
    }
    if (!st || st.phase !== 'WAITING') throw new Error('no betting window appeared');

    const b1 = await call<{ slot: number }>(
      '/api/crash/bet',
      { method: 'POST', body: JSON.stringify({ stake: STAKE_A.toString(), slot: 1 }) },
      p.token,
    );
    const b2 = await call<{ slot: number }>(
      '/api/crash/bet',
      {
        method: 'POST',
        // 1.05x fires on ~95% of rounds, so this exercises the auto-cashout
        // path reliably instead of depending on a lucky round.
        body: JSON.stringify({ stake: STAKE_B.toString(), slot: 2, autoCashoutX100: AUTO_TARGET }),
      },
      p.token,
    );
    check(b1.slot === 1 && b2.slot === 2, 'both panels accepted a bet on the same round');

    // Re-betting the same panel must be refused.
    let dupe = false;
    try {
      await call(
        '/api/crash/bet',
        { method: 'POST', body: JSON.stringify({ stake: STAKE_A.toString(), slot: 1 }) },
        p.token,
      );
      dupe = true;
    } catch {
      /* expected */
    }
    check(!dupe, 'the same panel cannot bet twice on one round');

    const after = await call<CrashState>('/api/crash/state', {}, p.token);
    check(
      after.myBets['1']?.stake === STAKE_A.toString() &&
        after.myBets['2']?.stake === STAKE_B.toString(),
      'state restores both panels with their own stakes',
    );

    const bal = await call<{ balance: string }>('/api/wallet/balance', {}, p.token);
    check(
      BigInt(bal.balance) === START - STAKE_A - STAKE_B,
      'both stakes debited independently',
    );

    // The live list should show this player.
    const rb = await call<{ bets: Array<{ name: string; stake: string }> }>('/api/crash/round-bets');
    const mine = rb.bets.filter((b) => b.stake === STAKE_A.toString() || b.stake === STAKE_B.toString());
    check(rb.bets.length >= 2, `all-bets list populated (${rb.bets.length} rows)`);
    check(
      mine.every((b) => b.name.includes('***')),
      'player names are masked in the public list',
    );

    // Wait for the round to run, then cash out panel 1 manually.
    for (let i = 0; i < 400; i += 1) {
      const s = await call<CrashState>('/api/crash/state', {}, p.token);
      if (s.phase !== 'WAITING') break;
      await sleep(100);
    }

    let cashed: { slot: number; multiplierX100: number; payout: string } | null = null;
    for (let i = 0; i < 80 && !cashed; i += 1) {
      try {
        cashed = await call('/api/crash/cashout', { method: 'POST', body: JSON.stringify({ slot: 1 }) }, p.token);
      } catch {
        await sleep(60);
      }
    }

    if (cashed) {
      console.log(`   panel 1 cashed at ${formatX100(cashed.multiplierX100)}x for ₹${formatMinor(cashed.payout)}`);
      check(cashed.slot === 1, 'cash out targeted panel 1');

      const s2 = await call<CrashState>('/api/crash/state', {}, p.token);
      check(s2.myBets['1']?.status === 'WON', 'panel 1 settled as WON');
      check(
        s2.myBets['2']?.cashedOutX100 === null || s2.myBets['2']?.status === 'WON',
        'panel 2 is unaffected by panel 1 cashing out',
      );
    } else {
      console.log('   round busted before a manual cash-out was possible (valid)');
    }

    // Let the round finish so panel 2's auto-cashout resolves.
    for (let i = 0; i < 900; i += 1) {
      const s = await call<CrashState>('/api/crash/state', {}, p.token);
      if (s.roundNo !== st.roundNo) break;
      await sleep(100);
    }

    const finalBets = await call<Array<{ slot: number; cashedOutX100: number | null; status: string }>>(
      '/api/crash/my-bets?take=5',
      {},
      p.token,
    );
    const slot2 = finalBets.find((b) => b.slot === 2);
    if (slot2?.status === 'WON') {
      check(
        slot2.cashedOutX100 === AUTO_TARGET,
        `panel 2 auto-cashed at exactly its ${formatX100(AUTO_TARGET)}x target`,
      );
    } else {
      console.log(`   panel 2 busted below its ${formatX100(AUTO_TARGET)}x target (valid)`);
    }
  }

  // =========================================================================
  console.log('\n2. Dice — both direction buttons');
  {
    const p = await newPlayer(START);
    const WIN_COUNT = 4850; // 48.50% chance, as the UI slider default

    // The green button sends "under" with the raw target...
    const under = await call<{ roll: number; won: boolean; payout: string }>(
      '/api/instant/dice/roll',
      {
        method: 'POST',
        body: JSON.stringify({ stake: '2000', target: WIN_COUNT, direction: 'under' }),
      },
      p.token,
    );
    console.log(`   under ${(WIN_COUNT / 100).toFixed(2)} -> rolled ${(under.roll / 100).toFixed(2)}`);
    check(under.won === under.roll < WIN_COUNT, 'under: win flag agrees with the roll');
    check(
      BigInt(under.payout) === (under.won ? dicePayout(2000n, diceWinCount(WIN_COUNT, 'under')) : 0n),
      'under: payout is exact true odds',
    );

    // ...and the blue button sends "over" with the mirrored target.
    const overTarget = DICE_ROLL_SPAN - 1 - WIN_COUNT;
    const over = await call<{ roll: number; won: boolean; payout: string }>(
      '/api/instant/dice/roll',
      {
        method: 'POST',
        body: JSON.stringify({ stake: '2000', target: overTarget, direction: 'over' }),
      },
      p.token,
    );
    console.log(`   over ${(overTarget / 100).toFixed(2)} -> rolled ${(over.roll / 100).toFixed(2)}`);
    check(over.won === over.roll > overTarget, 'over: win flag agrees with the roll');
    check(
      BigInt(over.payout) === (over.won ? dicePayout(2000n, diceWinCount(overTarget, 'over')) : 0n),
      'over: payout is exact true odds',
    );

    check(
      diceWinCount(WIN_COUNT, 'under') === diceWinCount(overTarget, 'over'),
      'both buttons offer the identical win chance',
    );
  }

  // =========================================================================
  console.log('\n3. Minimum bet is ₹10 on both games');
  {
    const p = await newPlayer(START);
    const BELOW = '999'; // ₹9.99
    const EXACT = '1000'; // ₹10.00

    // --- Dice ---------------------------------------------------------------
    let diceTookLow = false;
    try {
      await call(
        '/api/instant/dice/roll',
        { method: 'POST', body: JSON.stringify({ stake: BELOW, target: 4850, direction: 'under' }) },
        p.token,
      );
      diceTookLow = true;
    } catch {
      /* expected */
    }
    check(!diceTookLow, 'dice rejects a bet below ₹10');

    await call(
      '/api/instant/dice/roll',
      { method: 'POST', body: JSON.stringify({ stake: EXACT, target: 4850, direction: 'under' }) },
      p.token,
    );
    check(true, 'dice accepts exactly ₹10');

    // --- Aviator ------------------------------------------------------------
    for (let i = 0; i < 400; i += 1) {
      const s = await call<CrashState>('/api/crash/state', {}, p.token);
      if (s.phase === 'WAITING') break;
      await sleep(200);
    }

    let crashTookLow = false;
    try {
      await call(
        '/api/crash/bet',
        { method: 'POST', body: JSON.stringify({ stake: BELOW, slot: 1 }) },
        p.token,
      );
      crashTookLow = true;
    } catch {
      /* expected */
    }
    check(!crashTookLow, 'aviator rejects a bet below ₹10');

    const ok = await call<{ stake: string }>(
      '/api/crash/bet',
      { method: 'POST', body: JSON.stringify({ stake: EXACT, slot: 1 }) },
      p.token,
    );
    check(ok.stake === EXACT, 'aviator accepts exactly ₹10');
  }

  const integrity = await call<{ ok: boolean; total: string }>('/api/wallet/integrity');
  console.log(
    `\nledger conservation: every entry sums to ${integrity.total} ${integrity.ok ? '✓' : '✗ MONEY LEAKED'}`,
  );
  if (!integrity.ok) failures += 1;

  console.log(`\n=== ${failures === 0 ? 'PASSED' : `FAILED (${failures})`} ===\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nsmoke-ui-games failed:', err);
  process.exit(1);
});
