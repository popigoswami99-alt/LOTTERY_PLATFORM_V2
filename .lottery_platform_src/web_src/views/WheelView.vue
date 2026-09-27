<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  WHEEL_RISKS,
  WHEEL_SEGMENTS,
  formatMinor,
  formatX100,
  wheelSegments,
  type WheelRisk,
} from '@lp/shared';
import { useInstantStore } from '@/stores/instant';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';
import FairnessPanel from '@/components/FairnessPanel.vue';

const instant = useInstantStore();
const auth = useAuthStore();
const router = useRouter();

const stake = ref(10_000n);
const risk = ref<WheelRisk>('medium');
const busy = ref(false);
const toast = ref('');
const rotation = ref(0);
const landed = ref<number | null>(null);

const CHIPS = [1_000n, 10_000n, 50_000n, 100_000n];
const SEG_ANGLE = 360 / WHEEL_SEGMENTS;
const R = 140;
const CX = 150;
const CY = 150;

/** Computed from the SAME module the server scores with, so they can't diverge. */
const segments = computed(() => wheelSegments(risk.value));

function toneOf(multX100: number): string {
  if (multX100 === 0) return 'loss';
  if (multX100 < 200) return 'low';
  if (multX100 < 600) return 'mid';
  return 'hot';
}
const TONE_FILL: Record<string, string> = {
  loss: '#f3d0de',
  low: '#8fbcff',
  mid: '#38c48f',
  hot: '#f5b301',
};

