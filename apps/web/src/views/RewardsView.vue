<script setup lang="ts">
import VirtualRewardsCenter from '@/components/VirtualRewardsCenter.vue'

import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatMinor } from '@lp/shared';
import { api, apiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

/**
 * Rewards centre — daily check-in calendar, the first-deposit bonus, and
 * gift-code redemption. Every grant lands through the same bonus ledger.
 *
 * The first-deposit bonus is a SINGLE reward, sized by the highest bracket
 * your first deposit reaches (10% of that bracket) — a lower bracket the
 * deposit also clears is superseded, not paid in addition.
 */

const auth = useAuthStore();
const router = useRouter();

interface CheckinState {
  streak: number; claimedToday: boolean; nextDay: number; nextReward: string;
  ladder: Array<{ day: number; amount: string }>;
}
interface FirstDepositTier {
  threshold: string; bonus: string; qualified: boolean; skipped: boolean;
}
interface Overview {
  checkin: CheckinState;
  firstDeposit: {
    firstDepositAmount: string | null;
    qualifiedThreshold: string | null;
    qualifiedBonus: string | null;
    claimed: boolean;
    ratePct: number;
    tiers: FirstDepositTier[];
  };
}

const ov = ref<Overview | null>(null);
const giftCode = ref('');
const busy = ref('');
const toast = ref('');

const rupees = (m: string) => `₹${formatMinor(m)}`;

async function load() {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/rewards' } });
    return;
  }
  const { data } = await api.get('/activity/overview');
  ov.value = data.data;
  await auth.refreshBalance();
}

function dayState(day: number) {
  const c = ov.value!.checkin;
  if (day <= c.streak) return 'done';
  if (day === c.nextDay && !c.claimedToday) return 'next';
  return 'locked';
}

async function checkIn() {
  busy.value = 'checkin';
  try {
    const { data } = await api.post('/activity/checkin');
    flash(`Checked in — ${rupees(data.data.amount)}`);
    await load();
  } catch (e) { flash(apiError(e)); } finally { busy.value = ''; }
}

async function claimFirst() {
  busy.value = 'first';
  try {
    const { data } = await api.post('/activity/first-deposit', {});
    flash(`First deposit bonus — ${rupees(data.data.amount)}`);
    await load();
  } catch (e) { flash(apiError(e)); } finally { busy.value = ''; }
}

async function redeem() {
  if (giftCode.value.trim().length < 3) return flash('Enter a gift code');
  busy.value = 'gift';
  try {
    const { data } = await api.post('/activity/gift', { code: giftCode.value.trim() });
    giftCode.value = '';
    flash(`Redeemed ${rupees(data.data.amount)}`);
    await load();
  } catch (e) { flash(apiError(e)); } finally { busy.value = ''; }
}

let toastTimer: number | undefined;
function flash(m: string) {
  toast.value = m;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2600);
}

onMounted(load);
</script>

