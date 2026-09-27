<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  DICE_MAX_WIN_COUNT,
  DICE_MIN_WIN_COUNT,
  DICE_ROLL_SPAN,
  diceMultiplierX100,
  formatMinor,
  formatRoll,
  formatX100,
  type DiceDirection,
} from '@lp/shared';
import { useInstantStore } from '@/stores/instant';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';

/**
 * Spribe-style Dice UI.
 *
 * Presentation only — the roll derivation, seed pair and exact-odds payout are
 * untouched. The slider drives a WIN CHANCE, from which both roll-under and
 * roll-over targets are derived; whichever button is pressed sends that
 * direction to the same endpoint as before.
 */

const instant = useInstantStore();
const auth = useAuthStore();
const router = useRouter();

/** Win chance in hundredths of a percent: 4850 = 48.50%. */
const winCount = ref(4850);

/** Table minimum is ₹10 — the server rejects anything below it. */
const MIN_STAKE = 1_000n;
const CHIP_STEP = 1_000n;

const stake = ref(MIN_STAKE);
const busy = ref(false);
const toast = ref('');
const last = ref<{ roll: number; won: boolean; payout: string } | null>(null);
const dragging = ref(false);

/**
 * Where the knob currently sits on the rollers, in roll units (0..9999).
 *
 * The knob is both the target handle and the ball: at rest it sits on the
 * target, and on a roll it travels along the rollers to the number that came
 * up. The target stays readable while it is away because the colour split in
 * the bands marks it independently.
 */
const knobX100 = ref(4850);
const rolling = ref(false);

const trackEl = ref<HTMLElement | null>(null);

/** Roll UNDER this value wins. */
const underTarget = computed(() => winCount.value);
/** Roll OVER this value wins — same chance, mirrored. */
const overTarget = computed(() => DICE_ROLL_SPAN - 1 - winCount.value);

const multiplier = computed(() => diceMultiplierX100(winCount.value));
const chancePct = computed(() => (winCount.value / DICE_ROLL_SPAN) * 100);
const potentialWin = computed(() => (stake.value * 98n * BigInt(multiplier.value)) / (100n * 100n));

/** The big number: the last roll if there is one, otherwise the marker. */
const bigNumber = computed(() =>
  last.value ? formatRoll(last.value.roll) : formatRoll(winCount.value),
);

/** Where the colour split sits — always the target. */
const markerPct = computed(() => (winCount.value / DICE_ROLL_SPAN) * 100);

/** Where the knob sits — the target at rest, the result after a roll. */
const knobPct = computed(() => (knobX100.value / DICE_ROLL_SPAN) * 100);

// Moving the target brings the knob back to it, so it stays draggable.
watch(winCount, (v) => {
  knobX100.value = v;
});

// --- slider interaction ----------------------------------------------------

function setFromClientX(clientX: number) {
  const el = trackEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const raw = Math.round(ratio * DICE_ROLL_SPAN);
  winCount.value = Math.min(DICE_MAX_WIN_COUNT, Math.max(DICE_MIN_WIN_COUNT, raw));
}

function onDown(e: PointerEvent) {
  dragging.value = true;
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  setFromClientX(e.clientX);
}
function onMove(e: PointerEvent) {
  if (dragging.value) setFromClientX(e.clientX);
}
function onUp() {
  dragging.value = false;
}

/** The payout slider is the same control expressed as a multiplier. */
const payoutSlider = computed({
  get: () => winCount.value,
  set: (v: number) => {
    winCount.value = Math.min(DICE_MAX_WIN_COUNT, Math.max(DICE_MIN_WIN_COUNT, Math.round(v)));
  },
});

// --- betting ---------------------------------------------------------------

function bump(dir: 1 | -1) {
  const next = stake.value + CHIP_STEP * BigInt(dir);
  stake.value = next < MIN_STAKE ? MIN_STAKE : next;
}

function double() {
  stake.value = stake.value * 2n;
}

function exit() {
  router.push({ name: 'home' });
}

