<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { FIVED_POSITIONS, FIVED_ROOMS, formatMinor, type FiveDPos } from '@lp/shared';
import { useGameStore } from '@/stores/game';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';
import BetSheet from '@/components/BetSheet.vue';

/**
 * 5D — five digits A..E plus their sum. The generic game store drives the room,
 * countdown, results and settlement; this view only lays out 5D's own betting
 * surface. Odds and validation come from the shared rules module the server
 * settles with.
 */

const game = useGameStore();
const auth = useAuthStore();
const router = useRouter();

const pos = ref<FiveDPos>('A');
const tab = ref<'history' | 'mine'>('history');
const toast = ref('');
const submitting = ref(false);

const sheet = ref<{ open: boolean; betType: string; selection: string }>({
  open: false,
  betType: 'A_SIZE',
  selection: 'big',
});

const closed = computed(() => game.isLocked);

/** The most recent settled draw, as five digits + sum. */
const latest = computed(() => {
  const r = game.results[0];
  const data = r?.result as { digits?: number[]; sum?: number } | undefined;
  if (!data?.digits) return null;
  return { digits: data.digits, sum: data.sum ?? 0, periodNo: r.periodNo };
});

function openSheet(betType: string, selection: string) {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/fived' } });
    return;
  }
  if (closed.value) {
    flash('Betting is closed for this period');
    return;
  }
  sheet.value = { open: true, betType, selection };
}

async function confirmBet(payload: { unitAmount: string; multiplier: number }) {
  submitting.value = true;
  try {
    await game.placeBet({
      betType: sheet.value.betType,
      selection: sheet.value.selection,
      ...payload,
    });
    sheet.value.open = false;
    flash('Bet placed');
  } catch (err) {
    flash(apiError(err));
  } finally {
    submitting.value = false;
  }
}

let toastTimer: number | undefined;
function flash(msg: string) {
  toast.value = msg;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2200);
}

function digitTone(n: number) {
  return n >= 5 ? 'big' : 'small';
}

onMounted(async () => {
  if (!FIVED_ROOMS.some((r) => r.key === game.roomKey)) game.roomKey = '5D_1M';
  await game.loadAll();
  game.connect();
});

