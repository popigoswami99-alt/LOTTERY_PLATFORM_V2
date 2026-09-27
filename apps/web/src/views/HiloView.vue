<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  HILO_SUIT_SYMBOLS,
  cardLabel,
  formatMinor,
  formatX100,
  hiloStepMultiplierX100,
  hiloWinCount,
  isTrivialCall,
  type HiloCall,
} from '@lp/shared';
import { useInstantStore } from '@/stores/instant';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';
import FairnessPanel from '@/components/FairnessPanel.vue';

const instant = useInstantStore();
const auth = useAuthStore();
const router = useRouter();

const stake = ref(10_000n);
const busy = ref(false);
const toast = ref('');
const lastDrawn = ref<{ rank: number; suit: number } | null>(null);
const lastSurvived = ref<boolean | null>(null);

const CHIPS = [1_000n, 10_000n, 50_000n, 100_000n];

const game = computed(() => instant.hilo);
const playing = computed(() => game.value !== null);
const shownRank = computed(() => game.value?.current.rank ?? 0);

/** Odds are shown per call, straight from the shared rules. */
function odds(call: HiloCall) {
  const r = shownRank.value;
  return {
    chance: ((hiloWinCount(r, call) / 13) * 100).toFixed(1),
    mult: formatX100(hiloStepMultiplierX100(r, call)),
    trivial: isTrivialCall(r, call),
  };
}

const cashValue = computed(() => {
  if (!game.value) return 0n;
  return (BigInt(game.value.stake) * 98n * BigInt(game.value.multiplierX100)) / (100n * 100n);
});

function isRed(suit: number) {
  return suit === 1 || suit === 2;
}

async function start() {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/hilo' } });
    return;
  }
  busy.value = true;
  lastDrawn.value = null;
  lastSurvived.value = null;
  try {
    await instant.startHilo(stake.value.toString());
  } catch (err) {
    flash(apiError(err));
  } finally {
    busy.value = false;
  }
}

async function call(c: HiloCall) {
  if (!playing.value || busy.value) return;
  busy.value = true;
  try {
    const r = await instant.callHilo(c);
    lastDrawn.value = r.drawn;
    lastSurvived.value = r.survived;
    if (!r.survived) flash(`${cardLabel(r.drawn)} — wrong call`);
  } catch (err) {
    flash(apiError(err));
  } finally {
    busy.value = false;
  }
}

async function cashout() {
  busy.value = true;
  try {
    const r = await instant.cashoutHilo();
    flash(`Cashed out at ${formatX100(r.multiplierX100)}x — ₹${formatMinor(r.payout)}`);
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
    await Promise.all([instant.loadSeed(), instant.loadHilo(), instant.loadHistory('HILO')]);
  }
});

