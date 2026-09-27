<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  KENO_MAX_PICKS,
  KENO_POOL,
  formatMinor,
  formatX100,
  kenoPaytable,
  kenoThreshold,
} from '@lp/shared';
import { useInstantStore } from '@/stores/instant';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';
import FairnessPanel from '@/components/FairnessPanel.vue';

const instant = useInstantStore();
const auth = useAuthStore();
const router = useRouter();

const stake = ref(10_000n);
const picks = ref<number[]>([]);
const busy = ref(false);
const toast = ref('');
const drawn = ref<number[]>([]);
const hits = ref<number[]>([]);

const CHIPS = [1_000n, 10_000n, 50_000n, 100_000n];
const BALLS = Array.from({ length: KENO_POOL }, (_, i) => i + 1);

/** Paytable computed client-side from the same module the server pays from. */
const paytable = computed(() => (picks.value.length ? kenoPaytable(picks.value.length) : []));
const threshold = computed(() =>
  picks.value.length ? kenoThreshold(picks.value.length) : 0,
);

function toggle(n: number) {
  if (drawn.value.length) reset();
  const i = picks.value.indexOf(n);
  if (i >= 0) picks.value.splice(i, 1);
  else if (picks.value.length < KENO_MAX_PICKS) picks.value.push(n);
  else flash(`You can pick at most ${KENO_MAX_PICKS} numbers`);
}

function quickPick() {
  reset();
  const pool = [...BALLS];
  const out: number[] = [];
  const n = picks.value.length || 5;
  for (let i = 0; i < n; i += 1) {
    out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
  }
  picks.value = out.sort((a, b) => a - b);
}

function reset() {
  drawn.value = [];
  hits.value = [];
}

function ballClass(n: number): string {
  const picked = picks.value.includes(n);
  if (!drawn.value.length) return picked ? 'picked' : '';
  const isDrawn = drawn.value.includes(n);
  if (picked && isDrawn) return 'hit';
  if (picked) return 'miss';
  if (isDrawn) return 'drawn';
  return 'dim';
}

async function play() {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/keno' } });
    return;
  }
  if (!picks.value.length) {
    flash('Pick at least one number');
    return;
  }
  busy.value = true;
  try {
    const r = await instant.playKeno(stake.value.toString(), picks.value);
    drawn.value = r.drawn;
    hits.value = r.hits;
    flash(
      BigInt(r.payout) > 0n
        ? `${r.hits.length} hits — ₹${formatMinor(r.payout)}`
        : `${r.hits.length} hits — no win`,
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
    await instant.loadHistory('KENO');
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

    <section class="board">
      <div class="hdr">
        <span class="cap">{{ picks.length }} picked · 10 drawn from {{ KENO_POOL }}</span>
        <span v-if="drawn.length" class="hitcount">{{ hits.length }} hits</span>
      </div>

      <div class="grid">
        <button v-for="n in BALLS" :key="n" class="ball" :class="ballClass(n)" @click="toggle(n)">
          {{ n }}
        </button>
      </div>
    </section>

    <!-- Paytable for the current pick count -->
    <section v-if="paytable.length" class="card pay">
      <strong class="hd">Paytable · {{ picks.length }} picks</strong>
      <div class="pay-grid">
        <div
          v-for="(m, h) in paytable"
          :key="h"
          class="pay-cell"
          :class="{ zero: m === 0, active: drawn.length > 0 && hits.length === h }"
        >
          <span class="h">{{ h }}</span>
          <span class="m">{{ m === 0 ? '—' : `${formatX100(m)}x` }}</span>
        </div>
      </div>
      <p class="note faint">Pays from {{ threshold }} hits up.</p>
    </section>

    <section class="card ctrl">
      <div class="chips two">
        <button class="chip" @click="quickPick">Quick pick</button>
        <button class="chip" @click="((picks = []), reset())">Clear</button>
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

      <button class="btn btn-primary" :disabled="busy || !picks.length" @click="play">
        {{ busy ? 'Drawing…' : `Play ₹${formatMinor(stake)}` }}
      </button>
    </section>

    <FairnessPanel v-if="auth.isLoggedIn" />

    <section v-if="instant.history.length" class="hist">
      <strong class="hd">Recent games</strong>
      <div v-for="h in instant.history" :key="h.id" class="row">
        <span class="faint tiny">
          {{ ((h.params as any).picks ?? []).length }} picks ·
          {{ ((h.resultData as any)?.hits ?? []).length }} hits
        </span>
        <span class="mono">{{ formatX100(h.multiplierX100) }}x</span>
        <span :class="BigInt(h.payout) > 0n ? 'win' : 'loss'">
          {{ BigInt(h.payout) > 0n ? `+₹${formatMinor(h.payout)}` : `−₹${formatMinor(h.stake)}` }}
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
  background: radial-gradient(circle at 50% 0%, #1e2740, #131a29 75%);
  border-radius: var(--radius);
  padding: 12px;
}

.hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.cap {
  font-size: 11px;
  color: var(--text-dim);
}

.hitcount {
  font-size: 12px;
  font-weight: 800;
  color: var(--green);
}

.grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 5px;
}

.ball {
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--surface-3);
  border: 1px solid var(--line);
  font-size: 12px;
  font-weight: 700;
  color: var(--text-dim);
  transition:
    transform 0.1s ease,
    background 0.2s ease;

  &:active {
    transform: scale(0.9);
  }

  &.picked {
    background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
    border-color: transparent;
    color: #fff;
  }

  &.hit {
    background: var(--green);
    border-color: #fff;
    color: #fff;
  }

  &.miss {
    background: rgba(245, 166, 35, 0.2);
    border-color: var(--gold);
    color: var(--gold);
  }

  &.drawn {
    background: rgba(155, 89, 246, 0.25);
    border-color: var(--violet);
    color: #d9c4ff;
  }

  &.dim {
    opacity: 0.35;
  }
}

