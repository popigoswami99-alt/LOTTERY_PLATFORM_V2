<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { WINGO_ROOMS, coloursOf, formatMinor } from '@lp/shared';
import { useGameStore } from '@/stores/game';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';
import BetSheet from '@/components/BetSheet.vue';

const game = useGameStore();
const auth = useAuthStore();
const router = useRouter();

const tab = ref<'history' | 'mine'>('history');
const toast = ref('');
const submitting = ref(false);

const sheet = ref<{ open: boolean; betType: string; selection: string }>({
  open: false,
  betType: 'COLOUR',
  selection: 'green',
});

/**
 * Last five results, shown as balls under the countdown. WinGo always has a
 * digit, but the shared result row types it as nullable because other games
 * do not — so filter rather than assert.
 */
const recentBalls = computed(() =>
  game.results
    .slice(0, 5)
    .filter((r): r is typeof r & { resultNumber: number } => r.resultNumber !== null),
);

/** Betting is disabled in the closing seconds of the period. */
const closed = computed(() => game.isLocked);

function openSheet(betType: string, selection: string) {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/wingo' } });
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

onMounted(async () => {
  // Coming from the lobby, or straight back to a WinGo URL after playing K3.
  if (!WINGO_ROOMS.some((r) => r.key === game.roomKey)) game.roomKey = 'WINGO_1M';
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
        <span class="dot" :class="{ live: game.connected }" :title="game.connected ? 'Live' : 'Reconnecting'" />
      </div>
      <div class="amount mono">₹{{ formatMinor(auth.balance) }}</div>
      <div class="actions">
        <router-link class="btn btn-primary" :to="{ name: 'wallet' }">Deposit</router-link>
      </div>
    </section>

    <!-- Room tabs -->
    <nav class="rooms">
      <button
        v-for="r in WINGO_ROOMS"
        :key="r.key"
        class="room"
        :class="{ on: game.roomKey === r.key }"
        @click="game.switchRoom(r.key)"
      >
        <span class="t">{{ r.intervalSec >= 60 ? r.intervalSec / 60 : r.intervalSec }}</span>
        <span class="u">{{ r.intervalSec >= 60 ? 'Min' : 'Sec' }}</span>
      </button>
    </nav>

    <!-- Period + countdown -->
    <section class="period card">
      <div class="left">
        <span class="cap">Period</span>
        <strong class="mono pno">{{ game.periodNo || '—' }}</strong>
        <div class="balls">
          <span
            v-for="r in recentBalls"
            :key="r.periodNo"
            class="ball"
            :class="game.ballClass(r.resultNumber)"
          >
            {{ r.resultNumber }}
          </span>
        </div>
      </div>
      <div class="right">
        <span class="cap">Count down</span>
        <div class="clock">
          <span v-for="(d, i) in game.countdown.digits" :key="i" class="d">{{ d }}</span>
        </div>
        <span class="state" :class="{ locked: closed }">
          {{ closed ? 'Betting closed' : 'Betting open' }}
        </span>
      </div>
    </section>

    <p class="commit faint mono" v-if="game.serverSeedHash">
      Fairness commitment {{ game.serverSeedHash.slice(0, 24) }}…
    </p>

    <!-- Bet panel -->
    <section class="panel card" :class="{ closed }">
      <div class="colours">
        <button class="c green" @click="openSheet('COLOUR', 'green')">Green<small>2X</small></button>
        <button class="c violet" @click="openSheet('COLOUR', 'violet')">Violet<small>4.5X</small></button>
        <button class="c red" @click="openSheet('COLOUR', 'red')">Red<small>2X</small></button>
      </div>

      <div class="numbers">
        <button
          v-for="n in 10"
          :key="n - 1"
          class="n"
          :class="game.ballClass(n - 1)"
          @click="openSheet('NUMBER', String(n - 1))"
        >
          {{ n - 1 }}
        </button>
      </div>

      <div class="sizes">
        <button class="s big" @click="openSheet('SIZE', 'big')">Big<small>2X</small></button>
        <button class="s small" @click="openSheet('SIZE', 'small')">Small<small>2X</small></button>
      </div>

      <div v-if="closed" class="lock-veil">
        <span class="mono">{{ game.countdown.mm }}:{{ game.countdown.ss }}</span>
        <em>Betting closed</em>
      </div>
    </section>

    <!-- History -->
    <section class="history">
      <div class="tabs">
        <button :class="{ on: tab === 'history' }" @click="tab = 'history'">Game history</button>
        <button :class="{ on: tab === 'mine' }" @click="tab = 'mine'">My bets</button>
      </div>

      <table v-if="tab === 'history'" class="tbl">
        <thead>
          <tr>
            <th>Period</th>
            <th>Number</th>
            <th>Size</th>
            <th>Colour</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in game.results" :key="r.periodNo">
            <td class="mono faint">{{ r.periodNo }}</td>
            <td>
              <span class="num" :class="`t-${coloursOf(r.resultNumber ?? 0)[0]}`">
                {{ r.resultNumber }}
              </span>
            </td>
            <td class="dim">{{ r.summary.tags[0] }}</td>
            <td>
              <span
                v-for="c in coloursOf(r.resultNumber ?? 0)"
                :key="c"
                class="pip"
                :class="`p-${c}`"
              />
            </td>
          </tr>
          <tr v-if="!game.results.length">
            <td colspan="4" class="empty">Waiting for the first result…</td>
          </tr>
        </tbody>
      </table>

      <div v-else class="mine">
        <div v-for="b in game.myBets" :key="b.id" class="bet">
          <div class="bl">
            <span class="sel" :class="`sel-${b.selection}`">{{ b.selection }}</span>
            <div>
              <div class="mono faint tiny">{{ b.periodNo }}</div>
              <div class="tiny dim">Stake ₹{{ formatMinor(b.stake) }}</div>
            </div>
          </div>
          <div class="br">
            <span v-if="b.status === 'PENDING'" class="dim">Pending</span>
            <span v-else-if="b.status === 'WON'" class="win">+₹{{ formatMinor(b.payout) }}</span>
            <span v-else class="loss">−₹{{ formatMinor(b.stake) }}</span>
            <div v-if="b.resultNumber !== null" class="tiny faint">result {{ b.resultNumber }}</div>
          </div>
        </div>
        <p v-if="!game.myBets.length" class="empty">
          {{ auth.isLoggedIn ? 'No bets yet.' : 'Log in to see your bets.' }}
        </p>
      </div>
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
.page {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* --- wallet -------------------------------------------------------------- */
.wallet {
  background: linear-gradient(135deg, #2a3247, #1b2233);
  border-radius: var(--radius);
  padding: 14px;

  .amount {
    font-size: 27px;
    font-weight: 800;
    margin: 4px 0 12px;
  }

  .actions {
    display: flex;
    gap: 10px;

    .btn {
      text-decoration: none;
      height: 40px;
    }
  }
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-faint);

  &.live {
    background: var(--green);
    box-shadow: 0 0 0 3px rgba(22, 185, 121, 0.18);
  }
}

/* --- rooms --------------------------------------------------------------- */
.rooms {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.room {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-dim);

  .t {
    font-size: 17px;
    font-weight: 800;
    line-height: 1.1;
  }
  .u {
    font-size: 11px;
  }

  &.on {
    background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
    color: #fff;
  }
}

/* --- period -------------------------------------------------------------- */
.period {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.cap {
  font-size: 11px;
  color: var(--text-dim);
}

.pno {
  display: block;
  font-size: 15px;
  margin: 2px 0 8px;
}

.balls {
  display: flex;
  gap: 4px;

  .ball {
    width: 20px;
    height: 20px;
    font-size: 11px;
  }
}

.right {
  text-align: right;
}

.clock {
  display: flex;
  gap: 3px;
  justify-content: flex-end;
  margin: 4px 0 6px;

  .d {
    width: 22px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-3);
    border-radius: 5px;
    font-size: 17px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
}

.state {
  font-size: 11px;
  color: var(--green);

  &.locked {
    color: var(--red);
  }
}

.commit {
  margin: -6px 2px 0;
  font-size: 10px;
}

/* --- bet panel ----------------------------------------------------------- */
.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.colours {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;

  .c {
    height: 42px;
    border-radius: var(--radius-sm);
    color: #fff;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;

    small {
      font-size: 10px;
      opacity: 0.85;
    }
  }

  .green {
    background: var(--green);
  }
  .violet {
    background: var(--violet);
  }
  .red {
    background: var(--red);
  }
}

.numbers {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;

  .n {
    aspect-ratio: 1;
    border-radius: 50%;
    color: #fff;
    font-size: 18px;
    font-weight: 800;
  }
}

.sizes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;

  .s {
    height: 40px;
    border-radius: 999px;
    color: #fff;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;

    small {
      font-size: 10px;
      opacity: 0.85;
    }
  }

  .big {
    background: var(--gold);
  }
  .small {
    background: var(--violet);
  }
}

.lock-veil {
  position: absolute;
  inset: 0;
  background: rgba(12, 16, 26, 0.86);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;

  span {
    font-size: 34px;
    font-weight: 800;
  }
  em {
    font-style: normal;
    font-size: 12px;
    color: var(--text-dim);
  }
}

/* --- history ------------------------------------------------------------- */
.history {
  background: var(--surface);
  border-radius: var(--radius);
  overflow: hidden;
}

.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;

  button {
    padding: 11px 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-faint);
    background: var(--surface-2);

    &.on {
      color: var(--text);
      background: var(--surface);
    }
  }
}

.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th {
    padding: 9px 10px;
    text-align: left;
    color: var(--text-faint);
    font-weight: 600;
    border-bottom: 1px solid var(--line);
  }

  td {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(49, 60, 85, 0.4);
  }
}

.num {
  font-weight: 800;
  font-size: 15px;

  &.t-green {
    color: var(--green);
  }
  &.t-red {
    color: var(--red);
  }
  &.t-violet {
    color: var(--violet);
  }
}

.pip {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 3px;

  &.p-green {
    background: var(--green);
  }
  &.p-red {
    background: var(--red);
  }
  &.p-violet {
    background: var(--violet);
  }
}

.mine {
  padding: 4px 0;
}

.bet {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-bottom: 1px solid rgba(49, 60, 85, 0.4);
}

.bl {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sel {
  min-width: 42px;
  height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  text-transform: capitalize;
  color: #fff;
  background: var(--surface-3);

  &.sel-green {
    background: var(--green);
  }
  &.sel-red {
    background: var(--red);
  }
  &.sel-violet {
    background: var(--violet);
  }
  &.sel-big {
    background: var(--gold);
  }
  &.sel-small {
    background: var(--violet);
  }
}

.br {
  text-align: right;
  font-weight: 700;
}

.tiny {
  font-size: 10px;
}

.empty {
  padding: 20px;
  text-align: center;
  color: var(--text-faint);
  font-size: 12px;
}

/* --- toast --------------------------------------------------------------- */
.toast {
  position: fixed;
  left: 50%;
  bottom: 84px;
  transform: translateX(-50%);
  background: rgba(20, 26, 40, 0.96);
  border: 1px solid var(--line);
  color: var(--text);
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 13px;
  z-index: 200;
  max-width: 90%;
  text-align: center;
}
</style>
