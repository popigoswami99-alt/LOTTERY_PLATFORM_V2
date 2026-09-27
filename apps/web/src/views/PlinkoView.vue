<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  PLINKO_RISKS,
  PLINKO_ROWS,
  formatMinor,
  formatX100,
  plinkoMultipliers,
  type PlinkoRisk,
  type PlinkoRows,
} from '@lp/shared';
import { useInstantStore } from '@/stores/instant';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';
import FairnessPanel from '@/components/FairnessPanel.vue';

const instant = useInstantStore();
const auth = useAuthStore();
const router = useRouter();

const stake = ref(10_000n);
const rows = ref<PlinkoRows>(12);
const risk = ref<PlinkoRisk>('medium');
const busy = ref(false);
const toast = ref('');
const landed = ref<number | null>(null);
const dropping = ref(false);

const CHIPS = [1_000n, 10_000n, 50_000n, 100_000n];

/** Computed client-side from the SAME module the server pays from. */
const multipliers = computed(() => plinkoMultipliers(rows.value, risk.value));

function bucketClass(m: number): string {
  if (m >= 500) return 'b-hot';
  if (m >= 150) return 'b-warm';
  if (m >= 100) return 'b-even';
  return 'b-cold';
}

/** Peg rows for the visual board. */
const pegRows = computed(() => Array.from({ length: rows.value }, (_, r) => r + 1));

async function drop() {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/plinko' } });
    return;
  }
  busy.value = true;
  dropping.value = true;
  landed.value = null;
  try {
    const r = await instant.dropPlinko(stake.value.toString(), rows.value, risk.value);
    // Brief pause so the drop reads as an event rather than an instant jump.
    await new Promise((res) => setTimeout(res, 450));
    landed.value = r.bucket;
    flash(
      BigInt(r.payout) > 0n
        ? `${formatX100(r.multiplierX100)}x — ₹${formatMinor(r.payout)}`
        : `${formatX100(r.multiplierX100)}x — no return`,
    );
  } catch (err) {
    flash(apiError(err));
  } finally {
    dropping.value = false;
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
    await instant.loadHistory('PLINKO');
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
      <div class="pegs" :class="{ dropping }">
        <div v-for="r in pegRows" :key="r" class="peg-row">
          <span v-for="p in r" :key="p" class="peg" />
        </div>
      </div>

      <div class="buckets" :style="{ gridTemplateColumns: `repeat(${rows + 1}, 1fr)` }">
        <div
          v-for="(m, i) in multipliers"
          :key="i"
          class="bucket"
          :class="[bucketClass(m), { hit: landed === i }]"
        >
          {{ formatX100(m) }}
        </div>
      </div>
    </section>

    <section class="card ctrl">
      <span class="label">Risk</span>
      <div class="chips three">
        <button
          v-for="r in PLINKO_RISKS"
          :key="r"
          class="chip"
          :class="{ on: risk === r }"
          @click="risk = r"
        >
          {{ r }}
        </button>
      </div>

      <span class="label">Rows</span>
      <div class="chips three">
        <button
          v-for="r in PLINKO_ROWS"
          :key="r"
          class="chip"
          :class="{ on: rows === r }"
          @click="rows = r"
        >
          {{ r }}
        </button>
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

      <button class="btn btn-primary" :disabled="busy" @click="drop">
        {{ busy ? 'Dropping…' : `Drop ₹${formatMinor(stake)}` }}
      </button>

      <p class="note faint">
        Risk changes how spiky the paytable is — never the house edge. Every risk level and
        row count returns 98%.
      </p>
    </section>

    <FairnessPanel v-if="auth.isLoggedIn" />

    <section v-if="instant.history.length" class="hist">
      <strong class="hd">Recent drops</strong>
      <div v-for="h in instant.history" :key="h.id" class="row">
        <span class="faint tiny">{{ (h.params as any).rows }} rows · {{ (h.params as any).risk }}</span>
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
  padding: 14px 10px 10px;
}

.pegs {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  margin-bottom: 10px;
  transition: opacity 0.2s ease;

  &.dropping {
    opacity: 0.55;
  }
}

.peg-row {
  display: flex;
  gap: 9px;
}

.peg {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-faint);
}

.buckets {
  display: grid;
  gap: 2px;
}

.bucket {
  padding: 5px 0;
  border-radius: 4px;
  text-align: center;
  font-size: 9px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;

  &.hit {
    transform: translateY(-4px) scale(1.12);
    box-shadow: 0 0 0 2px #fff;
  }
}

.b-cold {
  background: rgba(147, 160, 187, 0.2);
  color: var(--text-dim);
}
.b-even {
  background: rgba(155, 89, 246, 0.28);
  color: #d9c4ff;
}
.b-warm {
  background: rgba(22, 185, 121, 0.3);
  color: #9ff0cd;
}
.b-hot {
  background: rgba(245, 166, 35, 0.35);
  color: #ffd894;
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

  &.three {
    grid-template-columns: repeat(3, 1fr);
  }
}

.chip {
  height: 32px;
  border-radius: 6px;
  background: var(--surface-3);
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 700;
  text-transform: capitalize;

  &.on {
    background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
    color: #fff;
  }
}

.note {
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
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