onUnmounted(() => {
  game.disconnect();
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page">
    <!-- Balance -->
    <section class="wallet">
      <div class="row between">
        <span class="dim">Wallet balance</span>
        <span class="dot" :class="{ live: game.connected }" />
      </div>
      <div class="amount mono">₹{{ formatMinor(auth.balance) }}</div>
    </section>

    <!-- Room tabs -->
    <nav class="rooms">
      <button
        v-for="r in FIVED_ROOMS"
        :key="r.key"
        class="room"
        :class="{ on: game.roomKey === r.key }"
        @click="game.switchRoom(r.key)"
      >
        <span class="t num">{{ r.intervalSec >= 60 ? r.intervalSec / 60 : r.intervalSec }}</span>
        <span class="u">{{ r.intervalSec >= 60 ? 'Min' : 'Sec' }}</span>
      </button>
    </nav>

    <!-- Countdown + latest draw -->
    <section class="hud">
      <div class="left">
        <span class="tiny faint">Period</span>
        <div class="period num">{{ game.periodNo || '—' }}</div>
        <div class="draw">
          <template v-if="latest">
            <span v-for="(d, i) in latest.digits" :key="i" class="ball" :class="digitTone(d)">{{ d }}</span>
            <span class="eq">=</span>
            <span class="sum num">{{ latest.sum }}</span>
          </template>
          <span v-else class="faint tiny">waiting for first draw…</span>
        </div>
      </div>
      <div class="right" :class="{ closing: closed }">
        <span class="tiny faint">{{ closed ? 'Closed' : 'Draw in' }}</span>
        <div class="clock num">{{ game.countdown.mm }}:{{ game.countdown.ss }}</div>
      </div>
    </section>

    <!-- Bet surface -->
    <section class="board">
      <div class="pos-tabs">
        <button
          v-for="p in FIVED_POSITIONS"
          :key="p"
          class="pos"
          :class="{ on: pos === p }"
          @click="pos = p"
        >
          {{ p }}
        </button>
      </div>

      <div class="opts">
        <button class="opt big" @click="openSheet(`${pos}_SIZE`, 'big')">
          Big <small>2x</small>
        </button>
        <button class="opt small" @click="openSheet(`${pos}_SIZE`, 'small')">
          Small <small>2x</small>
        </button>
        <button class="opt odd" @click="openSheet(`${pos}_PARITY`, 'odd')">
          Odd <small>2x</small>
        </button>
        <button class="opt even" @click="openSheet(`${pos}_PARITY`, 'even')">
          Even <small>2x</small>
        </button>
      </div>

      <div v-if="pos !== 'SUM'" class="nums">
        <button
          v-for="n in 10"
          :key="n"
          class="num-btn"
          @click="openSheet(`${pos}_NUMBER`, String(n - 1))"
        >
          {{ n - 1 }}
        </button>
      </div>
      <p class="hint faint">
        {{ pos === 'SUM' ? 'Sum of all five digits (0–45). Big is 23–45.' : `Position ${pos}: one digit 0–9. Big is 5–9. Exact number pays 9x.` }}
      </p>
    </section>

    <!-- History / my bets -->
    <section class="list">
      <div class="list-tabs">
        <button :class="{ on: tab === 'history' }" @click="tab = 'history'">Results</button>
        <button :class="{ on: tab === 'mine' }" @click="tab = 'mine'">My bets</button>
      </div>

      <template v-if="tab === 'history'">
        <div v-for="r in game.results" :key="r.periodNo" class="row res">
          <span class="tiny faint">{{ r.periodNo.slice(-6) }}</span>
          <span class="res-primary num">{{ r.summary.primary }}</span>
          <span class="tags">
            <span v-for="t in r.summary.tags" :key="t" class="tag">{{ t }}</span>
          </span>
        </div>
        <p v-if="!game.results.length" class="empty">No draws yet.</p>
      </template>

      <template v-else>
        <div v-for="b in game.myBets" :key="b.id" class="row mine">
          <div>
            <div class="bt">{{ b.betType.replace('_', ' ') }} · {{ b.selection }}</div>
            <div class="tiny faint">{{ b.periodNo.slice(-6) }} · {{ b.odds }}</div>
          </div>
          <span class="pill" :class="b.status.toLowerCase()">{{ b.status }}</span>
          <span :class="BigInt(b.payout) > 0n ? 'win' : 'loss'">
            {{ BigInt(b.payout) > 0n ? `+₹${formatMinor(b.payout)}` : `−₹${formatMinor(b.stake)}` }}
          </span>
        </div>
        <p v-if="!game.myBets.length" class="empty">You haven't bet this room yet.</p>
      </template>
    </section>

    <BetSheet
      :open="sheet.open"
      :bet-type="sheet.betType"
      :selection="sheet.selection"
      :submitting="submitting"
      :balance="auth.balance"
      @close="sheet.open = false"
      @confirm="confirmBet"
    />

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped lang="scss">
.page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }

.wallet {
  background: linear-gradient(135deg, var(--header-from), var(--header-to));
  border-radius: var(--radius); padding: 14px; color: #fff; box-shadow: var(--shadow-card);
  .dim { color: rgba(255, 255, 255, 0.85); }
  .amount { font-size: 24px; font-weight: 800; margin-top: 2px; }
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: #ffffff66; &.live { background: #7CFFB2; box-shadow: 0 0 0 3px #7cffb233; } }

.rooms { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.room {
  display: flex; flex-direction: column; align-items: center; padding: 8px 0; border-radius: 10px;
  background: var(--surface); box-shadow: var(--shadow-card); color: var(--text-dim);
  .t { font-size: 17px; font-weight: 800; }
  .u { font-size: 9px; }
  &.on { background: linear-gradient(135deg, var(--header-from), var(--header-to)); color: #fff; }
}

.hud {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  background: var(--surface); border-radius: var(--radius); padding: 12px 14px; box-shadow: var(--shadow-card);
  .period { font-size: 13px; font-weight: 700; }
  .draw { display: flex; align-items: center; gap: 5px; margin-top: 8px; }
  .eq { color: var(--text-faint); font-weight: 700; }
  .sum { font-size: 18px; font-weight: 800; color: var(--primary-deep); }
  .clock { font-size: 26px; font-weight: 800; color: var(--primary-deep); }
  .right { text-align: right; &.closing .clock { color: var(--red); } }
}
.ball {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%; font-weight: 800; font-size: 13px; color: #fff;
  font-family: var(--font-num);
  &.big { background: linear-gradient(135deg, #ff8f5a, #f5b301); }
  &.small { background: linear-gradient(135deg, #6aa4ff, #8f7bff); }
}

.board { background: var(--surface); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 10px; }
.pos-tabs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; }
.pos {
  height: 34px; border-radius: 8px; background: var(--surface-2); color: var(--text-dim); font-weight: 800; font-size: 13px;
  &.on { background: var(--primary); color: #fff; }
}
.opts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.opt {
  height: 46px; border-radius: 10px; color: #fff; font-weight: 800; font-size: 14px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  small { font-size: 9px; opacity: 0.85; font-weight: 700; }
  &.big { background: linear-gradient(135deg, #ff8f5a, #f5960b); }
  &.small { background: linear-gradient(135deg, #6aa4ff, #4f7bef); }
  &.odd { background: linear-gradient(135deg, #35c491, #17a672); }
  &.even { background: linear-gradient(135deg, #ec6a9c, #d6246e); }
}
.nums { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.num-btn {
  height: 42px; border-radius: 10px; background: var(--surface-2); color: var(--text);
  font-weight: 800; font-size: 16px; font-family: var(--font-num);
  &:active { transform: scale(0.96); }
}
.hint { margin: 0; font-size: 10px; line-height: 1.5; }

.list { background: var(--surface); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow-card); }
.list-tabs { display: flex; gap: 8px; margin-bottom: 8px; }
.list-tabs button {
  height: 30px; padding: 0 14px; border-radius: 999px; font-weight: 700; font-size: 12px; color: var(--text-dim); background: var(--surface-2);
  &.on { background: var(--primary); color: #fff; }
}
.row { display: grid; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 12px; &:last-child { border: 0; } }
.res { grid-template-columns: auto 1fr auto; }
.res-primary { font-weight: 800; letter-spacing: 1px; }
.tags { display: flex; gap: 4px; }
.tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: var(--surface-2); color: var(--text-dim); }
.mine { grid-template-columns: 1fr auto auto; }
.bt { font-weight: 700; text-transform: capitalize; }
.pill {
  font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 999px;
  &.pending { background: #fff3d6; color: #b3820b; }
  &.won { background: #e7f8f0; color: #0c7a52; }
  &.lost { background: var(--surface-3); color: var(--text-dim); }
  &.refunded { background: #eef; color: #55c; }
}
.empty { padding: 14px 0 4px; text-align: center; color: var(--text-faint); font-size: 12px; }
.tiny { font-size: 10px; }

.toast {
  position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%);
  background: rgba(40, 16, 28, 0.95); color: #fff; padding: 9px 16px; border-radius: 999px; font-size: 13px; z-index: 200;
}

/* LOTTERY_PLATFORM_GAME_UX_02 */
.game,.wingo,.k3,.fourd,.fived{
 width:100%;max-width:100%;min-width:0;box-sizing:border-box;
 overflow-x:hidden;
}
button,input,select{max-width:100%;box-sizing:border-box}
@media(max-width:768px){
 .game,.wingo,.k3,.fourd,.fived{width:100%;padding-left:6px;padding-right:6px}
 .bet,.bet-panel,.bet-sheet,.panel,.controls,.content,.main{
   width:100%;max-width:100%;min-width:0;box-sizing:border-box
 }
 .bet-grid,.number-grid,.options-grid,.quick-grid{
   grid-template-columns:repeat(2,minmax(0,1fr)) !important;
   min-width:0 !important;width:100% !important
 }
}
@media(max-width:420px){
 .number-grid,.options-grid,.quick-grid{
   grid-template-columns:repeat(2,minmax(0,1fr)) !important
 }
}

</style>


/* LOTTERY_PLATFORM_BLOCK_02_ADD_ONLY */

.lottery-bet-panel,
.lp-lottery-bet-panel,
.lottery-history,
.lp-history{
  width:100%;
  max-width:100%;
  min-width:0;
  box-sizing:border-box;
}

@media(max-width:768px){
  .wingo,
  .k3,
  .four-d,
  .five-d,
  .game-view,
  .page,
  .content,
  .layout{
    width:100%;
    max-width:100%;
    min-width:0;
    overflow-x:hidden;
  }

  .bet-panel,
  .bet-sheet,
  .history,
  .results,
  .game-panel{
    width:100%;
    max-width:100%;
    min-width:0;
    box-sizing:border-box;
  }
}

@media(min-width:769px){
  .bet-panel,
  .bet-sheet,
  .history,
  .results,
  .game-panel{
    max-width:900px;
    margin-left:auto;
    margin-right:auto;
  }
}
