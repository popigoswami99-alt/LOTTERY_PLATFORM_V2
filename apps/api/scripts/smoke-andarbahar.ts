/**
 * End-to-end test for Andar Bahar against a RUNNING api.
 *
 *   npx tsx scripts/smoke-andarbahar.ts
 *
 * Plays real hands, then rotates the seed pair and re-derives every deal from
 * the revealed seed to prove the joker shown at start and the cards turned at
 * pick came from the same committed shuffle.
 */

import { createHash, createHmac } from 'node:crypto';
import {
  AB_SHUFFLE_VALUES,
  abCardLabel,
  abDeal,
  abMultiplierX100,
  abPayout,
  abShuffle,
  formatMinor,
  formatX100,
  type ABSide,
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

interface StartRes {
  betId: string;
  joker: { rank: number; suit: number };
  firstSide: ABSide;
  odds: { andar: number; bahar: number };
}
interface PickRes {
  side: ABSide;
  won: boolean;
  multiplierX100: number;
  payout: string;
  hand: {
    joker: { rank: number; suit: number };
    firstSide: ABSide;
    andar: Array<{ rank: number; suit: number }>;
    bahar: Array<{ rank: number; suit: number }>;
    winner: ABSide;
    matchAt: number;
  };
}

async function main() {
  console.log(`\n=== Andar Bahar E2E: ${API} ===\n`);

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
    body: JSON.stringify({ clientSeed: 'ab-smoke' }),
  });
  const seed0 = await call<{ serverSeedHash: string; clientSeed: string }>('/api/instant/seed');
  console.log(`player ${auth.user.nickname}, commitment ${seed0.serverSeedHash.slice(0, 16)}…\n`);

  // -------------------------------------------------------------------------
  console.log('1. Dealing a hand');
  let balanceAfterStake = 0n;
  {
    const s = await call<StartRes>('/api/instant/andarbahar/start', {
      method: 'POST',
      body: JSON.stringify({ stake: STAKE.toString() }),
    });
    console.log(
      `   joker ${abCardLabel(s.joker)} — ${s.firstSide} deals first ` +
        `(andar ${formatX100(s.odds.andar)}x / bahar ${formatX100(s.odds.bahar)}x)`,
    );

    check(
      s.odds.andar === abMultiplierX100('andar', s.firstSide) &&
        s.odds.bahar === abMultiplierX100('bahar', s.firstSide),
      'quoted odds match the exact side probabilities',
    );
    check(
      (s.firstSide === 'andar') === (s.joker.suit === 0 || s.joker.suit === 3),
      'a black joker deals to Andar first, a red one to Bahar',
    );

    const bal = await call<{ balance: string }>('/api/wallet/balance');
    balanceAfterStake = BigInt(bal.balance);
    check(balanceAfterStake === START - STAKE, 'stake debited when the joker was turned');

    // Starting a second hand must be refused.
    let dupe = false;
    try {
      await call('/api/instant/andarbahar/start', {
        method: 'POST',
        body: JSON.stringify({ stake: STAKE.toString() }),
      });
      dupe = true;
    } catch {
      /* expected */
    }
    check(!dupe, 'cannot start a second hand while one is open');

    // The open hand must be restorable.
    const cur = await call<StartRes | null>('/api/instant/andarbahar/current');
    check(
      cur !== null && cur.joker.rank === s.joker.rank && cur.joker.suit === s.joker.suit,
      'the open hand is restored with the same joker',
    );

    // -----------------------------------------------------------------------
    console.log('\n2. Picking a side');
    const pick: ABSide = 'andar';
    const r = await call<PickRes>('/api/instant/andarbahar/pick', {
      method: 'POST',
      body: JSON.stringify({ side: pick }),
    });

    console.log(
      `   ${r.hand.andar.length} to Andar, ${r.hand.bahar.length} to Bahar — ` +
        `${r.hand.winner} wins on card ${r.hand.matchAt}`,
    );

    check(
      r.hand.joker.rank === s.joker.rank && r.hand.joker.suit === s.joker.suit,
      'the joker dealt at pick is the one shown at start',
    );
    check(r.hand.firstSide === s.firstSide, 'the first side did not change between steps');

    // The winning pile's last card matches the joker rank; nothing before does.
    const winPile = r.hand.winner === 'andar' ? r.hand.andar : r.hand.bahar;
    const losePile = r.hand.winner === 'andar' ? r.hand.bahar : r.hand.andar;
    check(
      winPile[winPile.length - 1].rank === r.hand.joker.rank,
      'the deciding card matches the joker rank',
    );
    check(
      winPile.slice(0, -1).every((c) => c.rank !== r.hand.joker.rank) &&
        losePile.every((c) => c.rank !== r.hand.joker.rank),
      'no earlier card matched — the deal stopped at the first match',
    );
    check(
      r.hand.andar.length + r.hand.bahar.length === r.hand.matchAt,
      'card count agrees with the match position',
    );

    const expected = abPayout(STAKE, pick, r.hand.firstSide, r.hand.winner);
    check(BigInt(r.payout) === expected, 'payout is the exact inverse of that side probability');
    check(r.won === (r.hand.winner === pick), 'win flag agrees with the winning pile');

    const bal2 = await call<{ balance: string }>('/api/wallet/balance');
    check(
      BigInt(bal2.balance) === balanceAfterStake + BigInt(r.payout),
      'wallet reflects the settlement',
    );

    // Picking again must be refused.
    let repick = false;
    try {
      await call('/api/instant/andarbahar/pick', {
        method: 'POST',
        body: JSON.stringify({ side: 'bahar' }),
      });
      repick = true;
    } catch {
      /* expected */
    }
    check(!repick, 'cannot pick twice on one hand');
  }

  // -------------------------------------------------------------------------
  console.log('\n3. A few more hands, both sides');
  {
    for (const side of ['bahar', 'andar', 'bahar'] as ABSide[]) {
      const s = await call<StartRes>('/api/instant/andarbahar/start', {
        method: 'POST',
        body: JSON.stringify({ stake: STAKE.toString() }),
      });
      const r = await call<PickRes>('/api/instant/andarbahar/pick', {
        method: 'POST',
        body: JSON.stringify({ side }),
      });
      const expected = abPayout(STAKE, side, r.hand.firstSide, r.hand.winner);
      const ok = BigInt(r.payout) === expected;
      console.log(
        `   picked ${side} vs joker ${abCardLabel(s.joker)} -> ${r.hand.winner} ` +
          `(${r.won ? `+₹${formatMinor(r.payout)}` : 'lost'}) ${ok ? '✓' : '✗'}`,
      );
      if (!ok) failures += 1;
    }
  }

  // -------------------------------------------------------------------------
  console.log('\n4. Verification against the revealed seed');
  {
    const rot = await call<{
      revealed: { serverSeed: string; serverSeedHash: string; clientSeed: string };
    }>('/api/instant/seed/rotate', { method: 'POST', body: '{}' });

    const rehash = createHash('sha256').update(rot.revealed.serverSeed).digest('hex');
    check(rehash === seed0.serverSeedHash, 'revealed seed hashes to the original commitment');

    const history = await call<
      Array<{ gameCode: string; resultData: PickRes['hand'] | null; nonce: number }>
    >('/api/instant/history?game=ANDARBAHAR&take=20');

    const { serverSeed, clientSeed } = rot.revealed;
    let verified = 0;
    let mismatched = 0;

    for (const h of history) {
      if (!h.resultData) continue;
      const values = Array.from({ length: AB_SHUFFLE_VALUES }, (_, i) =>
        derive(serverSeed, clientSeed, h.nonce, i),
      );
      const expect = abDeal(abShuffle(values));
      const same =
        expect.winner === h.resultData.winner &&
        expect.matchAt === h.resultData.matchAt &&
        expect.joker.rank === h.resultData.joker.rank &&
        expect.joker.suit === h.resultData.joker.suit;
      same ? (verified += 1) : (mismatched += 1);
    }

    console.log(`   re-dealt ${verified} hands independently`);
    check(verified >= 4, 'every recorded hand was reproducible from the seed');
    check(mismatched === 0, 'no hand differed from its re-derivation');
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
  console.error('\nsmoke-andarbahar failed:', err);
  process.exit(1);
});