<template>
    <!-- Unified virtual rewards/promotion center -->
    <VirtualRewardsCenter />

  <div class="page" v-if="ov">
    <header class="top">
      <router-link :to="{ name: 'home' }" class="back">‹</router-link>
      <strong>Rewards</strong>
      <span class="spacer" />
    </header>

    <!-- Daily check-in -->
    <section class="card">
      <div class="hd-row">
        <strong class="hd">📅 Daily check-in</strong>
        <span class="streak">🔥 {{ ov.checkin.streak }}-day streak</span>
      </div>

      <div class="cal">
        <div
          v-for="d in ov.checkin.ladder"
          :key="d.day"
          class="day"
          :class="dayState(d.day)"
        >
          <span class="d-lbl">Day {{ d.day }}</span>
          <span class="d-gift">{{ dayState(d.day) === 'done' ? '✓' : '🎁' }}</span>
          <span class="d-amt num">{{ rupees(d.amount) }}</span>
        </div>
      </div>

      <button
        class="btn btn-primary"
        :disabled="ov.checkin.claimedToday || busy === 'checkin'"
        @click="checkIn"
      >
        {{ ov.checkin.claimedToday ? 'Checked in today ✓' : `Check in — ${rupees(ov.checkin.nextReward)}` }}
      </button>
    </section>

    <!-- First deposit bonus: ONE reward, sized by the highest bracket reached -->
    <section class="card">
      <div class="hd-row">
        <strong class="hd">💎 First deposit bonus</strong>
        <span class="up-to">{{ ov.firstDeposit.ratePct }}%</span>
      </div>
      <p class="sub faint">
        A {{ ov.firstDeposit.ratePct }}% bonus sized by your first deposit's bracket — only the
        highest bracket it clears pays.
      </p>

      <div v-if="ov.firstDeposit.firstDepositAmount === null" class="fd-hero">
        <span class="fd-hero-l">Make your first deposit to unlock this bonus.</span>
        <router-link class="fd-btn ready" :to="{ name: 'wallet' }">Deposit</router-link>
      </div>
      <div v-else class="fd-hero" :class="{ done: ov.firstDeposit.claimed }">
        <span class="fd-hero-l">
          First deposit {{ rupees(ov.firstDeposit.firstDepositAmount) }}
          <template v-if="ov.firstDeposit.qualifiedBonus">qualifies for a bonus below.</template>
          <template v-else>
            is below the {{ rupees(ov.firstDeposit.tiers[0]?.threshold ?? '0') }} minimum — no bonus
            qualifies.
          </template>
        </span>
      </div>

      <div class="fd-list">
        <div
          v-for="t in ov.firstDeposit.tiers"
          :key="t.threshold"
          class="fd-row"
          :class="{ qualified: t.qualified, skipped: t.skipped }"
        >
          <span class="fd-title">{{ rupees(t.threshold) }}</span>
          <span class="fd-bonus num">+{{ rupees(t.bonus) }}</span>
          <button
            class="fd-claim"
            :class="{ active: t.qualified && !ov.firstDeposit.claimed }"
            :disabled="!t.qualified || ov.firstDeposit.claimed || busy === 'first'"
            @click="claimFirst"
          >
            {{ t.qualified && ov.firstDeposit.claimed ? 'Claimed' : 'Claim' }}
          </button>
        </div>
      </div>
    </section>

    <!-- Gift code -->
    <section class="card">
      <strong class="hd">🎟️ Redeem a gift code</strong>
      <div class="gift-row">
        <input v-model="giftCode" class="in" placeholder="Enter code" maxlength="32" @keyup.enter="redeem" />
        <button class="btn-redeem" :disabled="busy === 'gift'" @click="redeem">Redeem</button>
      </div>
    </section>

    <transition name="fade"><div v-if="toast" class="toast">{{ toast }}</div></transition>
  </div>
</template>

<style scoped lang="scss">
.page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.top { display: flex; align-items: center; gap: 10px; strong { flex: 1; font-size: 17px; } }
.back {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: var(--surface); box-shadow: var(--shadow-card); color: var(--text); font-size: 20px; text-decoration: none; line-height: 1;
}
.spacer { width: 30px; }

