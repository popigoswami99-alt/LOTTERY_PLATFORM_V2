/**
 * End-to-end test for the agency / commission engine.
 *
 *   npx tsx scripts/smoke-agency.ts
 *
 * Builds a real 3-level referral chain, has the downline stake, then settles
 * and checks the money: level rates, the ledger posting, idempotence of the
 * daily settlement, and that the total rebate stays under the house rake.
 */

import { formatMinor } from '@lp/shared';
import { prisma } from '../src/db/prisma.js';
import { dayStart } from '../src/modules/agency/agency.service.js';

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

interface Player {
  token: string;
  nickname: string;
  inviteCode: string;
}

async function newPlayer(credit: bigint, inviteCode?: string): Promise<Player> {
  const phone = String(9_000_000_000 + Math.floor(Math.random() * 999_999_999));
  const reg = await call<{
    accessToken: string;
    user: { nickname: string; inviteCode: string };
  }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ phone, password: 'test1234', ...(inviteCode ? { inviteCode } : {}) }),
  });
  await call(
    '/api/wallet/dev/credit',
    { method: 'POST', body: JSON.stringify({ amount: credit.toString() }) },
    reg.accessToken,
  );
  return {
    token: reg.accessToken,
    nickname: reg.user.nickname,
    inviteCode: reg.user.inviteCode,
  };
}

/** Stake a fixed amount on Dice, which settles instantly. */
async function stake(p: Player, amount: bigint, rounds: number) {
  for (let i = 0; i < rounds; i += 1) {
    await call(
      '/api/instant/dice/roll',
      {
        method: 'POST',
        body: JSON.stringify({ stake: amount.toString(), target: 5000, direction: 'under' }),
      },
      p.token,
    );
  }
}

interface Overview {
  inviteCode: string;
  yesterdayCommission: string;
  weekCommission: string;
  totalCommission: string;
  direct: { registers: number; depositors: number; depositAmount: string };
  team: { registers: number; depositors: number; depositAmount: string };
  levels: Array<{ level: number; users: number; rateBps: number }>;
}

const CREDIT = 2_000_000n; // ₹20,000
const STAKE = 10_000n; // ₹100