// Only the cached view is cleared — an unfinished hand lives on the server and
// is restored by loadHilo() on the next visit.
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
        <div>
          <span class="cap">Multiplier</span>
          <strong class="mono big">{{ formatX100(game?.multiplierX100 ?? 100) }}x</strong>
        </div>
        <div v-if="playing" class="right">
          <span class="cap">Calls made</span>
          <strong class="mono">{{ game?.steps.length ?? 0 }}</strong>
        </div>
      </div>

      <!-- Current card -->
      <div class="card-wrap">
        <div
          v-if="game"
          class="playing-card"
          :class="{ red: isRed(game.current.suit), bust: lastSurvived === false }"
        >
          <span class="rank">{{ cardLabel(game.current).slice(0, -1) }}</span>
          <span class="suit">{{ HILO_SUIT_SYMBOLS[game.current.suit] }}</span>
        </div>
        <div v-else-if="lastDrawn" class="playing-card" :class="{ red: isRed(lastDrawn.suit), bust: true }">
          <span class="rank">{{ cardLabel(lastDrawn).slice(0, -1) }}</span>
          <span class="suit">{{ HILO_SUIT_SYMBOLS[lastDrawn.suit] }}</span>
        </div>
        <div v-else class="playing-card empty">?</div>
      </div>

      <!-- Trail of past draws -->
      <div v-if="game && game.steps.length" class="trail">
        <span
          v-for="(s, i) in game.steps.slice(-8)"
          :key="i"
          class="mini-card"
          :class="{ red: isRed(s.drawn.suit) }"
        >
          {{ cardLabel(s.drawn) }}
        </span>
      </div>
    </section>

    <section class="card ctrl">
      <template v-if="playing">
        <div class="calls">
          <button
            class="call up"
            :disabled="busy || odds('higher').trivial"
            @click="call('higher')"
          >
            <span class="arrow">▲</span>
            <span class="lbl">Higher or same</span>
            <small>{{ odds('higher').mult }}x · {{ odds('higher').chance }}%</small>
          </button>
          <button
            class="call down"
            :disabled="busy || odds('lower').trivial"
            @click="call('lower')"
          >
            <span class="arrow">▼</span>
            <span class="lbl">Lower or same</span>
            <small>{{ odds('lower').mult }}x · {{ odds('lower').chance }}%</small>
          </button>
        </div>

        <button
          class="btn cash"
          :disabled="busy || (game?.steps.length ?? 0) === 0"
          @click="cashout"
        >
          {{
            (game?.steps.length ?? 0) === 0
              ? 'Make a call first'
              : `Cash out ₹${formatMinor(cashValue)}`
          }}
        </button>
      </template>

      <template v-else>
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
        <button class="btn btn-primary" :disabled="busy" @click="start">
          {{ busy ? 'Dealing…' : `Play ₹${formatMinor(stake)}` }}
        </button>
        <p class="note faint">
          Ties count as a win for whichever side you called. A call that cannot lose is
          disabled — it would only cost you the rake.
        </p>
      </template>
    </section>

    <FairnessPanel v-if="auth.isLoggedIn" />

    <section v-if="instant.history.length" class="hist">
      <strong class="hd">Recent games</strong>
      <div v-for="h in instant.history" :key="h.id" class="row">
        <span class="faint tiny">{{ ((h.state as any)?.steps ?? []).length || '—' }} calls</span>
        <span class="mono">{{ formatX100(h.multiplierX100) }}x</span>
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
  background: radial-gradient(circle at 50% 0%, #1e2740, #131a29 75%);
  border-radius: var(--radius);
  padding: 14px;
}

.hdr {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.right {
  text-align: right;
}

.cap {
  display: block;
  font-size: 10px;
  color: var(--text-dim);
}

.big {
  font-size: 24px;
  font-weight: 800;
}

.card-wrap {
  display: flex;
  justify-content: center;
  padding: 6px 0 10px;
}

.playing-card {
  width: 92px;
  height: 128px;
  border-radius: 10px;
  background: #f7f9ff;
  color: #16203a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  transition: box-shadow 0.2s ease;

  &.red {
    color: #d92b2b;
  }

  &.bust {
    box-shadow: 0 0 0 3px var(--red);
  }

  &.empty {
    background: var(--surface-3);
    color: var(--text-faint);
    font-size: 34px;
    font-weight: 800;
    box-shadow: none;
  }

  .rank {
    font-size: 34px;
    font-weight: 800;
    line-height: 1;
  }

  .suit {
    font-size: 24px;
    line-height: 1;
  }
}

.trail {
  display: flex;
  gap: 4px;
  justify-content: center;
  flex-wrap: wrap;
}

.mini-card {
  padding: 2px 6px;
  border-radius: 4px;
  background: #eef2f9;
  color: #16203a;
  font-size: 10px;
  font-weight: 800;

  &.red {
    color: #d92b2b;
  }
}

.ctrl {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.calls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.call {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 6px;
  border-radius: var(--radius-sm);
  color: #fff;
  font-weight: 700;

  .arrow {
    font-size: 15px;
  }

  .lbl {
    font-size: 11px;
  }

  small {
    font-size: 10px;
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.4;
  }
}

.up {
  background: var(--green);
}
.down {
  background: var(--red);
}

.cash {
  background: linear-gradient(135deg, #f5a623, #e8453c);
  color: #fff;
  height: 46px;

  &:disabled {
    background: var(--surface-3);
    color: var(--text-faint);
  }
}

.note {
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
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
