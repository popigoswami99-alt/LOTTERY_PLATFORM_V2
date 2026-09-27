<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatMinor, formatX100, parseMultiplier } from '@lp/shared';
import { useInstantStore } from '@/stores/instant';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';
import FairnessPanel from '@/components/FairnessPanel.vue';

const instant = useInstantStore();
const auth = useAuthStore();
const router = useRouter();

const stake = ref(10_000n);
const targetText = ref('2.00');
const busy = ref(false);
const last = ref<{ resultX100: number; won: boolean; payout: string; targetX100: number } | null>(
  null,
);
const toast = ref('');

const CHIPS = [1_000n, 10_000n, 50_000n, 100_000n];
const PRESETS = ['1.50', '2.00', '5.00', '10.00'];

const targetX100 = computed(() => {
  try {
    return parseMultiplier(targetText.value);
  } catch {
    return 0;
  }
});

/** Win chance is exactly 100/target — the same law as Crash. */
const winChance = computed(() =>
  targetX100.value > 100 ? (100 / targetX100.value) * 100 : 0,
);

const valid = computed(() => targetX100.value >= 101 && targetX100.value <= 1_000_000);

async function play() {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/limbo' } });
    return;
  }
  if (!valid.value) {
    flash('Target must be between 1.01x and 10,000x');
    return;
  }
  busy.value = true;
  try {
    last.value = await instant.playLimbo(stake.value.toString(), targetX100.value);
    flash(
      last.value.won
        ? `${formatX100(last.value.resultX100)}x — won ₹${formatMinor(last.value.payout)}`
        : `${formatX100(last.value.resultX100)}x — below target`,
    );
  } catch (err) {
    flash(apiError(err));
  } finally {
    busy.value = false;
  }
}

let toastTimer: number | undefined;
function flash(m: string) {
  toast.value = m;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2400);
}

onMounted(async () => {
  if (auth.isLoggedIn) {
    await instant.loadSeed();
    await instant.loadHistory('LIMBO');
  }
});

