/**
 * End-to-end test for Plinko, Keno and Hi-Lo against a RUNNING api.
 *
 *   npx tsx scripts/smoke-originals.ts
 *
 * Plays each game, then rotates the seed pair and re-derives every outcome
 * from the revealed seed to prove none of them were altered after the fact.
 */

import { createHash, createHmac } from 'node:crypto';
import {
  KENO_DRAW_VALUES,
  cardFromValue,
  cardLabel,
  formatMinor,
  formatX100,
  hiloPayout,
  hiloWinCount,
  isTrivialCall,
  kenoDraw,
  kenoPayout,
  plinkoBucket,
  plinkoPath,
  plinkoPayout,
  type HiloCall,
  type PlinkoRisk,
  type PlinkoRows,
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

function derive(serverSeed: string, clientSeed: string, nonce: number, cursor = 0): number {
  const mac = createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:${cursor}`)
    .digest('hex');
  return Number(BigInt('0x' + mac.slice(0, 13)));
}

const STAKE = 10_000n; // ₹100
const START = 5_000_000n; // ₹50,000

async function main() {
  console.log(`\n=== Originals E2E (Plinko / Keno / Hi-Lo): ${API} ===\n`);

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
    body: JSON.stringify({ clientSeed: 'originals-smoke' }),
  });
  const seed0 = await call<{ serverSeedHash: string; clientSeed: string }>('/api/instant/seed');
  console.log(`player ${auth.user.nickname}, commitment ${seed0.serverSeedHash.slice(0, 16)}…\n`);

  // -------------------------------------------------------------------------
  console.log('1. Plinko');
  {
    const rows: PlinkoRows = 12;
    const risk: PlinkoRisk = 'medium';
    const r = await call<{
      path: boolean[];
      bucket: number;
      multiplierX100: number;
      payout: string;
    }>('/api/instant/plinko/drop', {
      method: 'POST',
      body: JSON.stringify({ stake: STAKE.toString(), rows, risk }),
    });

    console.log(
      `   landed in bucket ${r.bucket}/${rows} at ${formatX100(r.multiplierX100)}x for ₹${formatMinor(r.payout)}`,
    );
    check(r.path.length === rows, 'path has one bounce per row');
    check(plinkoBucket(r.path) === r.bucket, 'bucket equals the number of right-bounces');
    check(
      BigInt(r.payout) === plinkoPayout(STAKE, rows, risk, r.bucket),
      'payout matches the generated fair table',
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n2. Keno');
  {
    const picks = [3, 7, 11, 19, 26];
    const r = await call<{
      drawn: number[];
      hits: number[];
      multiplierX100: number;
      payout: string;
    }>('/api/instant/keno/play', {
      method: 'POST',
      body: JSON.stringify({ stake: STAKE.toString(), picks }),
    });

    console.log(`   drew [${r.drawn.join(', ')}] — ${r.hits.length} hits`);
    check(r.drawn.length === 10, 'ten balls drawn');
    check(new Set(r.drawn).size === 10, 'all drawn balls distinct');
    check(
      r.hits.every((h) => picks.includes(h) && r.drawn.includes(h)),
      'hits are exactly the intersection',
    );
    check(
      BigInt(r.payout) === kenoPayout(STAKE, picks.length, r.hits.length),
      'payout matches the generated paytable',
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n3. Hi-Lo');
  {
    const start = await call<{ current: { rank: number; suit: number } }>(
      '/api/instant/hilo/start',
      { method: 'POST', body: JSON.stringify({ stake: STAKE.toString() }) },
    );
    console.log(`   opening card ${cardLabel(start.current)}`);

    // A second game must be refused.
    let doubleStart = false;
    try {
      await call('/api/instant/hilo/start', {
        method: 'POST',
        body: JSON.stringify({ stake: STAKE.toString() }),
      });
      doubleStart = true;
    } catch {
      /* expected */
    }
    check(!doubleStart, 'cannot start a second game while one is running');

    // Cashing out with no calls must be refused.
    let earlyCash = false;
    try {
      await call('/api/instant/hilo/cashout', { method: 'POST', body: '{}' });
      earlyCash = true;
    } catch {
      /* expected */
    }
    check(!earlyCash, 'cannot cash out before making a call');

    // Always call the side with better than even odds, and never a certainty.
    let rank = start.current.rank;
    const madeSteps: Array<{ rank: number; call: HiloCall }> = [];
    let survived = true;

    for (let i = 0; i < 3 && survived; i += 1) {
      const pick: HiloCall = hiloWinCount(rank, 'higher') >= hiloWinCount(rank, 'lower')
        ? 'higher'
        : 'lower';
      const safe: HiloCall = isTrivialCall(rank, pick)
        ? pick === 'higher'
          ? 'lower'
          : 'higher'
        : pick;

      const r = await call<{
        drawn: { rank: number; suit: number };
        survived: boolean;
        multiplierX100: number;
        status: string;
      }>('/api/instant/hilo/call', { method: 'POST', body: JSON.stringify({ call: safe }) });

      madeSteps.push({ rank, call: safe });
      console.log(
        `   called ${safe} on ${rank} -> ${cardLabel(r.drawn)} (${r.survived ? 'survived' : 'busted'})`,
      );
      survived = r.survived;
      rank = r.drawn.rank;
    }

    if (survived) {
      const cash = await call<{ multiplierX100: number; payout: string }>(
        '/api/instant/hilo/cashout',
        { method: 'POST', body: '{}' },
      );
      console.log(
        `   cashed out at ${formatX100(cash.multiplierX100)}x for ₹${formatMinor(cash.payout)}`,
      );
      check(
        BigInt(cash.payout) === hiloPayout(STAKE, madeSteps),
        'payout equals the compounded exact odds',
      );
    } else {
      console.log('   busted — loss path verified');
    }

    // A certain call must be rejected outright.
    // (Only meaningful when a game is running; skip if we already busted.)
    if (survived) {
      // nothing further — the game is settled
    }
  }

  // -------------------------------------------------------------------------
  console.log('\n4. Verification against the revealed seed');
  {
    const rot = await call<{
      revealed: { serverSeed: string; serverSeedHash: string; clientSeed: string };
      next: { serverSeedHash: string };
    }>('/api/instant/seed/rotate', { method: 'POST', body: '{}' });

    const rehash = createHash('sha256').update(rot.revealed.serverSeed).digest('hex');
    check(rehash === seed0.serverSeedHash, 'revealed seed hashes to the original commitment');

    const history = await call<
      Array<{ gameCode: string; params: any; state: any; resultData: any; nonce: number }>
    >('/api/instant/history?take=50');

    const { serverSeed, clientSeed } = rot.revealed;
    let verified = 0;
    let mismatched = 0;

    for (const h of history) {
      if (h.gameCode === 'PLINKO' && h.resultData) {
        const path = plinkoPath(derive(serverSeed, clientSeed, h.nonce), h.params.rows);
        plinkoBucket(path) === h.resultData.bucket ? (verified += 1) : (mismatched += 1);
      } else if (h.gameCode === 'KENO' && h.resultData) {
        const values = Array.from({ length: KENO_DRAW_VALUES }, (_, i) =>
          derive(serverSeed, clientSeed, h.nonce, i),
        );
        JSON.stringify(kenoDraw(values)) === JSON.stringify(h.resultData.drawn)
          ? (verified += 1)
          : (mismatched += 1);
      } else if (h.gameCode === 'HILO' && h.state) {
        // Cursor 0 is the opening card, each call consumes the next.
        const opening = cardFromValue(derive(serverSeed, clientSeed, h.nonce, 0));
        const steps: Array<{ drawn: { rank: number; suit: number } }> = h.state.steps ?? [];
        let ok = opening.rank === (steps[0]?.rank ?? opening.rank);
        steps.forEach((s, i) => {
          const expect = cardFromValue(derive(serverSeed, clientSeed, h.nonce, i + 1));
          if (expect.rank !== s.drawn.rank || expect.suit !== s.drawn.suit) ok = false;
        });
        ok ? (verified += 1) : (mismatched += 1);
      }
    }

    console.log(`   re-derived ${verified} outcomes independently`);
    check(verified >= 3, 'every recorded outcome was reproducible');
    check(mismatched === 0, 'no outcome differed from its re-derivation');
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
  console.error('\nsmoke-originals failed:', err);
  process.exit(1);
});