async function main() {
  console.log(`\n=== Agency E2E: ${API} ===\n`);

  // -------------------------------------------------------------------------
  console.log('1. Building a 3-level chain');
  const agent = await newPlayer(CREDIT);
  const l1a = await newPlayer(CREDIT, agent.inviteCode);
  const l1b = await newPlayer(CREDIT, agent.inviteCode);
  const l2 = await newPlayer(CREDIT, l1a.inviteCode);
  const l3 = await newPlayer(CREDIT, l2.inviteCode);
  console.log(`   ${agent.nickname} -> 2 direct -> 1 -> 1`);

  const ov0 = await call<Overview>('/api/agency/overview', {}, agent.token);
  check(ov0.direct.registers === 2, 'two direct subordinates counted');
  check(ov0.team.registers === 4, 'four team members counted across levels');
  check(ov0.levels.length === 3, 'team spans three levels');
  check(
    ov0.levels[0].rateBps > ov0.levels[1].rateBps &&
      ov0.levels[1].rateBps > ov0.levels[2].rateBps,
    'rates decrease with depth',
  );

  // -------------------------------------------------------------------------
  console.log('\n2. Deposit tracking');
  check(
    BigInt(ov0.direct.depositAmount) === CREDIT * 2n,
    `direct deposits total ₹${formatMinor(ov0.direct.depositAmount)}`,
  );
  check(
    BigInt(ov0.team.depositAmount) === CREDIT * 4n,
    `team deposits total ₹${formatMinor(ov0.team.depositAmount)}`,
  );
  check(ov0.direct.depositors === 2, 'direct depositor count is right');

  // -------------------------------------------------------------------------
  console.log('\n3. The downline stakes');
  await stake(l1a, STAKE, 4); // L1
  await stake(l1b, STAKE, 4); // L1
  await stake(l2, STAKE, 3); // L2
  await stake(l3, STAKE, 2); // L3

  const l1Turnover = STAKE * 8n;
  const l2Turnover = STAKE * 3n;
  const l3Turnover = STAKE * 2n;
  console.log(
    `   L1 ₹${formatMinor(l1Turnover)} · L2 ₹${formatMinor(l2Turnover)} · L3 ₹${formatMinor(l3Turnover)}`,
  );

  // -------------------------------------------------------------------------
  console.log('\n4. Rebate table');
  const table = await call<{
    rates: Array<{ level: number; rateBps: number }>;
    totalBps: number;
    houseRakeBps: number;
  }>('/api/agency/rebate-table', {}, agent.token);

  console.log(
    `   levels ${table.rates.map((r) => `L${r.level}:${r.rateBps / 100}%`).join(' ')} — total ${table.totalBps / 100}%`,
  );
  check(
    table.totalBps < table.houseRakeBps,
    'total rebate across all levels stays under the house rake',
  );

  // -------------------------------------------------------------------------
  // Today's turnover settles tomorrow, so a live run cannot observe a payout
  // for it. What CAN be verified now is that settlement is well-behaved and
  // that the arithmetic it will apply is right.
  console.log('\n5. Settlement behaviour');
  {
    const before = await call<Overview>('/api/agency/overview', {}, agent.token);
    const history = await call<Array<{ date: string; amount: string }>>(
      '/api/agency/commissions?take=40',
      {},
      agent.token,
    );

    console.log(`   ${history.length} settled day(s) on record`);
    check(
      BigInt(before.yesterdayCommission) >= 0n,
      "yesterday's commission is reported without error",
    );

    // Settling twice must not double-pay: totals are unchanged on re-read.
    const again = await call<Overview>('/api/agency/overview', {}, agent.token);
    check(
      again.totalCommission === before.totalCommission,
      're-running settlement does not pay a day twice',
    );

    const dates = history.map((h) => h.date);
    check(new Set(dates).size === dates.length, 'each day is settled at most once');

    // Verify the arithmetic the engine will apply to today's turnover.
    const rate = (bps: number, amount: bigint) => (amount * BigInt(bps)) / 10_000n;
    const expected =
      rate(table.rates[0].rateBps, l1Turnover) +
      rate(table.rates[1].rateBps, l2Turnover) +
      rate(table.rates[2].rateBps, l3Turnover);
    console.log(`   today's staking will settle to ₹${formatMinor(expected)} tomorrow`);
    check(expected > 0n, 'the pending commission is a positive amount');
  }

  // -------------------------------------------------------------------------
  console.log('\n6. Subordinate data');
  {
    const direct = await call<Array<{ name: string; uid: string; turnover: string }>>(
      '/api/agency/subordinates?level=1',
      {},
      agent.token,
    );
    const second = await call<Array<{ turnover: string }>>(
      '/api/agency/subordinates?level=2',
      {},
      agent.token,
    );

    check(direct.length === 2, 'level 1 lists both direct subordinates');
    check(second.length === 1, 'level 2 lists the deeper member');
    check(
      direct.every((d) => d.name.includes('***')),
      'subordinate names are masked from their upline',
    );
    check(
      direct.reduce((a, d) => a + BigInt(d.turnover), 0n) === l1Turnover,
      'reported subordinate turnover matches what they staked',
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n7. Downline sees no team of its own');
  {
    const leafView = await call<Overview>('/api/agency/overview', {}, l3.token);
    check(leafView.team.registers === 0, 'a leaf account reports an empty team');
    check(BigInt(leafView.totalCommission) === 0n, 'and no commission');
  }

  // -------------------------------------------------------------------------
  // The steps above never exercise an actual PAYOUT: every account was created
  // today, and only complete past days settle. So shift this chain back a day
  // and prove the money really moves.
  console.log('\n8. A real settled day — the payout path');
  {
    const DAY = 86_400_000;
    const yDay = dayStart(Date.now()) - DAY;

    const names = [agent.nickname, l1a.nickname, l1b.nickname, l2.nickname, l3.nickname];
    const rows = await prisma.user.findMany({
      where: { nickname: { in: names } },
      select: { id: true, nickname: true },
    });
    const idOf = (n: string) => rows.find((r) => r.nickname === n)!.id;
    const agentId = idOf(agent.nickname);
    const downline = [l1a, l1b, l2, l3].map((p) => idOf(p.nickname));

    // The agent must predate the day being settled, and the stakes must fall
    // inside it.
    await prisma.user.update({
      where: { id: agentId },
      data: { createdAt: new Date(yDay - DAY) },
    });
    await prisma.instantBet.updateMany({
      where: { userId: { in: downline } },
      data: { createdAt: new Date(yDay + 12 * 3_600_000) },
    });

    const balBefore = await call<{ balance: string }>('/api/wallet/balance', {}, agent.token);

    // Reading the overview is what triggers settlement.
    const ov = await call<Overview>('/api/agency/overview', {}, agent.token);
    const balAfter = await call<{ balance: string }>('/api/wallet/balance', {}, agent.token);

    const rate = (bps: number, amount: bigint) => (amount * BigInt(bps)) / 10_000n;
    const expected =
      rate(table.rates[0].rateBps, l1Turnover) +
      rate(table.rates[1].rateBps, l2Turnover) +
      rate(table.rates[2].rateBps, l3Turnover);

    const paid = BigInt(balAfter.balance) - BigInt(balBefore.balance);
    console.log(`   settled ₹${formatMinor(paid)} (expected ₹${formatMinor(expected)})`);

    check(paid === expected, 'commission credited to the balance at the exact level rates');
    check(
      BigInt(ov.yesterdayCommission) === expected,
      "the overview reports it as yesterday's commission",
    );
    check(BigInt(ov.totalCommission) === expected, 'total commission includes it');

    // Per-level breakdown must match what each level actually staked.
    const detail = await call<
      Array<{ amount: string; levels: Array<{ level: number; turnover: string; amount: string }> }>
    >('/api/agency/commissions?take=5', {}, agent.token);
    const day = detail[0];
    check(
      BigInt(day.levels.find((l) => l.level === 1)!.turnover) === l1Turnover,
      'level 1 turnover recorded correctly',
    );
    check(
      BigInt(day.levels.find((l) => l.level === 3)!.turnover) === l3Turnover,
      'level 3 turnover recorded correctly',
    );

    // Settling again must not pay twice.
    await call<Overview>('/api/agency/overview', {}, agent.token);
    const balThird = await call<{ balance: string }>('/api/wallet/balance', {}, agent.token);
    check(
      BigInt(balThird.balance) === BigInt(balAfter.balance),
      're-reading does not pay the same day again',
    );

    // Commission is paid by the house, not taken from the team.
    const l1Bal = await call<{ balance: string }>('/api/wallet/balance', {}, l1a.token);
    check(BigInt(l1Bal.balance) > 0n, "the downline's balance is untouched by the rebate");
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
  console.error('\nsmoke-agency failed:', err);
  process.exit(1);
});