.pay {
  padding: 12px;
}

.hd {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
}

.pay-grid {
  display: flex;
  gap: 4px;
  overflow-x: auto;

  &::-webkit-scrollbar {
    display: none;
  }
}

.pay-cell {
  flex: 0 0 auto;
  min-width: 42px;
  padding: 5px 6px;
  border-radius: 6px;
  background: var(--surface-2);
  text-align: center;

  .h {
    display: block;
    font-size: 9px;
    color: var(--text-faint);
  }

  .m {
    display: block;
    font-size: 11px;
    font-weight: 800;
  }

  &.zero .m {
    color: var(--text-faint);
  }

  &.active {
    background: var(--green);
    color: #fff;
  }
}

.note {
  margin: 8px 0 0;
  font-size: 10px;
}

.ctrl {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chips {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;

  &.two {
    grid-template-columns: 1fr 1fr;
  }
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

.row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
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

/* LOTTERY_PLATFORM_GAME_UX_04 */
.table-game,.dragon-tiger,.andar-bahar,.keno,.moto-race{
 width:100%;max-width:100vw;min-width:0;box-sizing:border-box;overflow-x:hidden
}
.table,.game-table,.card-table,.bet-panel,.controls,.history,.result{
 width:100%;max-width:100%;min-width:0;box-sizing:border-box
}
.cards,.seats,.bets,.options,.number-grid{
 min-width:0;max-width:100%
}
button{max-width:100%;box-sizing:border-box}
@media(max-width:768px){
 .table-game,.dragon-tiger,.andar-bahar,.keno,.moto-race{padding:6px}
 .cards,.seats{overflow-x:auto}
 .bet-panel,.controls{padding:8px}
 .options,.bets,.number-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr))!important;
  gap:6px;
 }
}
@media(max-width:420px){
 .cards{gap:4px}
 .options,.bets,.number-grid{
  grid-template-columns:repeat(2,minmax(0,1fr))!important;
 }
}

</style>


/* LOTTERY_PLATFORM_BLOCK_03_ADD_ONLY */

.lp-originals-control,
.originals-control,
.game-controls,
.bet-controls{
  width:100%;
  max-width:100%;
  min-width:0;
  box-sizing:border-box;
}

@media(max-width:768px){
  .crash,
  .aviator,
  .mines,
  .plinko,
  .limbo,
  .dice,
  .wheel,
  .hilo,
  .dragon-tiger,
  .andar-bahar,
  .keno,
  .layout,
  .content,
  .game,
  .game-area,
  .controls,
  .panel{
    min-width:0;
    max-width:100%;
    box-sizing:border-box;
  }

  .panels,
  .bet-panels,
  .controls-panel,
  .control-panel{
    width:100%;
    max-width:100%;
    min-width:0;
    box-sizing:border-box;
  }

  input,
  select,
  button{
    max-width:100%;
  }
}
