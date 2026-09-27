/**
 * End-to-end test for the activity centre.
 *
 *   npx tsx scripts/smoke-activity.ts
 *
 * Exercises every bonus that has a mechanic behind it, and — more importantly
 * — checks that each one can be claimed EXACTLY ONCE. A bonus that can be
 * claimed twice is free money, so every path below is attempted a second time
 * and expected to fail.
 */

import { formatMinor } from '@lp/shared';
import { prisma } from '../src/db/prisma.js';
import { dayStart } from '../src/modules/agency/agency.service.js';
import {
  CHECKIN_LADDER,
  FIRST_DEPOSIT_TIERS,
  SELF_REBATE_BPS,
} from '../src/modules/activity/activity.service.js';

const API = process.env.SMOKE_API ?? 'http://localhost:4000';

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

/** Runs a call that is expected to be rejected. */
async function refused(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

const CREDIT = 2_000_000n; // ₹20,000

async function newPlayer(inviteCode?: string) {
  const phone = String(9_000_000_000 + Math.floor(Math.random() * 999_999_999));
  const reg = await call<{ accessToken: string; user: { nickname: string; inviteCode: string } }>(
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({ phone, password: 'test1234', ...(inviteCode ? { inviteCode } : {}) }),
    },
  );
  return { token: reg.accessToken, ...reg.user };
}

const balanceOf = async (token: string) =>
  BigInt((await call<{ balance: string }>('/api/wallet/balance', {}, token)).balance);

interface Overview {
  todayBonus: string;
  totalBonus: string;
  checkin: { streak: number; claimedToday: boolean; nextDay: number; nextReward: string };
  wheel: { earned: number; used: number; available: number };
  firstDeposit: { firstDepositAmount: string | null; qualifiedBonus: string | null; claimed: boolean };
  rebateRate: number;
}