.card { background: var(--surface); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow-card); }
.hd-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.hd { font-size: 15px; }
.streak { font-size: 12px; font-weight: 700; color: var(--primary-deep); }
.up-to { font-size: 12px; font-weight: 800; color: #b3820b; background: #fff3d6; padding: 2px 8px; border-radius: 999px; }
.sub { margin: -6px 0 12px; font-size: 11px; }

.cal { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
.day {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 10px 4px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface-2);
  .d-lbl { font-size: 10px; color: var(--text-dim); font-weight: 700; }
  .d-gift { font-size: 20px; }
  .d-amt { font-size: 11px; font-weight: 800; }
  &.done { background: #e7f8f0; border-color: #bce9d4; .d-gift { color: #0c7a52; } }
  &.next {
    background: linear-gradient(135deg, var(--accent-from), var(--accent-to)); border-color: transparent;
    .d-lbl, .d-amt { color: #fff; }
    box-shadow: var(--shadow-pop);
  }
  &.locked { opacity: 0.7; }
}

.fd-hero {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px 14px; margin-bottom: 12px; border-radius: 12px;
  background: color-mix(in srgb, var(--primary) 10%, var(--surface-2)); border: 1px solid var(--primary);
  &.done { opacity: 0.7; }
}
.fd-hero-l { font-size: 12px; color: var(--text-dim); line-height: 1.5; }

.fd-list { display: flex; flex-direction: column; gap: 6px; max-height: 40vh; overflow-y: auto; }
.fd-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 10px; background: var(--surface-2);
  border: 1px solid transparent;
  &.qualified { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--surface-2)); }
  &.skipped { opacity: 0.55; }
}
.fd-title { font-size: 12px; font-weight: 700; color: var(--text); }
.fd-bonus { font-size: 12px; font-weight: 800; color: var(--primary-deep); white-space: nowrap; }
.fd-claim {
  margin-left: auto; flex: 0 0 auto;
  height: 26px; padding: 0 12px; border-radius: 999px; border: none;
  font-size: 11px; font-weight: 800; white-space: nowrap;
  background: var(--surface-3); color: var(--text-faint);
  &.active { background: #16b979; color: #fff; }
  &:disabled { cursor: not-allowed; }
}
.fd-btn {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center;
  height: 34px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--primary);
  color: var(--primary-deep); font-size: 12px; font-weight: 800; text-decoration: none; background: transparent;
  &.ready { background: var(--primary); color: #fff; }
  &.done { border-color: var(--line); color: var(--text-faint); }
  &:disabled { opacity: 0.7; }
}

.gift-row { display: flex; gap: 8px; margin-top: 10px; }
.in {
  flex: 1; padding: 11px 12px; border-radius: var(--radius-sm); border: 1px solid var(--line);
  background: var(--surface-2); color: var(--text); font: inherit; outline: none; text-transform: uppercase;
  &:focus { border-color: var(--primary); }
}
.btn-redeem {
  padding: 0 18px; border-radius: var(--radius-sm); background: var(--primary); color: #fff; font-weight: 800; font-size: 13px;
  &:disabled { opacity: 0.5; }
}

.toast {
  position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%);
  background: rgba(40, 16, 28, 0.95); color: #fff; padding: 9px 16px; border-radius: 999px; font-size: 13px; z-index: 200; max-width: 90%; text-align: center;
}

/* LOTTERY_PLATFORM_PLATFORM_UX_06 */
.home,.activity,.rewards,.promotion,.wallet,.account{
 width:100%;max-width:100vw;min-width:0;box-sizing:border-box;overflow-x:hidden
}
.home *,.activity *,.rewards *,.promotion *,.wallet *,.account *{
 box-sizing:border-box;max-width:100%
}
.category-grid,.game-grid,.cards-grid,.promo-grid,.reward-grid{
 width:100%;min-width:0;
 display:grid;
 grid-template-columns:repeat(4,minmax(0,1fr));
 gap:10px;
}
.game-card,.category-card,.promo-card,.reward-card{
 min-width:0;overflow:hidden;
}
@media(max-width:900px){
 .category-grid,.game-grid,.cards-grid,.promo-grid,.reward-grid{
  grid-template-columns:repeat(3,minmax(0,1fr))
 }
}
@media(max-width:600px){
 .category-grid,.game-grid,.cards-grid,.promo-grid,.reward-grid{
  grid-template-columns:repeat(2,minmax(0,1fr));gap:7px
 }
}
@media(max-width:360px){
 .category-grid,.game-grid,.cards-grid,.promo-grid,.reward-grid{
  grid-template-columns:repeat(2,minmax(0,1fr));gap:5px
 }
}

</style>
