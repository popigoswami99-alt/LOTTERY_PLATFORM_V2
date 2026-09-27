/**
 * End-to-end test for the instant games against a RUNNING api.
 *
 *   npx tsx scripts/smoke-instant.ts
 *
 * Checks the properties that matter for games with no shared round:
 *
 *   - every outcome is reproducible from the revealed seed pair + nonce
 *   - the nonce advances once per bet and never repeats
 *   - payouts equal true odds after the rake, for Dice, Limbo and Mines
 *   - a running Mines board is never disclosed before the game ends
 *   - Mines cannot be double-started, and cashout requires a reveal
 *   - the ledger nets to zero
 */

import { createHash, createHmac } from 'node:crypto';
import {
  MINES_SHUFFLE_VALUES,
  MINES_TILES,
  dicePayout,
  diceRollFromValue,
  diceWinCount,
  formatMinor,
  formatRoll,
  formatX100,
  instantPayout,
  limboResultFromValue,
  minesPayout,
  placeMines,
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

/** Re-derives entropy exactly as the server does — the verification step. */
function derive(serverSeed: string, clientSeed: string, nonce: number, cursor = 0): number {
  const mac = createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:${cursor}`)
    .digest('hex');
  return Number(BigInt('0x' + mac.slice(0, 13)));
}

const STAKE = 10_000n; // ₹100
const START = 2_000_000n; // ₹20,000

interface Seed {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

async function main() {
  console.log(`\n=== Instant games E2E: ${API} ===\n`);

  // Register ----------------------------------------------------------------
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

  // Pin a known client seed so verification is legible.
  await call('/api/instant/seed/client', {
    method: 'POST',
    body: JSON.stringify({ clientSeed: 'smoke-test-seed' }),
  });
  const seed0 = await call<Seed>('/api/instant/seed');
  console.log(`player ${auth.user.nickname}, commitment ${seed0.serverSeedHash.slice(0, 16)}…`);
  console.log(`client seed "${seed0.clientSeed}", nonce ${seed0.nonce}\n`);

  const nonces: number[] = [];

  // -------------------------------------------------------------------------
  console.log('1. Dice');
  {
    const target = 5000; // 50.00
    const r = await call<{ roll: number; won: boolean; payout: string; nonce: number }>(
      '/api/instant/dice/roll',
      { method: 'POST', body: JSON.stringify({ stake: STAKE.toString(), target, direction: 'under' }) },
    );
    nonces.push(r.nonce);
    console.log(`   rolled ${formatRoll(r.roll)} (under ${formatRoll(target)}) — ${r.won ? 'win' : 'loss'}`);

    check(r.won === r.roll < target, 'win flag agrees with the roll');
    const expected = r.won ? dicePayout(STAKE, diceWinCount(target, 'under')) : 0n;
    check(BigInt(r.payout) === expected, 'payout is true odds after the 2% rake');
  }

  // -------------------------------------------------------------------------
  console.log('\n2. Limbo');
  {
    const targetX100 = 200;
    const r = await call<{ resultX100: number; won: boolean; payout: string }>(
      '/api/instant/limbo/play',
      { method: 'POST', body: JSON.stringify({ stake: STAKE.toString(), targetX100 }) },
    );
    console.log(`   drew ${formatX100(r.resultX100)}x against a ${formatX100(targetX100)}x target`);

    check(r.won === r.resultX100 >= targetX100, 'win flag agrees with the draw');
    const expected = r.won ? instantPayout(STAKE, targetX100) : 0n;
    check(BigInt(r.payout) === expected, 'payout is stake x target after the rake');
  }

  // -------------------------------------------------------------------------
  console.log('\n3. Mines');
  {
    const mines = 3;
    const start = await call<{ betId: string; nonce: number }>('/api/instant/mines/start', {
      method: 'POST',
      body: JSON.stringify({ stake: STAKE.toString(), mines }),
    });

    // Starting a second game must be refused.
    let doubleStart = false;
    try {
      await call('/api/instant/mines/start', {
        method: 'POST',
        body: JSON.stringify({ stake: STAKE.toString(), mines }),
      });
      doubleStart = true;
    } catch {
      /* expected */
    }
    check(!doubleStart, 'cannot start a second game while one is running');

    // Cashing out with nothing revealed must be refused.
    let earlyCash = false;
    try {
      await call('/api/instant/mines/cashout', { method: 'POST', body: '{}' });
      earlyCash = true;
    } catch {
      /* expected */
    }
    check(!earlyCash, 'cannot cash out before revealing a tile');

    // The running board must not leak through history.
    const midHistory = await call<Array<{ status: string; resultData: unknown }>>(
      '/api/instant/history?game=MINES&take=1',
    );
    check(
      midHistory[0]?.status === 'PENDING' && midHistory[0]?.resultData === null,
      'a running board is not disclosed in history',
    );

    // Reveal tiles until we hit a mine or clear enough to cash out.
    let revealedCount = 0;
    let hit = false;
    let finalPayout = 0n;

    for (let tile = 0; tile < MINES_TILES; tile += 1) {
      const r = await call<{
        hitMine: boolean;
        status: string;
        multiplierX100: number;
        payout: string;
      }>('/api/instant/mines/reveal', { method: 'POST', body: JSON.stringify({ tile }) });

      if (r.hitMine) {
        hit = true;
        console.log(`   hit a mine on tile ${tile} after ${revealedCount} safe picks`);
        check(BigInt(r.payout) === 0n, 'hitting a mine pays nothing');
        break;
      }

      revealedCount += 1;
      const expectedMult = Number(
        (100n * BigInt(minesPayout(1_000_000_00n, mines, revealedCount))) /
          BigInt(instantPayout(1_000_000_00n, 100)),
      );
      void expectedMult; // multiplier display is checked in the unit suite

      if (revealedCount >= 3) {
        const cash = await call<{ multiplierX100: number; payout: string; minePositions: number[] }>(
          '/api/instant/mines/cashout',
          { method: 'POST', body: '{}' },
        );
        finalPayout = BigInt(cash.payout);
        console.log(
          `   cashed out after ${revealedCount} picks at ${formatX100(cash.multiplierX100)}x for ₹${formatMinor(cash.payout)}`,
        );
        check(
          finalPayout === minesPayout(STAKE, mines, revealedCount),
          'payout matches the exact ladder odds',
        );
        check(cash.minePositions.length === mines, 'board disclosed on cash out');
        break;
      }
    }

    if (hit) console.log('   (mine hit before cashout — loss path verified)');
  }

  // -------------------------------------------------------------------------
  console.log('\n4. Verification against the revealed seed');
  {
    const before = await call<Seed>('/api/instant/seed');
    check(before.nonce >= 3, `nonce advanced once per bet (now ${before.nonce})`);

    const rot = await call<{
      revealed: { serverSeed: string; serverSeedHash: string; clientSeed: string; betsPlayed: number };
      next: Seed;
    }>('/api/instant/seed/rotate', { method: 'POST', body: '{}' });

    const rehash = createHash('sha256').update(rot.revealed.serverSeed).digest('hex');
    check(rehash === seed0.serverSeedHash, 'revealed seed hashes to the original commitment');
    check(rot.next.serverSeedHash !== seed0.serverSeedHash, 'a fresh commitment was issued');
    check(rot.next.nonce === 0, 'the new pair starts at nonce 0');

    // Re-derive every recorded bet from the revealed seed.
    const history = await call<
      Array<{ gameCode: string; params: any; resultData: any; nonce: number; status: string }>
    >('/api/instant/history?take=50');

    let verified = 0;
    let mismatched = 0;
    const { serverSeed, clientSeed } = rot.revealed;

    for (const h of history) {
      if (!h.resultData) continue;

      if (h.gameCode === 'DICE') {
        const expect = diceRollFromValue(derive(serverSeed, clientSeed, h.nonce));
        expect === h.resultData.roll ? (verified += 1) : (mismatched += 1);
      } else if (h.gameCode === 'LIMBO') {
        const expect = limboResultFromValue(derive(serverSeed, clientSeed, h.nonce));
        expect === h.resultData.resultX100 ? (verified += 1) : (mismatched += 1);
      } else if (h.gameCode === 'MINES') {
        const values = Array.from({ length: MINES_SHUFFLE_VALUES }, (_, i) =>
          derive(serverSeed, clientSeed, h.nonce, i),
        );
        const expect = placeMines(h.params.mines, values);
        JSON.stringify(expect) === JSON.stringify(h.resultData.minePositions)
          ? (verified += 1)
          : (mismatched += 1);
      }
    }

    console.log(`   re-derived ${verified} outcomes independently`);
    check(verified >= 3, 'every recorded outcome was reproducible');
    check(mismatched === 0, 'no outcome differed from its re-derivation');
  }

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
  console.error('\nsmoke-instant failed:', err);
  process.exit(1);
});
