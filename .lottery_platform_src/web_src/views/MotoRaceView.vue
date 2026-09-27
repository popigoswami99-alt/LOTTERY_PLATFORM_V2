<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MOTORACE_RACERS, formatMinor, formatX100, motoRaceMultiplierX100 } from '@lp/shared';
import { useInstantStore } from '@/stores/instant';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';
import FairnessPanel from '@/components/FairnessPanel.vue';

/**
 * MotoRace — pick one of 8 racers before the start. Every racer is equally
 * likely (the shared module prices them all at the same true odds), so this
 * view's only job is to lay out the pick and animate the result.
 *
 * The server decides the winner BEFORE any animation runs — this is decorative,
 * not the source of truth. To keep it honest-looking rather than obviously
 * scripted, every lane races to the finish line at once; the winning lane is
 * simply given the shortest (and always-shortest) transition duration, while
 * every other lane gets an independently randomized slower one. The result is
 * revealed only once the slowest lane has actually finished moving.
 */

const instant = useInstantStore();
const auth = useAuthStore();
const router = useRouter();

const LANES = Array.from({ length: MOTORACE_RACERS }, (_, i) => i);
const LANE_COLORS = [
  '#ff6b6b', '#f5a623', '#38c48f', '#4aa3ff',
  '#9b6bff', '#ec6a9c', '#2fbfae', '#ff9142',
];

const stake = ref(10_000n);
const pick = ref<number | null>(null);
const busy = ref(false);
const toast = ref('');
const winnerLane = ref<number | null>(null);
const finishLine = 90; // percent across the track

const progress = ref<number[]>(LANES.map(() => 0));
const durations = ref<number[]>(LANES.map(() => 2.2));
const noTransition = ref(true); // starts true so the initial layout has no animation

const CHIPS = [1_000n, 10_000n, 50_000n, 100_000n];
const flatOdds = formatX100(motoRaceMultiplierX100());

function selectLane(i: number) {
  if (busy.value) return;
  pick.value = i;
}

async function race() {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/motorace' } });
    return;
  }
  if (pick.value === null) {
    flash('Pick a racer first');
    return;
  }
  busy.value = true;
  winnerLane.value = null;

  // Snap every lane back to the start line with no transition, then let a
  // beat pass so the browser actually applies it before we animate forward.
  // A short setTimeout is used rather than requestAnimationFrame: rAF is tied
  // to the paint/compositor loop, which browsers throttle or fully suspend
  // for backgrounded or power-saving tabs — a player who switches apps
  // mid-race must never get stuck on "Racing…" forever with their stake
  // already gone.
  noTransition.value = true;
  progress.value = LANES.map(() => 0);
  await nextTick();
  await new Promise((res) => setTimeout(res, 30));
  noTransition.value = false;

  try {
    const r = await instant.raceMoto(stake.value.toString(), pick.value);

    // The winner is fixed by the server already — these durations only decide
    // how the finish LOOKS, never who wins. Winner is always fastest.
    const dur = LANES.map(() => 2.0 + Math.random() * 0.6);
    dur[r.winner] = 1.55 + Math.random() * 0.15;
    durations.value = dur;

    await nextTick();
    progress.value = LANES.map(() => finishLine);

    const settle = Math.max(...dur) * 1000 + 300;
    await new Promise((res) => setTimeout(res, settle));

    winnerLane.value = r.winner;
    const won = BigInt(r.payout) > 0n;
    flash(
      won
        ? `🏁 Racer ${r.winner + 1} wins — ₹${formatMinor(r.payout)}`
        : `🏁 Racer ${r.winner + 1} wins — you picked ${r.pick + 1}`,
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
  toastTimer = window.setTimeout(() => (toast.value = ''), 2800);
}

onMounted(async () => {
  if (auth.isLoggedIn) {
    await instant.loadSeed();
    await instant.loadHistory('MOTORACE');
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

    <section class="track-card">
      <div class="track-head">
        <strong>Pick your racer</strong>
        <span class="odds-tag">pays {{ flatOdds }}x</span>
      </div>

      <div class="track">
        <div
          v-for="i in LANES"
          :key="i"
          class="lane"
          :class="{ picked: pick === i, winner: winnerLane === i, disabled: busy }"
          @click="selectLane(i)"
        >
          <span class="lane-no" :style="{ background: LANE_COLORS[i] }">{{ i + 1 }}</span>
          <div class="strip">
            <span
              class="bike"
              :class="{ 'no-transition': noTransition }"
              :style="{ left: progress[i] + '%', transitionDuration: durations[i] + 's' }"
            >🏍️</span>
            <span class="flag">🏁</span>
          </div>
        </div>
      </div>
    </section>

    <section class="card ctrl">
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

      <button class="btn btn-primary" :disabled="busy || pick === null" @click="race">
        {{ busy ? 'Racing…' : pick === null ? 'Pick a racer above' : `Race ₹${formatMinor(stake)} on #${pick + 1}` }}
      </button>

      <p class="note faint">
        Every racer has the same 1-in-8 chance — no favourite, no long shot. All eight pay the
        identical 98% RTP.
      </p>
    </section>

    <FairnessPanel v-if="auth.isLoggedIn" />

    <section v-if="instant.history.length" class="hist">
      <strong class="hd">Recent races</strong>
      <div v-for="h in instant.history" :key="h.id" class="row">
        <span class="faint tiny">picked #{{ ((h.params as any).pick ?? 0) + 1 }}</span>
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

.track-card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 12px;
  box-shadow: var(--shadow-card);
}

.track-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  strong { font-size: 14px; }
}
.odds-tag {
  font-size: 11px;
  font-weight: 800;
  color: #0c7a52;
  background: #e7f8f0;
  padding: 2px 9px;
  border-radius: 999px;
}

.track { display: flex; flex-direction: column; gap: 6px; }

.lane {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 10px;
  border: 2px solid transparent;
  cursor: pointer;

  &.picked { border-color: var(--primary); background: var(--surface-2); }
  &.winner { background: linear-gradient(90deg, #fff3d6, transparent); }
  &.disabled { cursor: default; }
}

.lane-no {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  font-weight: 900;
  font-family: var(--font-num);
}

.strip {
  position: relative;
  flex: 1;
  height: 28px;
  border-radius: 8px;
  background: var(--surface-2);
  overflow: hidden;
}

.bike {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translate(0, -50%);
  font-size: 18px;
  line-height: 1;
  transition-property: left;
  transition-timing-function: cubic-bezier(0.22, 0.68, 0.36, 1);

  &.no-transition { transition-duration: 0s !important; }
}

.flag {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  opacity: 0.75;
}

.ctrl { display: flex; flex-direction: column; gap: 10px; }
.chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.chip {
  height: 34px; border-radius: 8px; background: var(--surface-2); color: var(--text-dim);
  font-size: 12px; font-weight: 700;
  &.on { background: linear-gradient(135deg, var(--accent-from), var(--accent-to)); color: #fff; }
  &:disabled { opacity: 0.5; }
}
.note { margin: 0; font-size: 10px; line-height: 1.6; }

.hist { background: var(--surface); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow-card); }
.hd { display: block; margin-bottom: 6px; font-size: 13px; }
.row {
  display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 10px;
  padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 12px; font-weight: 600;
  &:last-child { border-bottom: 0; }
}
.tiny { font-size: 10px; }

.toast {
  position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%);
  background: rgba(40, 16, 28, 0.95); color: #fff;
  padding: 9px 16px; border-radius: 999px; font-size: 13px; z-index: 200; max-width: 90%; text-align: center;
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
