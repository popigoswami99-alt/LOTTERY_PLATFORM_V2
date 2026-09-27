<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatMinor, formatX100, multiplierAtX100 } from '@lp/shared';
import { useCrashStore } from '@/stores/crash';
import { useAuthStore } from '@/stores/auth';
import AviatorBetPanel from '@/components/AviatorBetPanel.vue';

/**
 * Aviator-style crash UI.
 *
 * Presentation only — the round loop, crash point, fairness commitment and
 * settlement are exactly as before. Two bet panels, a live all-bets list, the
 * multiplier history strip and the flight curve all read from the same state
 * the previous layout used.
 */

const crash = useCrashStore();
const auth = useAuthStore();
const router = useRouter();

function exit() {
  router.push({ name: 'home' });
}

const tab = ref<'all' | 'mine' | 'top'>('all');
const toast = ref('');
const showRoundId = ref(false);

const multiplierLabel = computed(() => formatX100(crash.multiplierX100));

/** History chips are tinted by size, exactly as the strip does. */
function chipClass(x100: number): string {
  if (x100 >= 1000) return 'c-pink';
  if (x100 >= 200) return 'c-purple';
  return 'c-blue';
}

const listRows = computed(() => {
  if (tab.value === 'mine') {
    return crash.myBets.slice(0, 40).map((b) => ({
      id: b.id,
      name: auth.user?.nickname ?? 'You',
      stake: b.stake,
      cashedOutX100: b.cashedOutX100,
      payout: b.payout,
      status: b.status,
    }));
  }
  if (tab.value === 'top') {
    return [...crash.roundBets].sort((a, b) => Number(BigInt(b.payout) - BigInt(a.payout)));
  }
  return crash.roundBets;
});

// --- Flight curve ----------------------------------------------------------
const W = 700;
const H = 420;

const curve = computed(() => {
  if (!crash.isRunning && !crash.isCrashed) return { line: '', area: '', x: 0, y: H };
  const top = Math.max(crash.multiplierX100, 110);
  const elapsed = Math.max(300, timeFor(top));

  const pts: string[] = [];
  let lastX = 0;
  let lastY = H;
  const STEPS = 60;
  for (let i = 0; i <= STEPS; i += 1) {
    const t = (elapsed * i) / STEPS;
    const m = multiplierAtX100(t);
    const x = (i / STEPS) * W * 0.86;
    const y = H - (Math.log(m / 100) / Math.max(Math.log(top / 100), 0.0001)) * (H * 0.78);
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    lastX = x;
    lastY = y;
  }
  const line = pts.join(' ');
  return { line, area: `${line} L${lastX.toFixed(1)},${H} L0,${H} Z`, x: lastX, y: lastY };
});

function timeFor(x100: number): number {
  if (x100 <= 100) return 0;
  return (Math.log(x100 / 100) / (Math.LN2 / 6)) * 1000;
}

let toastTimer: number | undefined;
function notify(msg: string) {
  toast.value = msg;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2400);
}

onMounted(async () => {
  await crash.loadAll();
  crash.connect();
});