async function roll(direction: DiceDirection) {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/dice' } });
    return;
  }
  busy.value = true;
  rolling.value = true;
  try {
    const target = direction === 'under' ? underTarget.value : overTarget.value;
    const r = await instant.rollDice(stake.value.toString(), target, direction);

    // Let the knob travel to the landing spot before the result is announced,
    // so the number is read off the rollers rather than just appearing.
    knobX100.value = r.roll;
    await new Promise((res) => setTimeout(res, 620));

    last.value = r;
    flash(
      r.won
        ? `Rolled ${formatRoll(r.roll)} — won ₹${formatMinor(r.payout)}`
        : `Rolled ${formatRoll(r.roll)} — no win`,
    );
  } catch (err) {
    flash(apiError(err));
  } finally {
    rolling.value = false;
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
    await instant.loadHistory('DICE');
  }
});

// Leaving the game clears its history, so returning starts fresh.
onUnmounted(() => {
  instant.reset();
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="dice-app">
    <div class="frame">
      <!-- Header -->
      <header class="top">
        <button class="exit" title="Exit game" @click="exit">←</button>
        <button class="game-pick">
          DICE
          <span class="caret">⌄</span>
        </button>
        <button class="howto">
          <span class="q">?</span>
          How to Play?
        </button>
        <div class="bal">
          <strong class="mono">{{ formatMinor(auth.balance) }}</strong>
          <span class="cur">INR</span>
        </div>
        <button class="burger"><i /><i /><i /></button>
      </header>

      <!-- History bar -->
      <div class="hist-bar">
        <div class="hist-items">
          <span
            v-for="h in instant.history.slice(0, 12)"
            :key="h.id"
            class="hist-chip"
            :class="h.status === 'WON' ? 'w' : 'l'"
          >
            {{ formatRoll(((h.resultData as any)?.roll ?? 0) as number) }}
          </span>
        </div>
        <button class="fair-btn">
          <span class="shield">✓</span>
          <span class="caret">⌄</span>
        </button>
      </div>

      <!-- Result + slider -->
      <section class="stage">
        <div class="big mono" :class="last ? (last.won ? 'won' : 'lost') : ''">
          {{ bigNumber }}
        </div>

        <div class="ticks">
          <span /><span /><span /><span /><span />
        </div>

        <div
          ref="trackEl"
          class="track"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
        >
          <!-- Top band: the roll-OVER view (red below the marker, blue above) -->
          <div class="band">
            <div class="seg red" :style="{ width: `${markerPct}%` }" />
            <div class="seg blue" :style="{ width: `${100 - markerPct}%` }" />
          </div>
          <!-- Bottom band: the roll-UNDER view (green below, red above) -->
          <div class="band">
            <div class="seg green" :style="{ width: `${markerPct}%` }" />
            <div class="seg red" :style="{ width: `${100 - markerPct}%` }" />
          </div>

          <!-- The knob is the ball: it rides the rollers to the landing spot. -->
          <div
            class="knob"
            :style="{ left: `${knobPct}%` }"
            :class="{ drag: dragging, rolling, won: last?.won === true, lost: last?.won === false }"
          />
        </div>

        <div class="scale">
          <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
        </div>
      </section>

      <!-- Payout box -->
      <section class="payout">
        <div class="pay-left">
          <span class="cap">Payout</span>
          <div class="pay-val mono">{{ formatX100(multiplier) }} x</div>
        </div>
        <div class="pay-slider">
          <input
            v-model.number="payoutSlider"
            type="range"
            :min="DICE_MIN_WIN_COUNT"
            :max="DICE_MAX_WIN_COUNT"
            step="1"
          />
        </div>
        <div class="pay-foot">
          <div>
            <span class="cap">Potential win:</span>
            <strong class="mono">{{ formatMinor(potentialWin) }} INR</strong>
          </div>
          <div class="chance">
            <span class="cap">Chance:</span>
            <strong class="mono">{{ chancePct.toFixed(2) }} %</strong>
          </div>
        </div>
      </section>

      <!-- Bet bar -->
      <footer class="betbar">
        <div class="amount">
          <span class="cap">Bet INR · min {{ formatMinor(MIN_STAKE).replace('.00', '') }}</span>
          <div class="amt mono">{{ formatMinor(stake) }}</div>
        </div>
        <button class="rnd" :disabled="busy || stake <= MIN_STAKE" @click="bump(-1)">−</button>
        <button class="rnd stack" :disabled="busy" @click="double">⧉</button>
        <button class="rnd" :disabled="busy" @click="bump(1)">+</button>

        <button class="auto" :disabled="busy" title="Repeat last roll" @click="roll('under')">
          ⟳
        </button>

        <button class="side under" :disabled="busy" @click="roll('under')">
          <span class="arw">⌄</span>
          <span class="num mono">{{ formatRoll(underTarget) }}</span>
        </button>
        <button class="side over" :disabled="busy" @click="roll('over')">
          <span class="arw">⌃</span>
          <span class="num mono">{{ formatRoll(overTarget) }}</span>
        </button>
      </footer>
    </div>

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped lang="scss">
.dice-app {
  min-height: 100vh;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
}

.frame {
  width: 100%;
  max-width: 1000px;
  background: linear-gradient(180deg, #7b3fd4 0%, #6b31c4 40%, #5d27b4 100%);
  border-radius: 18px;
  border: 3px solid #3f1a80;
  padding: 12px;
  color: #fff;
}

/* --- header -------------------------------------------------------------- */
.top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.exit {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #4b1f9c;
  border: 1px solid #8a5be0;
  color: #fff;
  font-size: 18px;
  line-height: 1;
  flex: 0 0 auto;

  &:hover {
    background: #5c25b0;
  }
}

.game-pick {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-width: 170px;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: #4b1f9c;
  border: 1px solid #8a5be0;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.howto {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 18px;
  border-radius: 999px;
  background: #f5a623;
  color: #4a2c00;
  font-size: 13px;
  font-weight: 700;

  .q {
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: #4a2c00;
    color: #f5a623;
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.bal {
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 4px;

  strong {
    font-size: 15px;
    font-weight: 700;
  }

  .cur {
    font-size: 11px;
    opacity: 0.75;
  }
}

.burger {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #4b1f9c;
  border: 1px solid #8a5be0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;

  i {
    width: 13px;
    height: 2px;
    background: #fff;
    border-radius: 2px;
  }
}

/* --- history bar --------------------------------------------------------- */
.hist-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 6px 0 12px;
  border-radius: 999px;
  background: #5a24ae;
  margin-bottom: 12px;
}

.hist-items {
  flex: 1;
  display: flex;
  gap: 6px;
  overflow: hidden;
}

.hist-chip {
  flex: 0 0 auto;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;

  &.w {
    background: #3ddc97;
    color: #08301f;
  }
  &.l {
    background: #b3204a;
    color: #fff;
  }
}

.fair-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: #4b1f9c;
  border: 1px solid #8a5be0;
  color: #fff;
  font-size: 11px;

  .shield {
    color: #3ddc97;
    font-weight: 800;
  }
}

/* --- stage --------------------------------------------------------------- */
.stage {
  background: #5c25b0;
  border: 1px solid #8a5be0;
  border-radius: 12px;
  padding: 18px 14px 12px;
  margin-bottom: 12px;
}

.big {
  text-align: center;
  font-size: 58px;
  font-weight: 800;
  line-height: 1;
  margin-bottom: 18px;
  font-variant-numeric: tabular-nums;
  transition: color 0.2s ease;

  &.won {
    color: #3ddc97;
  }
  &.lost {
    color: #ff5f7a;
  }
}

.ticks {
  display: flex;
  justify-content: space-between;
  padding: 0 2px 4px;

  span {
    width: 1px;
    height: 7px;
    background: rgba(255, 255, 255, 0.4);
  }
}

.track {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px 0;
  cursor: pointer;
  touch-action: none;
  user-select: none;
}

.band {
  display: flex;
  height: 34px;
  border-radius: 3px;
  overflow: hidden;
}

.seg {
  height: 100%;
  background-size: 6px 100%;
  background-repeat: repeat-x;

  &.red {
    background-image: linear-gradient(90deg, #b3204a 0 4px, #8d1a3c 4px 6px);
  }
  &.blue {
    background-image: linear-gradient(90deg, #35c8f0 0 4px, #2aa5c6 4px 6px);
  }
  &.green {
    background-image: linear-gradient(90deg, #6ee7b0 0 4px, #57c795 4px 6px);
  }
}

.knob {
  position: absolute;
  top: 50%;
  width: 30px;
  height: 30px;
  margin-left: -15px;
  margin-top: -15px;
  border-radius: 50%;
  background: #f5a623;
  border: 3px solid #7b3fd4;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  z-index: 3;

  /* Glides along the rollers on a roll; snaps instantly while dragging. */
  transition:
    left 0.6s cubic-bezier(0.22, 0.7, 0.25, 1),
    box-shadow 0.25s ease,
    border-color 0.25s ease;

  &::after {
    content: '';
    position: absolute;
    inset: 9px;
    border-radius: 50%;
    background: #3a1a00;
    transition: transform 0.6s cubic-bezier(0.22, 0.7, 0.25, 1);
  }

  &.drag {
    transition: box-shadow 0.25s ease;
    transform: scale(1.12);
  }

  /* The dark pupil spins so the knob reads as a ball rolling, not sliding. */
  &.rolling::after {
    animation: spin 0.6s cubic-bezier(0.22, 0.7, 0.25, 1);
  }

  &.won {
    border-color: #3ddc97;
    box-shadow:
      0 2px 10px rgba(0, 0, 0, 0.4),
      0 0 12px rgba(61, 220, 151, 0.7);
  }

  &.lost {
    border-color: #ff5f7a;
    box-shadow:
      0 2px 10px rgba(0, 0, 0, 0.4),
      0 0 12px rgba(255, 95, 122, 0.7);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(720deg);
  }
}

.scale {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  opacity: 0.65;
}

/* --- payout -------------------------------------------------------------- */
.payout {
  background: #4b1f9c;
  border: 1px solid #8a5be0;
  border-radius: 12px;
  padding: 12px 16px;
  margin: 0 auto 12px;
  max-width: 760px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px 20px;
  align-items: center;
}

.pay-left {
  text-align: center;
}

.cap {
  font-size: 11px;
  opacity: 0.75;
}

.pay-val {
  margin-top: 3px;
  padding: 6px 18px;
  border-radius: 8px;
  background: #3d1580;
  font-size: 17px;
  font-weight: 700;
}

.pay-slider input {
  width: 100%;
  accent-color: #f5a623;
}

.pay-foot {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);

  strong {
    display: block;
    font-size: 14px;
  }

  .chance {
    text-align: right;

    .cap {
      margin-right: 6px;
    }

    strong {
      display: inline;
      font-size: 15px;
    }
  }
}

/* --- bet bar ------------------------------------------------------------- */
.betbar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #4b1f9c;
  border: 1px solid #8a5be0;
  border-radius: 12px;
  padding: 10px 12px;
}

.amount {
  min-width: 130px;
  text-align: center;
  padding: 4px 12px;
  border-radius: 8px;
  background: #3d1580;

  .amt {
    font-size: 16px;
    font-weight: 700;
  }
}

.rnd {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #5c25b0;
  border: 1px solid #8a5be0;
  color: #fff;
  font-size: 17px;
  flex: 0 0 auto;

  &:disabled {
    opacity: 0.5;
  }
}

.auto {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #1e6fd9;
  color: #fff;
  font-size: 19px;
  margin-left: auto;
  flex: 0 0 auto;

  &:disabled {
    opacity: 0.5;
  }
}

.side {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 108px;
  height: 52px;
  border-radius: 10px;
  color: #fff;
  font-weight: 800;
  flex: 0 0 auto;

  .arw {
    font-size: 15px;
    line-height: 1;
  }

  .num {
    font-size: 16px;
  }

  &:disabled {
    opacity: 0.6;
  }
}

.under {
  background: linear-gradient(180deg, #3ddc97, #22b077);
}

.over {
  background: linear-gradient(180deg, #35c8f0, #1e9ec6);
}

/* --- responsive ---------------------------------------------------------- */
@media (max-width: 720px) {
  .top {
    flex-wrap: wrap;
  }

  .game-pick {
    min-width: 120px;
  }

  .big {
    font-size: 40px;
  }

  .betbar {
    flex-wrap: wrap;
    justify-content: center;
  }

  .auto {
    margin-left: 0;
  }

  .payout {
    grid-template-columns: 1fr;
  }
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  background: rgba(30, 10, 60, 0.97);
  border: 1px solid #8a5be0;
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 13px;
  z-index: 200;
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