onUnmounted(() => {
  instant.reset();
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page">
    <section class="wallet">
      <span class="dim tiny">Wallet balance</span>
      <div class="amount mono">₹{{ formatMinor(auth.balance) }}</div>
    </section>

    <section class="board" :class="last ? (last.won ? 'won' : 'lost') : ''">
      <span class="cap">Result</span>
      <div class="big mono" :class="last ? (last.won ? 'win' : 'loss') : 'faint'">
        {{ last ? formatX100(last.resultX100) : '—.--' }}x
      </div>
      <span v-if="last" class="sub" :class="last.won ? 'win' : 'loss'">
        {{
          last.won
            ? `+₹${formatMinor(last.payout)} at ${formatX100(last.targetX100)}x`
            : `needed ${formatX100(last.targetX100)}x`
        }}
      </span>
      <span v-else class="sub faint">Pick a target and play</span>
    </section>

    <section class="card ctrl">
      <span class="label">Target multiplier</span>
      <div class="target-row">
        <input v-model="targetText" class="tin mono" inputmode="decimal" />
        <span class="x">x</span>
      </div>
      <div class="chips">
        <button
          v-for="p in PRESETS"
          :key="p"
          class="chip"
          :class="{ on: targetText === p }"
          @click="targetText = p"
        >
          {{ p }}x
        </button>
      </div>

      <div class="stat-row">
        <div class="stat">
          <span class="cap">Win chance</span>
          <strong class="mono">{{ winChance.toFixed(2) }}%</strong>
        </div>
        <div class="stat">
          <span class="cap">Pays</span>
          <strong class="mono">{{ valid ? formatX100(targetX100) : '—' }}x</strong>
        </div>
      </div>

      <span class="label">Bet amount</span>
      <div class="chips">
        <button
          v-for="c in CHIPS"
          :key="c.toString()"
          class="chip"
          :class="{ on: stake === c }"
          @click="stake = c"
        >
          ₹{{ formatMinor(c).replace('.00', '') }}
        </button>
      </div>

      <button class="btn btn-primary" :disabled="busy || !valid" @click="play">
        {{ busy ? 'Playing…' : `Play ₹${formatMinor(stake)}` }}
      </button>
    </section>

    <FairnessPanel v-if="auth.isLoggedIn" />

    <section v-if="instant.history.length" class="hist">
      <strong class="hd">Recent plays</strong>
      <div v-for="h in instant.history" :key="h.id" class="row">
        <span class="mono">{{ formatX100((h.resultData as any)?.resultX100 ?? 0) }}x</span>
        <span class="faint tiny">target {{ formatX100((h.params as any).targetX100) }}x</span>
        <span :class="h.status === 'WON' ? 'win' : 'loss'">
          {{ h.status === 'WON' ? `+₹${formatMinor(h.payout)}` : `−₹${formatMinor(h.stake)}` }}
        </span>
      </div>
    </section>

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped lang="scss">
.page {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wallet {
  background: linear-gradient(135deg, #2a3247, #1b2233);
  border-radius: var(--radius);
  padding: 12px 14px;

  .amount {
    font-size: 22px;
    font-weight: 800;
  }
}

.board {
  background: radial-gradient(circle at 50% 30%, #1e2740, #131a29 75%);
  border-radius: var(--radius);
  padding: 26px 14px;
  text-align: center;
  transition: background 0.25s ease;

  &.won {
    background: radial-gradient(circle at 50% 30%, #17352b, #131a29 75%);
  }
  &.lost {
    background: radial-gradient(circle at 50% 30%, #35191b, #131a29 75%);
  }
}

.cap {
  font-size: 11px;
  color: var(--text-dim);
}

.big {
  font-size: 48px;
  font-weight: 800;
  line-height: 1.1;
}

.sub {
  font-size: 12px;
  font-weight: 700;
}

.ctrl {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.target-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tin {
  flex: 1;
  height: 42px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  outline: none;
  font-size: 19px;
  font-weight: 700;

  &:focus {
    border-color: var(--gold);
  }
}

.x {
  font-size: 17px;
  font-weight: 800;
  color: var(--text-dim);
}

.stat-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stat {
  background: var(--surface-2);
  border-radius: 8px;
  padding: 7px 9px;

  strong {
    display: block;
    font-size: 15px;
  }
}

.chips {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.chip {
  height: 32px;
  border-radius: 6px;
  background: var(--surface-3);
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 700;

  &.on {
    background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
    color: #fff;
  }
}

.hist {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 12px;
}

.hd {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(49, 60, 85, 0.4);
  font-size: 12px;
  font-weight: 600;

  &:last-child {
    border-bottom: 0;
  }
}

.tiny {
  font-size: 10px;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 84px;
  transform: translateX(-50%);
  background: rgba(20, 26, 40, 0.96);
  border: 1px solid var(--line);
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 13px;
  z-index: 200;
  max-width: 90%;
  text-align: center;
}

/* LOTTERY_PLATFORM_GAME_UX_03 */
:root{--game-bg:#121216;--game-card:#1b1b20;--game-border:#2d2d35}
.aviator,.chicken-road,.mines,.plinko,.limbo,.dice,.wheel,.hilo{
 width:100%;max-width:100vw;min-width:0;box-sizing:border-box;overflow-x:hidden
}
.layout,.main,.board,.canvas,.panels,.panel,.controls,.controls-panel,
.bet-panel,.game-board,.history,.actions{
 width:100%;max-width:100%;min-width:0;box-sizing:border-box
}
.panels>*{min-width:0;max-width:100%;box-sizing:border-box}
button,input,select{box-sizing:border-box;max-width:100%}
@media(max-width:1000px){
 .layout{display:flex;flex-direction:column;width:100%;padding:6px;gap:8px}
 .panels{display:grid;grid-template-columns:minmax(0,1fr)!important;width:100%}
 .panels>*{width:100%!important}
}
@media(max-width:600px){
 .canvas,.board{height:300px;min-height:210px}
 .controls,.controls-panel{padding:8px}
 .panels{gap:8px}
 .bet-panel,.panel{overflow:hidden;padding:8px}
 .quick,.quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:420px){
 .canvas,.board{height:250px;min-height:200px}
 .body{grid-template-columns:minmax(0,1fr)!important}
}

</style>