onUnmounted(() => {
  crash.disconnect();
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="aviator">
    <!-- Header -->
    <header class="top">
      <button class="exit" title="Exit game" @click="exit">←</button>
      <div class="brand">
        <span class="mark">Skyway</span>
      </div>
      <button class="howto">
        <span class="q">?</span>
        How to play?
      </button>
      <div class="bal">
        <strong class="mono">{{ formatMinor(auth.balance) }}</strong>
        <span class="cur">INR</span>
      </div>
      <button class="burger"><i /><i /><i /></button>
    </header>

    <div class="layout">
      <!-- Left: bets list -->
      <aside class="side">
        <nav class="tabs">
          <button :class="{ on: tab === 'all' }" @click="tab = 'all'">All Bets</button>
          <button :class="{ on: tab === 'mine' }" @click="tab = 'mine'">My Bets</button>
          <button :class="{ on: tab === 'top' }" @click="tab = 'top'">Top</button>
        </nav>

        <div class="count">
          <span>ALL BETS</span>
          <strong>{{ crash.roundBets.length }}</strong>
        </div>

        <div class="thead">
          <span>User</span>
          <span>Bet INR</span>
          <span>X</span>
          <span>Cash out INR</span>
        </div>

        <div class="rows">
          <div
            v-for="r in listRows"
            :key="r.id"
            class="row"
            :class="{ won: r.cashedOutX100 !== null }"
          >
            <span class="user">
              <span class="avatar" />
              {{ r.name }}
            </span>
            <span class="mono">{{ formatMinor(r.stake) }}</span>
            <span>
              <span v-if="r.cashedOutX100" class="xchip">{{ formatX100(r.cashedOutX100) }}x</span>
            </span>
            <span class="mono cash">
              {{ r.cashedOutX100 ? formatMinor(r.payout) : '' }}
            </span>
          </div>
          <p v-if="!listRows.length" class="empty">No bets on this round yet.</p>
        </div>

        <div class="fair">
          <span class="tick">✓</span> This game is <b>Provably Fair</b>
        </div>
      </aside>

      <!-- Right: game -->
      <section class="main">
        <div class="strip">
          <span
            v-for="h in crash.history"
            :key="h.roundNo"
            class="chip"
            :class="chipClass(h.crashPointX100)"
          >
            {{ formatX100(h.crashPointX100) }}x
          </span>
          <span v-if="!crash.history.length" class="chip c-blue">—</span>
        </div>

        <div class="meta">
          <button class="roundid" @click="showRoundId = !showRoundId">
            Round ID: {{ crash.roundNo || '—' }}
            <span class="caret">▾</span>
          </button>
          <span class="ping">Ping:{{ crash.pingMs }}ms</span>
        </div>

        <div v-if="showRoundId" class="commitment mono">
          Commitment {{ crash.serverSeedHash || '—' }}
          <template v-if="crash.serverSeed"> · seed {{ crash.serverSeed.slice(0, 32) }}…</template>
        </div>

        <!-- Canvas -->
        <div class="canvas">
          <div class="rays" />

          <svg class="flight" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
            <path v-if="curve.area" :d="curve.area" class="area" />
            <path v-if="curve.line" :d="curve.line" class="line" />
          </svg>

          <div v-if="curve.line && crash.isRunning" class="plane" :style="{ left: `${(curve.x / W) * 100}%`, top: `${(curve.y / H) * 100}%` }">
            ✈
          </div>

          <div class="overlay">
            <template v-if="crash.isWaiting">
              <span class="waiting-label">WAITING FOR NEXT ROUND</span>
              <div class="loader">
                <div class="fill" :style="{ width: `${Math.min(100, (1 - crash.waitSecondsLeft / 7) * 100)}%` }" />
              </div>
            </template>

            <template v-else-if="crash.isCrashed">
              <span class="flew">FLEW AWAY!</span>
              <div class="mult bust mono">{{ multiplierLabel }}x</div>
            </template>

            <template v-else>
              <div class="mult mono">{{ multiplierLabel }}x</div>
            </template>
          </div>
        </div>

        <!-- Two bet panels -->
        <div class="panels">
          <AviatorBetPanel :slot="1" @notify="notify" />
          <AviatorBetPanel :slot="2" @notify="notify" />
        </div>
      </section>
    </div>

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped lang="scss">
/*
 * Desktop-first layout: the client fills the viewport, the board takes the
 * space left over after the header and bet panels, and the bets list scrolls
 * inside its own column rather than growing the page.
 */
.aviator {
  background: #0e0e0e;
  height: 100vh;
  display: flex;
  flex-direction: column;
  color: #e9e9e9;
  font-size: 13px;
  overflow: hidden;
}

/* --- header -------------------------------------------------------------- */
.top {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 18px;
  background: #1b1b1b;
  border-bottom: 1px solid #262626;
}

.exit {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #2c2c2c;
  color: #d9d9d9;
  font-size: 17px;
  line-height: 1;
  flex: 0 0 auto;

  &:hover {
    background: #3a3a3a;
    color: #fff;
  }
}

.mark {
  font-size: 22px;
  font-weight: 800;
  font-style: italic;
  color: #e50539;
  letter-spacing: -0.5px;
}

.howto {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #f5a623;
  color: #f5a623;
  font-size: 12px;
  font-weight: 600;

  .q {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    border: 1px solid #f5a623;
    font-size: 10px;
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
    color: #4bbd3f;
    font-weight: 800;
  }

  .cur {
    font-size: 11px;
    color: #7d7d7d;
  }
}

.burger {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px;

  i {
    width: 16px;
    height: 2px;
    background: #9a9a9a;
    border-radius: 2px;
  }
}

/* --- layout -------------------------------------------------------------- */
.layout {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 10px;
  padding: 10px;
  width: 100%;
  max-width: 1680px;
  margin: 0 auto;
}

/* --- side ---------------------------------------------------------------- */
.side {
  background: #1b1b1b;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tabs {
  display: flex;
  margin: 8px;
  background: #141414;
  border-radius: 999px;
  padding: 2px;

  button {
    flex: 1;
    height: 26px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: #9a9a9a;

    &.on {
      background: #2c2c2c;
      color: #fff;
    }
  }
}

.count {
  padding: 4px 12px 8px;
  display: flex;
  flex-direction: column;

  span {
    font-size: 11px;
    color: #9a9a9a;
  }

  strong {
    font-size: 15px;
  }
}

.thead {
  display: grid;
  grid-template-columns: 1.3fr 0.9fr 0.5fr 1fr;
  gap: 4px;
  padding: 6px 12px;
  font-size: 10px;
  color: #7d7d7d;
  border-bottom: 1px solid #262626;
}

.rows {
  overflow-y: auto;
  flex: 1;
}

.row {
  display: grid;
  grid-template-columns: 1.3fr 0.9fr 0.5fr 1fr;
  gap: 4px;
  align-items: center;
  padding: 7px 12px;
  border-bottom: 1px solid #212121;
  font-size: 12px;

  &.won {
    background: rgba(75, 189, 63, 0.09);
    box-shadow: inset 0 0 0 1px rgba(75, 189, 63, 0.5);
    border-radius: 6px;
  }
}

.user {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #bdbdbd;
  overflow: hidden;
  white-space: nowrap;
}

.avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: linear-gradient(135deg, #4a4a6a, #2a2a3a);
}

.xchip {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  background: #2c2c2c;
  color: #d6a4ff;
  font-size: 10px;
  font-weight: 700;
}

.cash {
  text-align: right;
  color: #4bbd3f;
  font-weight: 700;
}

.empty {
  padding: 20px 12px;
  text-align: center;
  color: #6d6d6d;
  font-size: 12px;
}

.fair {
  padding: 8px 12px;
  border-top: 1px solid #262626;
  font-size: 11px;
  color: #9a9a9a;

  .tick {
    color: #4bbd3f;
    font-weight: 800;
  }

  b {
    color: #d9d9d9;
  }
}

/* --- main ---------------------------------------------------------------- */
.main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 6px 4px;

  &::-webkit-scrollbar {
    display: none;
  }
}

.chip {
  flex: 0 0 auto;
  padding: 3px 10px;
  border-radius: 999px;
  background: #1b1b1b;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.c-blue {
  color: #34b3f1;
}
.c-purple {
  color: #913ef8;
}
.c-pink {
  color: #c017b4;
}

.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.roundid {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #9a9a9a;

  .caret {
    background: #2c2c2c;
    border-radius: 4px;
    padding: 0 5px;
  }
}

.ping {
  font-size: 12px;
  color: #9a9a9a;
}

.commitment {
  padding: 6px 10px;
  background: #151515;
  border-radius: 8px;
  font-size: 10px;
  color: #7d7d7d;
  word-break: break-all;
}

/* --- canvas -------------------------------------------------------------- */
.canvas {
  position: relative;
  /* Takes whatever the header, strip and bet panels leave behind. */
  flex: 1 1 auto;
  min-height: 260px;
  border-radius: 18px;
  overflow: hidden;
  background: #0b0b0b;
}

.rays {
  position: absolute;
  inset: 0;
  background: repeating-conic-gradient(
    from 0deg at 12% 92%,
    #171717 0deg 6deg,
    #101010 6deg 12deg
  );
}

.flight {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.line {
  fill: none;
  stroke: #e50539;
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
}

.area {
  fill: rgba(229, 5, 57, 0.18);
  stroke: none;
}

.plane {
  position: absolute;
  transform: translate(-50%, -60%);
  font-size: 26px;
  color: #e50539;
  pointer-events: none;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
}

.mult {
  font-size: 78px;
  font-weight: 800;
  line-height: 1;
  color: #fff;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 4px 22px rgba(0, 0, 0, 0.6);

  &.bust {
    color: #e50539;
  }
}

.flew {
  font-size: 42px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 1px;
}

.waiting-label {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #d9d9d9;
}

.loader {
  width: 240px;
  height: 5px;
  border-radius: 999px;
  background: #2c2c2c;
  overflow: hidden;

  .fill {
    height: 100%;
    background: #e50539;
    transition: width 0.2s linear;
  }
}

/* --- panels -------------------------------------------------------------- */
.panels {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
}

/* --- responsive ---------------------------------------------------------- */
@media (max-width: 1000px) {
  .aviator {
    height: auto;
    min-height: 100vh;
    overflow: visible;
  }

  .layout {
    grid-template-columns: 1fr;
  }

  .side {
    order: 2;
    max-height: 340px;
  }

  .canvas {
    height: 300px;
    flex: 0 0 auto;
  }

  .mult {
    font-size: 54px;
  }

  .flew {
    font-size: 30px;
  }

  .panels {
    grid-template-columns: 1fr;
  }
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  background: rgba(20, 20, 20, 0.97);
  border: 1px solid #333;
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 13px;
  z-index: 200;
}


/* LOTTERY_PLATFORM_RESPONSIVE_FIX_V2 */

/* Prevent flex/grid children from creating an invisible desktop-width layout. */
.aviator,
.layout,
.main,
.panels,
.side,
.canvas {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.main {
  overflow: hidden;
}

.panels {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.panels > * {
  min-width: 0 !important;
  max-width: 100% !important;
  width: 100% !important;
  box-sizing: border-box;
}

/* AviatorBetPanel is a child component, so its scoped CSS needs :deep(). */
:deep(.panel) {
  width: 100%;
  max-width: 100%;
  min-width: 0 !important;
  box-sizing: border-box;
  overflow: hidden;
}

:deep(.body) {
  width: 100%;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
}

:deep(.left),
:deep(.right),
:deep(.stepper),
:deep(.quick),
:deep(.act),
:deep(.auto-row) {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

:deep(.val),
:deep(.amt),
:deep(.lbl) {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1000px) {
  .aviator {
    width: 100%;
    max-width: 100vw;
  }

  .layout {
    width: 100%;
    max-width: 100%;
    padding: 8px;
  }

  .main {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .panels {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
  }

  .panels > * {
    width: 100% !important;
    min-width: 0 !important;
  }

  :deep(.panel) {
    width: 100%;
    min-width: 0 !important;
  }
}

@media (max-width: 600px) {
  .aviator {
    width: 100%;
    max-width: 100vw;
    overflow-x: hidden;
  }

  .top {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    gap: 8px;
    padding: 8px 10px;
  }

  .brand {
    min-width: 0;
    overflow: hidden;
  }

  .mark {
    font-size: 18px;
    white-space: nowrap;
  }

  .howto {
    flex: 0 0 auto;
    max-width: 110px;
    overflow: hidden;
  }

  .bal {
    min-width: 0;
  }

  .layout {
    padding: 6px;
    gap: 6px;
  }

  .canvas {
    width: 100%;
    min-width: 0;
    height: 300px;
  }

  .panels {
    width: 100%;
    max-width: 100%;
    gap: 8px;
  }

  :deep(.panel) {
    width: 100%;
    max-width: 100%;
    min-width: 0 !important;
    padding: 8px;
  }

  :deep(.body) {
    width: 100%;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  :deep(.mode) {
    width: min(160px, 100%);
    max-width: 100%;
  }

  :deep(.quick) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  :deep(.act) {
    min-width: 0;
    width: 100%;
    min-height: 70px;
  }

  :deep(.auto-row) {
    flex-wrap: wrap;
    width: 100%;
  }

  :deep(.auto-in) {
    margin-left: auto;
    max-width: 70px;
  }
}

@media (max-width: 420px) {
  .top {
    gap: 5px;
    padding-left: 7px;
    padding-right: 7px;
  }

  .exit {
    width: 30px;
    height: 30px;
  }

  .mark {
    font-size: 16px;
  }

  .howto {
    padding: 0 7px;
    font-size: 10px;
  }

  .canvas {
    height: 260px;
  }

  :deep(.body) {
    grid-template-columns: minmax(0, 1fr);
  }

  :deep(.act) {
    min-height: 64px;
  }
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
