<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatMinor } from '@lp/shared';
import { api, apiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

/**
 * VIP centre. Level is derived from cumulative lifetime turnover; each tier
 * crossed grants a one-off reward, claimed through the same bonus ledger as
 * every other promotion.
 */

const auth = useAuthStore();
const router = useRouter();

interface VipLevelRow {
  level: number; name: string; turnover: string; reward: string; reached: boolean; claimed: boolean;
}
interface VipState {
  turnover: string; level: number; levelName: string;
  next: { level: number; name: string; turnover: string } | null;
  toNext: string; progressPct: number;
  levels: VipLevelRow[]; claimableLevels: number[]; claimableTotal: string;
}

const state = ref<VipState | null>(null);
const busy = ref(false);
const toast = ref('');

const TIER_COLOR: Record<string, string> = {
  Bronze: '#cd7f32', Silver: '#9aa5b1', Gold: '#e8a020', Platinum: '#69b6c9',
  Diamond: '#4aa8ff', Master: '#b06ae0', Grandmaster: '#ec6a9c', Legend: '#ff5a5a',
};
const rupees = (m: string) => `₹${formatMinor(m)}`;

async function load() {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/vip' } });
    return;
  }
  const { data } = await api.get('/activity/vip');
  state.value = data.data;
}

async function claim() {
  busy.value = true;
  try {
    const { data } = await api.post('/activity/vip/claim');
    auth.setBalance(data.data.balance);
    flash(`Claimed ${rupees(data.data.amount)}`);
    await load();
  } catch (e) {
    flash(apiError(e));
  } finally {
    busy.value = false;
  }
}

let toastTimer: number | undefined;
function flash(m: string) {
  toast.value = m;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2600);
}

const currentColor = computed(() => TIER_COLOR[state.value?.levelName ?? ''] ?? '#c9a24b');

onMounted(load);
</script>

<template>
  <div class="page" v-if="state">
    <!-- Current level hero -->
    <section class="hero" :style="{ '--tier': currentColor }">
      <router-link :to="{ name: 'account' }" class="back">‹</router-link>
      <div class="crown">👑</div>
      <div class="lvl-name">{{ state.levelName }}</div>
      <div class="lvl-tag">{{ state.level === 0 ? 'Start betting to rank up' : `VIP Level ${state.level}` }}</div>

      <div class="progress">
        <div class="bar"><span :style="{ width: state.progressPct + '%' }" /></div>
        <div class="prog-row">
          <span class="mono">{{ rupees(state.turnover) }} turnover</span>
          <span v-if="state.next" class="faint">{{ rupees(state.toNext) }} to {{ state.next.name }}</span>
          <span v-else class="faint">Max level reached</span>
        </div>
      </div>
    </section>

    <!-- Claimable banner -->
    <section v-if="Number(state.claimableTotal) > 0" class="claimable">
      <div>
        <strong>Rewards ready</strong>
        <div class="tiny">{{ state.claimableLevels.length }} level{{ state.claimableLevels.length > 1 ? 's' : '' }} · {{ rupees(state.claimableTotal) }}</div>
      </div>
      <button class="btn-claim" :disabled="busy" @click="claim">Claim {{ rupees(state.claimableTotal) }}</button>
    </section>

    <!-- Level ladder -->
    <section class="ladder">
      <div class="head">VIP levels</div>
      <div
        v-for="l in state.levels"
        :key="l.level"
        class="lvl"
        :class="{ reached: l.reached, current: l.level === state.level }"
      >
        <div class="badge" :style="{ background: TIER_COLOR[l.name] }">{{ l.level }}</div>
        <div class="info">
          <div class="name">{{ l.name }}</div>
          <div class="req tiny faint">Turnover {{ rupees(l.turnover) }}</div>
        </div>
        <div class="reward">
          <div class="amt num">+{{ rupees(l.reward) }}</div>
          <span v-if="l.claimed" class="state done">Claimed</span>
          <span v-else-if="l.reached" class="state ready">Ready</span>
          <span v-else class="state locked">Locked</span>
        </div>
      </div>
    </section>

    <p class="foot faint">
      Your VIP level rises with total turnover across every game. Each tier pays a one-off
      reward you can claim here.
    </p>

    <transition name="fade"><div v-if="toast" class="toast">{{ toast }}</div></transition>
  </div>
</template>

<style scoped lang="scss">
.page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }

.hero {
  position: relative;
  border-radius: var(--radius);
  padding: 22px 16px 16px;
  text-align: center;
  color: #fff;
  background:
    radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--tier) 85%, #fff) 0%, var(--tier) 60%, color-mix(in srgb, var(--tier) 70%, #000) 100%);
  box-shadow: var(--shadow-card);
}
.back {
  position: absolute; left: 12px; top: 12px; width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: rgba(255,255,255,0.25); color: #fff; font-size: 22px; text-decoration: none; line-height: 1;
}
.crown { font-size: 40px; }
.lvl-name { font-size: 24px; font-weight: 900; letter-spacing: 0.5px; margin-top: 2px; text-shadow: 0 2px 6px rgba(0,0,0,0.25); }
.lvl-tag { font-size: 12px; opacity: 0.9; }

.progress { margin-top: 16px; }
.bar { height: 10px; border-radius: 999px; background: rgba(255,255,255,0.3); overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: 999px; background: #fff; transition: width 0.5s ease; }
.prog-row { display: flex; justify-content: space-between; margin-top: 7px; font-size: 11px; font-weight: 700; }
.prog-row .faint { color: rgba(255,255,255,0.85); }

.claimable {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-radius: var(--radius);
  background: linear-gradient(135deg, #fff5d6, #ffe8a3); color: #7a5200;
  box-shadow: var(--shadow-card);
  strong { font-size: 15px; }
  .tiny { font-size: 11px; opacity: 0.8; }
}
.btn-claim {
  height: 40px; padding: 0 18px; border-radius: 999px;
  background: linear-gradient(135deg, #f5b301, #e8890b); color: #fff; font-weight: 800; font-size: 13px;
  &:disabled { opacity: 0.5; }
}

.ladder { background: var(--surface); border-radius: var(--radius); padding: 6px 14px; box-shadow: var(--shadow-card); }
.ladder .head { font-size: 13px; font-weight: 800; padding: 10px 0 4px; color: var(--text-dim); }
.lvl {
  display: flex; align-items: center; gap: 12px; padding: 11px 0;
  border-bottom: 1px solid var(--line); opacity: 0.55;
  &:last-child { border-bottom: 0; }
  &.reached { opacity: 1; }
  &.current { background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 8%, transparent), transparent); border-radius: 8px; padding-left: 8px; margin: 0 -8px; }
}
.badge {
  width: 34px; height: 34px; border-radius: 10px; color: #fff; font-weight: 900; font-size: 15px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  font-family: var(--font-num);
}
.info { flex: 1; min-width: 0; }
.name { font-size: 14px; font-weight: 800; }
.req { margin-top: 1px; }
.reward { text-align: right; }
.reward .amt { font-size: 14px; font-weight: 800; color: var(--primary-deep); }
.state { font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 999px; display: inline-block; margin-top: 3px; }
.state.done { background: #e7f8f0; color: #0c7a52; }
.state.ready { background: #fff3d6; color: #b3820b; }
.state.locked { background: var(--surface-3); color: var(--text-faint); }

.foot { font-size: 11px; line-height: 1.6; padding: 0 4px; margin: 0; }

.toast {
  position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%);
  background: rgba(40, 16, 28, 0.95); color: #fff; padding: 9px 16px; border-radius: 999px; font-size: 13px; z-index: 200;
}
</style>
