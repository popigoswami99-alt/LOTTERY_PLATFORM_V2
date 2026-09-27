/**
 * End-to-end test for the profile section against a RUNNING api.
 *
 *   npx tsx scripts/smoke-profile.ts
 *
 * Covers the logic behind each option on the page: identity, VIP tier from
 * turnover, the Safe (transfers plus lazy interest accrual), unified game
 * history across all three engines, statistics, and the money histories.
 */

import { formatMinor } from '@lp/shared';

const API = process.env.SMOKE_API ?? 'http://localhost:4000';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

interface Profile {
  uid: string;
  nickname: string;
  lastLoginAt: string | null;
  balance: string;
  safeBalance: string;
  referrals: number;
  vip: { level: number; turnover: string; nextAt: string | null; progress: number };
}

const START = 2_000_000n; // ₹20,000

async function main() {
  console.log(`\n=== Profile E2E: ${API} ===\n`);

  const phone = String(9_000_000_000 + Math.floor(Math.random() * 999_999_999));
  const password = 'test1234';
  await call('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
  });

  // Log in properly so lastLoginAt is stamped.
  const login = await call<{ accessToken: string; user: { nickname: string } }>(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify({ identifier: phone, password }) },
  );
  token = login.accessToken;
  await call('/api/wallet/dev/credit', {
    method: 'POST',
    body: JSON.stringify({ amount: START.toString() }),
  });

  // -------------------------------------------------------------------------
  console.log('1. Identity');
  {
    const p = await call<Profile>('/api/me/profile');
    console.log(`   ${p.nickname} · UID ${p.uid} · VIP${p.vip.level}`);
    check(/^\d{8,}$/.test(p.uid), 'UID is a stable zero-padded id');
    check(p.lastLoginAt !== null, 'last login was stamped on login');
    check(BigInt(p.balance) === START, 'balance matches the wallet');
    check(p.vip.level === 0 && BigInt(p.vip.turnover) === 0n, 'new player starts at VIP0');
  }

  // -------------------------------------------------------------------------
  console.log('\n2. Safe — transfers and interest');
  {
    const IN = 500_000n; // ₹5,000

    const before = await call<{ safeBalance: string; cashBalance: string }>('/api/me/safe');
    check(BigInt(before.safeBalance) === 0n, 'safe starts empty');

    await call('/api/me/safe/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount: IN.toString() }),
    });
    const afterIn = await call<{ safeBalance: string; cashBalance: string }>('/api/me/safe');
    check(BigInt(afterIn.safeBalance) === IN, 'funds moved into the safe');
    check(BigInt(afterIn.cashBalance) === START - IN, 'the same amount left spendable cash');

    // Safe money must not be stakeable — try to bet more than the cash left.
    let overBet = false;
    try {
      await call('/api/instant/dice/roll', {
        method: 'POST',
        body: JSON.stringify({
          stake: (START - IN + 1000n).toString(),
          target: 5000,
          direction: 'under',
        }),
      });
      overBet = true;
    } catch {
      /* expected */
    }
    check(!overBet, 'safe funds cannot be staked');

    // Taking out more than is held must be refused.
    let overDraw = false;
    try {
      await call('/api/me/safe/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount: (IN * 10n).toString() }),
      });
      overDraw = true;
    } catch {
      /* expected */
    }
    check(!overDraw, 'cannot take out more than the safe holds');

    /*
     * Interest must actually be PAID, not merely "not negative".
     *
     * 0.1%/day on ₹5,000 is 0.35 paise a minute, which floors to zero — so a
     * naive implementation that advances the accrual clock anyway would pay
     * this balance nothing, ever. Waiting three intervals proves the elapsed
     * window accumulates instead of being discarded.
     */
    const expectedPerMin = (IN * 10n * 60_000n) / (10_000n * 86_400_000n);
    console.log(
      `   ₹${formatMinor(IN)} earns ${expectedPerMin} paise/min (floors to 0) — waiting ~3.2 min…`,
    );
    await sleep(195_000);

    const afterWait = await call<{ safeBalance: string }>('/api/me/safe');
    const earned = BigInt(afterWait.safeBalance) - IN;
    console.log(`   accrued ${earned} paise`);
    check(earned > 0n, 'a sub-paise-per-minute balance still earns once the window adds up');
    check(BigInt(afterWait.safeBalance) > IN, 'safe balance grew');

    await call('/api/me/safe/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount: IN.toString() }),
    });
    const afterOut = await call<{ safeBalance: string; cashBalance: string }>('/api/me/safe');
    check(BigInt(afterOut.safeBalance) < IN, 'funds moved back out of the safe');
    check(BigInt(afterOut.cashBalance) >= START - 1000n, 'cash restored');
  }

  // -------------------------------------------------------------------------
  console.log('\n3. Play across all three engines');
  {
    await call('/api/instant/dice/roll', {
      method: 'POST',
      body: JSON.stringify({ stake: '2000', target: 5000, direction: 'under' }),
    });
    await call('/api/instant/dragontiger/play', {
      method: 'POST',
      body: JSON.stringify({ stake: '2000', side: 'dragon' }),
    });

    /*
     * The lottery bet must actually happen, not be skipped when the room is
     * mid-lock — Dice and Dragon Tiger are both the INSTANT engine, so without
     * it the history would only ever span one engine and the merge check below
     * would fail intermittently. Wait for a real betting window instead.
     */
    let placedLottery = false;
    for (let i = 0; i < 90 && !placedLottery; i += 1) {
      const st = await call<{ status: string; remainingMs: number }>(
        '/api/rooms/WINGO_1M/state',
      );
      if (st.status === 'OPEN' && st.remainingMs > 8000) {
        await call('/api/rooms/WINGO_1M/bet', {
          method: 'POST',
          body: JSON.stringify({
            betType: 'COLOUR',
            selection: 'green',
            unitAmount: '2000',
            multiplier: 1,
          }),
        });
        placedLottery = true;
        break;
      }
      await sleep(1000);
    }
    check(placedLottery, 'placed a lottery bet as well as instant bets');
  }

  // -------------------------------------------------------------------------
  console.log('\n4. Unified game history');
  {
    const rows = await call<
      Array<{ kind: string; label: string; detail: string; stake: string; createdAt: string }>
    >('/api/me/game-history?take=40');

    console.log(`   ${rows.length} rows across engines`);
    for (const r of rows.slice(0, 3)) console.log(`   · ${r.label} — ${r.detail}`);

    check(rows.length >= 2, 'history returned rows');
    check(new Set(rows.map((r) => r.kind)).size >= 2, 'rows span more than one engine');
    check(
      rows.every((r) => r.label && r.stake),
      'every row carries a label and a stake',
    );

    const times = rows.map((r) => new Date(r.createdAt).getTime());
    check(
      times.every((t, i) => i === 0 || times[i - 1] >= t),
      'rows are merged newest-first across engines',
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n5. Statistics and VIP');
  {
    const s = await call<{
      bets: number;
      wins: number;
      winRate: number;
      staked: string;
      won: string;
      net: string;
      byGame: Array<{ label: string; bets: number; staked: string }>;
    }>('/api/me/stats');

    console.log(
      `   ${s.bets} bets · staked ₹${formatMinor(s.staked)} · returned ₹${formatMinor(s.won)} · win rate ${s.winRate}%`,
    );

    check(s.bets >= 2, 'bet count reflects real play');
    check(BigInt(s.staked) > 0n, 'turnover accumulated');
    check(BigInt(s.net) === BigInt(s.won) - BigInt(s.staked), 'net equals returned minus staked');
    check(s.byGame.length >= 2, 'per-game breakdown covers the games played');

    const p = await call<Profile>('/api/me/profile');
    check(BigInt(p.vip.turnover) === BigInt(s.staked), 'VIP turnover matches total staked');
    check(p.vip.progress >= 0 && p.vip.progress <= 100, 'VIP progress is a sane percentage');
  }

  // -------------------------------------------------------------------------
  console.log('\n6. Money histories');
  {
    const all = await call<Array<{ type: string }>>('/api/me/money-history?filter=all');
    const dep = await call<Array<{ type: string }>>('/api/me/money-history?filter=deposit');
    const wd = await call<Array<{ type: string }>>('/api/me/money-history?filter=withdraw');

    console.log(`   all ${all.length} · deposits ${dep.length} · withdrawals ${wd.length}`);
    check(all.length > dep.length, 'the full list is broader than deposits alone');
    check(
      dep.every((t) => t.type === 'DEPOSIT'),
      'the deposit filter returns only deposits',
    );
    check(wd.length === 0, 'no withdrawals exist — the feature is not built');
    check(
      all.some((t) => t.type === 'SAFE_IN') && all.some((t) => t.type === 'SAFE_OUT'),
      'safe transfers appear in the ledger history',
    );
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
  console.error('\nsmoke-profile failed:', err);
  process.exit(1);
});