function pt(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

/** Annular-free pie sectors + a label anchor for each of the 30 segments. */
const sectors = computed(() =>
  segments.value.map((s, i) => {
    const a0 = i * SEG_ANGLE;
    const a1 = (i + 1) * SEG_ANGLE;
    const p0 = pt(a0, R);
    const p1 = pt(a1, R);
    const label = pt(a0 + SEG_ANGLE / 2, R - 26);
    return {
      i,
      path: `M${CX},${CY} L${p0.x.toFixed(2)},${p0.y.toFixed(2)} A${R},${R} 0 0 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)} Z`,
      fill: TONE_FILL[toneOf(s.multiplierX100)],
      label: s.multiplierX100 === 0 ? '' : `${formatX100(s.multiplierX100)}x`,
      lx: label.x,
      ly: label.y,
      rot: a0 + SEG_ANGLE / 2,
    };
  }),
);

const landedMult = computed(() =>
  landed.value === null ? null : segments.value[landed.value].multiplierX100,
);

async function spin() {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/wheel' } });
    return;
  }
  busy.value = true;
  landed.value = null;
  try {
    const r = await instant.spinWheel(stake.value.toString(), risk.value);
    // Rotate so the landed segment's centre stops under the top pointer, always
    // spinning forward with several extra turns for effect.
    const base = Math.ceil(rotation.value / 360) * 360;
    rotation.value = base + 360 * 5 + (360 - (r.segment * SEG_ANGLE + SEG_ANGLE / 2));
    // Reveal the result only once the wheel has settled.
    await new Promise((res) => setTimeout(res, 4200));
    landed.value = r.segment;
    flash(
      BigInt(r.payout) > 0n
        ? `${formatX100(r.multiplierX100)}x — ₹${formatMinor(r.payout)}`
        : `${formatX100(r.multiplierX100)}x — no return`,
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
  toastTimer = window.setTimeout(() => (toast.value = ''), 2600);
}

onMounted(async () => {
  if (auth.isLoggedIn) {
    await instant.loadSeed();
    await instant.loadHistory('WHEEL');
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

    <section class="stage">
      <div class="pointer" />
      <div class="wheel" :class="{ spinning: busy }" :style="{ transform: `rotate(${rotation}deg)` }">
        <svg viewBox="0 0 300 300">
          <g v-for="s in sectors" :key="s.i">
            <path :d="s.path" :fill="s.fill" stroke="#fff" stroke-width="1" />
            <text
              v-if="s.label"
              :x="s.lx"
              :y="s.ly"
              :transform="`rotate(${s.rot} ${s.lx} ${s.ly})`"
              text-anchor="middle"
              dominant-baseline="middle"
              class="seg-label"
            >
              {{ s.label }}
            </text>
          </g>
          <circle :cx="CX" :cy="CY" r="30" fill="#fff" stroke="#f3c9db" stroke-width="2" />
        </svg>
        <div class="hub">
          <span v-if="landedMult !== null" class="hub-mult num">{{ formatX100(landedMult) }}x</span>
          <span v-else class="hub-idle">SPIN</span>
        </div>
      </div>
    </section>

    <section class="card ctrl">
      <span class="label">Risk</span>
      <div class="chips three">
        <button
          v-for="r in WHEEL_RISKS"
          :key="r"
          class="chip"
          :class="{ on: risk === r }"
          :disabled="busy"
          @click="risk = r; landed = null"
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
          :disabled="busy"
          @click="stake = c"
        >
          ₹{{ formatMinor(c).replace('.00', '') }}
        </button>
      </div>

      <button class="btn btn-primary" :disabled="busy" @click="spin">
        {{ busy ? 'Spinning…' : `Spin ₹${formatMinor(stake)}` }}
      </button>

      <p class="note faint">
        Risk changes how spiky the wheel is — never the house edge. Every risk level returns 98%.
      </p>
    </section>

    <FairnessPanel v-if="auth.isLoggedIn" />

    <section v-if="instant.history.length" class="hist">
      <strong class="hd">Recent spins</strong>
      <div v-for="h in instant.history" :key="h.id" class="row">
        <span class="faint tiny">{{ (h.params as any).risk }}</span>
        <span class="num">{{ formatX100(h.multiplierX100) }}x</span>
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
.page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }

.wallet {
  background: linear-gradient(135deg, var(--header-from), var(--header-to));
  border-radius: var(--radius);
  padding: 12px 14px;
  color: #fff;
  box-shadow: var(--shadow-card);
  .dim { color: rgba(255, 255, 255, 0.85); }
  .amount { font-size: 22px; font-weight: 800; }
}

.stage {
  position: relative;
  display: flex;
  justify-content: center;
  padding: 26px 10px 10px;
  background: radial-gradient(circle at 50% 42%, #ffffff, var(--surface-2) 78%);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}

.pointer {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 11px solid transparent;
  border-right: 11px solid transparent;
  border-top: 20px solid var(--primary-deep);
  z-index: 5;
  filter: drop-shadow(0 2px 3px rgba(160, 40, 90, 0.4));
}

.wheel {
  position: relative;
  width: 300px;
  max-width: 84vw;
  aspect-ratio: 1;
  transition: transform 4s cubic-bezier(0.16, 0.84, 0.24, 1);
  will-change: transform;

  svg { width: 100%; height: 100%; display: block; filter: drop-shadow(0 6px 18px rgba(160, 40, 90, 0.18)); }
}

.seg-label {
  font-family: var(--font-num);
  font-size: 11px;
  font-weight: 800;
  fill: #3a1e2b;
}

.hub {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 58px;
  height: 58px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Counter-rotate so the centre text stays upright while the wheel turns. */
  pointer-events: none;
}
.hub-mult { font-size: 15px; font-weight: 900; color: var(--primary-deep); }
.hub-idle { font-size: 11px; font-weight: 900; letter-spacing: 1px; color: var(--text-faint); }

.ctrl { display: flex; flex-direction: column; gap: 10px; }
.chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; &.three { grid-template-columns: repeat(3, 1fr); } }
.chip {
  height: 34px; border-radius: 8px; background: var(--surface-2); color: var(--text-dim);
  font-size: 12px; font-weight: 700; text-transform: capitalize;
  &.on { background: linear-gradient(135deg, var(--accent-from), var(--accent-to)); color: #fff; }
  &:disabled { opacity: 0.5; }
}
.note { margin: 0; font-size: 10px; line-height: 1.6; }

.hist { background: var(--surface); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow-card); }
.hd { display: block; margin-bottom: 6px; font-size: 13px; }
.row {
  display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 10px;
  padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 12px; font-weight: 600; text-transform: capitalize;
  &:last-child { border-bottom: 0; }
}
.tiny { font-size: 10px; }

.toast {
  position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%);
  background: rgba(40, 16, 28, 0.95); color: #fff;
  padding: 9px 16px; border-radius: 999px; font-size: 13px; z-index: 200; max-width: 90%; text-align: center;
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