async function main() {
  console.log(`\n=== Activity E2E: ${API} ===\n`);

  const p = await newPlayer();

  // -------------------------------------------------------------------------
  console.log('1. Daily check-in');
  {
    const before = await balanceOf(p.token);
    const ov0 = await call<Overview>('/api/activity/overview', {}, p.token);
    check(!ov0.checkin.claimedToday, 'not checked in yet');
    check(ov0.checkin.nextDay === 1, 'a new player starts at day 1');

    const r = await call<{ amount: string; day: number }>(
      '/api/activity/checkin',
      { method: 'POST', body: '{}' },
      p.token,
    );
    console.log(`   day ${r.day} paid ₹${formatMinor(r.amount)}`);
    check(BigInt(r.amount) === CHECKIN_LADDER[0], 'day 1 pays the first rung of the ladder');
    check((await balanceOf(p.token)) === before + BigInt(r.amount), 'credited to the balance');

    check(
      await refused(() =>
        call('/api/activity/checkin', { method: 'POST', body: '{}' }, p.token),
      ),
      'a second check-in the same day is refused',
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n2. Streak — the ladder climbs, a gap resets it');
  {
    const q = await newPlayer();
    const row = await prisma.user.findFirstOrThrow({
      where: { nickname: q.nickname },
      select: { id: true },
    });

    // Backdate three consecutive check-ins ending yesterday.
    const DAY = 86_400_000;
    const key = (ms: number) =>
      new Date(dayStart(ms) + 12 * 3_600_000).toISOString().slice(0, 10);
    for (let d = 3; d >= 1; d -= 1) {
      await prisma.bonusClaim.create({
        data: {
          userId: row.id,
          type: 'CHECKIN',
          scope: key(Date.now() - d * DAY),
          amount: CHECKIN_LADDER[3 - d],
        },
      });
    }

    const st = await call<Overview['checkin']>('/api/activity/checkin', {}, q.token);
    check(st.streak === 3, `streak counted back correctly (${st.streak})`);
    check(st.nextDay === 4, 'the next claim is day 4');
    check(BigInt(st.nextReward) === CHECKIN_LADDER[3], 'day 4 pays the fourth rung');

    // Now break it: a player whose last check-in was three days ago.
    const r2 = await newPlayer();
    const row2 = await prisma.user.findFirstOrThrow({
      where: { nickname: r2.nickname },
      select: { id: true },
    });
    await prisma.bonusClaim.create({
      data: { userId: row2.id, type: 'CHECKIN', scope: key(Date.now() - 3 * DAY), amount: 100n },
    });
    const broken = await call<Overview['checkin']>('/api/activity/checkin', {}, r2.token);
    check(broken.streak === 0, 'a gap resets the streak to zero');
  }

  // -------------------------------------------------------------------------
  console.log('\n3. Gift codes');
  {
    const code = `SMOKE${Math.floor(Math.random() * 1_000_000)}`;
    await prisma.giftCode.create({
      data: { code, amount: 25_000n, maxRedemptions: 2 }, // ₹250, two uses
    });

    const before = await balanceOf(p.token);
    const r = await call<{ amount: string }>(
      '/api/activity/gift',
      { method: 'POST', body: JSON.stringify({ code }) },
      p.token,
    );
    console.log(`   ${code} paid ₹${formatMinor(r.amount)}`);
    check(BigInt(r.amount) === 25_000n, 'gift amount credited');
    check((await balanceOf(p.token)) === before + 25_000n, 'balance increased');

    check(
      await refused(() =>
        call('/api/activity/gift', { method: 'POST', body: JSON.stringify({ code }) }, p.token),
      ),
      'the same account cannot redeem a code twice',
    );

    // A second, different account may use the remaining redemption.
    const other = await newPlayer();
    await call(
      '/api/activity/gift',
      { method: 'POST', body: JSON.stringify({ code }) },
      other.token,
    );
    const third = await newPlayer();
    check(
      await refused(() =>
        call('/api/activity/gift', { method: 'POST', body: JSON.stringify({ code }) }, third.token),
      ),
      'the code is exhausted after its redemption limit',
    );

    check(
      await refused(() =>
        call('/api/activity/gift', { method: 'POST', body: JSON.stringify({ code: 'NOPE123' }) }, p.token),
      ),
      'an unknown code is rejected',
    );

    // The reserve-then-grant path must not leak a slot on a duplicate attempt.
    const row = await prisma.giftCode.findUniqueOrThrow({ where: { code } });
    check(row.redeemed === row.maxRedemptions, 'redemption counter matches actual uses');
  }

  // -------------------------------------------------------------------------
  console.log('\n4. First deposit bonus — single reward, sized by the highest bracket reached');
  {
    const fresh = await newPlayer();

    check(
      await refused(() => call('/api/activity/first-deposit', { method: 'POST', body: '{}' }, fresh.token)),
      'cannot claim before depositing',
    );

    // ₹12,000 clears the ₹500/₹1,000/₹5,000/₹10,000 brackets and falls short of
    // ₹20,000. Only the ₹10,000 bracket (the highest reached) should pay — the
    // lower ones it also cleared are skipped, not paid in addition, and the
    // bonus must be 10% of the BRACKET (₹1,000), not 10% of the actual ₹12,000
    // deposit (which would be ₹1,200).
    const depositAmount = 1_200_000n; // ₹12,000
    const tenK = FIRST_DEPOSIT_TIERS.find((t) => t.threshold === 1_000_000n)!; // ₹10,000 bracket
    const twentyK = FIRST_DEPOSIT_TIERS.find((t) => t.threshold === 2_000_000n)!; // ₹20,000 bracket

    await call(
      '/api/wallet/dev/credit',
      { method: 'POST', body: JSON.stringify({ amount: depositAmount.toString() }) },
      fresh.token,
    );

    const before = await balanceOf(fresh.token);
    const r = await call<{ amount: string }>(
      '/api/activity/first-deposit',
      { method: 'POST', body: '{}' },
      fresh.token,
    );
    console.log(
      `   deposited ₹${formatMinor(depositAmount)} -> qualified for the ₹${formatMinor(tenK.threshold)} bracket -> ₹${formatMinor(r.amount)}`,
    );
    check(BigInt(r.amount) === tenK.bonus, 'bonus is 10% of the qualified bracket, not the raw deposit');
    check(BigInt(r.amount) !== twentyK.bonus, 'the higher unreached bracket is not paid');
    check((await balanceOf(fresh.token)) === before + tenK.bonus, 'credited to the balance');

    check(
      await refused(() => call('/api/activity/first-deposit', { method: 'POST', body: '{}' }, fresh.token)),
      'cannot claim the first deposit bonus twice',
    );

    // A deposit below the smallest bracket (₹500) qualifies for nothing.
    const tooSmall = await newPlayer();
    await call(
      '/api/wallet/dev/credit',
      { method: 'POST', body: JSON.stringify({ amount: '30000' }) }, // ₹300
      tooSmall.token,
    );
    check(
      await refused(() => call('/api/activity/first-deposit', { method: 'POST', body: '{}' }, tooSmall.token)),
      'a deposit below the smallest bracket qualifies for nothing',
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n5. Invite wheel');
  {
    const agent = await newPlayer();
    const w0 = await call<Overview['wheel']>('/api/activity/wheel', {}, agent.token);
    check(w0.available === 0, 'no spins before inviting anyone');
    check(
      await refused(() =>
        call('/api/activity/wheel/spin', { method: 'POST', body: '{}' }, agent.token),
      ),
      'spinning without a spin is refused',
    );

    await newPlayer(agent.inviteCode);
    await newPlayer(agent.inviteCode);

    const w1 = await call<Overview['wheel']>('/api/activity/wheel', {}, agent.token);
    check(w1.available === 2, 'two invites earn two spins');

    const before = await balanceOf(agent.token);
    const s1 = await call<{ prize: string; spinsLeft: number }>(
      '/api/activity/wheel/spin',
      { method: 'POST', body: '{}' },
      agent.token,
    );
    console.log(`   spun ₹${formatMinor(s1.prize)}, ${s1.spinsLeft} left`);
    check(BigInt(s1.prize) > 0n, 'the spin paid a prize');
    check((await balanceOf(agent.token)) === before + BigInt(s1.prize), 'prize credited');
    check(s1.spinsLeft === 1, 'one spin consumed');

    await call('/api/activity/wheel/spin', { method: 'POST', body: '{}' }, agent.token);
    check(
      await refused(() =>
        call('/api/activity/wheel/spin', { method: 'POST', body: '{}' }, agent.token),
      ),
      'cannot spin more times than invites earned',
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n6. Betting rebate — a real settled day');
  {
    const better = await newPlayer();
    await call(
      '/api/wallet/dev/credit',
      { method: 'POST', body: JSON.stringify({ amount: CREDIT.toString() }) },
      better.token,
    );

    const STAKE = 10_000n;
    for (let i = 0; i < 5; i += 1) {
      await call(
        '/api/instant/dice/roll',
        {
          method: 'POST',
          body: JSON.stringify({ stake: STAKE.toString(), target: 5000, direction: 'under' }),
        },
        better.token,
      );
    }
    const turnover = STAKE * 5n;

    // Shift the play into yesterday so a complete day exists to settle.
    const row = await prisma.user.findFirstOrThrow({
      where: { nickname: better.nickname },
      select: { id: true },
    });
    const yDay = dayStart(Date.now()) - 86_400_000;
    await prisma.instantBet.updateMany({
      where: { userId: row.id },
      data: { createdAt: new Date(yDay + 12 * 3_600_000) },
    });

    const before = await balanceOf(better.token);
    await call<Overview>('/api/activity/overview', {}, better.token); // triggers settlement
    const after = await balanceOf(better.token);

    const expected = (turnover * SELF_REBATE_BPS) / 10_000n;
    console.log(
      `   0.20% of ₹${formatMinor(turnover)} = ₹${formatMinor(after - before)} (expected ₹${formatMinor(expected)})`,
    );
    check(after - before === expected, 'rebate paid at the published rate');

    const again = await balanceOf(better.token);
    await call<Overview>('/api/activity/overview', {}, better.token);
    check((await balanceOf(better.token)) === again, 'the same day is not rebated twice');
  }

  // -------------------------------------------------------------------------
  console.log('\n7. Bonus summary');
  {
    const ov = await call<Overview>('/api/activity/overview', {}, p.token);
    const hist = await call<Array<{ amount: string }>>(
      '/api/activity/bonus-history?take=50',
      {},
      p.token,
    );
    const sum = hist.reduce((a, h) => a + BigInt(h.amount), 0n);
    console.log(`   today ₹${formatMinor(ov.todayBonus)} · total ₹${formatMinor(ov.totalBonus)}`);
    check(BigInt(ov.totalBonus) === sum, 'total bonus equals the sum of every claim');
    check(BigInt(ov.todayBonus) > 0n, "today's bonus reflects today's claims");
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
  console.error('\nsmoke-activity failed:', err);
  process.exit(1);
});
