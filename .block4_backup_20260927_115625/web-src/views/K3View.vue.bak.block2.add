<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { K3_ROOMS, formatMinor, k3Rules, oddsLabel } from '@lp/shared';
import { useGameStore } from '@/stores/game';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';
import BetSheet from '@/components/BetSheet.vue';

const game = useGameStore();
const auth = useAuthStore();
const router = useRouter();

const tab = ref<'history' | 'mine'>('history');
const betTab = ref<'basic' | 'total' | 'special'>('basic');
const toast = ref('');
const submitting = ref(false);

const sheet = ref({ open: false, betType: 'SIZE', selection: 'big' });

const closed = computed(() => game.isLocked);

/** The three dice of the most recent result, for the strip under the clock. */
const recentDice = computed(() =>
  game.results.slice(0, 5).map((r) => ({
    periodNo: r.periodNo,
    dice: (r.result as { dice: number[] } | null)?.dice ?? [],
  })),
);

const TOTALS = Array.from({ length: 16 }, (_, i) => i + 3); // 3..18
const FACES = [1, 2, 3, 4, 5, 6];

/** Odds for a selection, straight from the shared rules — never hardcoded here. */
function odds(betType: string, selection: string): string {
  return oddsLabel(k3Rules.displayOdds(betType, selection));
}

function openSheet(betType: string, selection: string) {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/k3' } });
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
  if (!K3_ROOMS.some((r) => r.key === game.roomKey)) game.roomKey = 'K3_1M';
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
    <section class="wallet">
      <div class="row between">
        <span class="dim">Wallet balance</span>
        <span class="dot" :class="{ live: game.connected }" />
      </div>
      <div class="amount mono">₹{{ formatMinor(auth.balance) }}</div>
      <div class="actions">
        <router-link class="btn btn-primary" :to="{ name: 'wallet' }">Deposit</router-link>
      </div>
    </section>

    <nav class="rooms">
      <button
        v-for="r in K3_ROOMS"
        :key="r.key"
        class="room"
        :class="{ on: game.roomKey === r.key }"
        @click="game.switchRoom(r.key)"
      >
        <span class="t">{{ r.intervalSec / 60 }}</span>
        <span class="u">Min</span>
      </button>
    </nav>

    <section class="period card">
      <div class="left">
        <span class="cap">Period</span>
        <strong class="mono pno">{{ game.periodNo || '—' }}</strong>
        <div class="dice-strip">
          <span v-for="r in recentDice" :key="r.periodNo" class="mini">
            <i v-for="(d, i) in r.dice" :key="i" class="die-sm">{{ d }}</i>
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

    <p v-if="game.serverSeedHash" class="commit faint mono">
      Fairness commitment {{ game.serverSeedHash.slice(0, 24) }}…
    </p>

    <section class="panel card" :class="{ closed }">
      <div class="bet-tabs">
        <button :class="{ on: betTab === 'basic' }" @click="betTab = 'basic'">Basic</button>
        <button :class="{ on: betTab === 'total' }" @click="betTab = 'total'">Total</button>
        <button :class="{ on: betTab === 'special' }" @click="betTab = 'special'">Special</button>
      </div>

      <!-- Big/Small, Odd/Even -->
      <div v-if="betTab === 'basic'" class="basic">
        <div class="pair">
          <button class="b big" @click="openSheet('SIZE', 'big')">
            Big<small>{{ odds('SIZE', 'big') }}</small>
          </button>
          <button class="b small" @click="openSheet('SIZE', 'small')">
            Small<small>{{ odds('SIZE', 'small') }}</small>
          </button>
        </div>
        <div class="pair">
          <button class="b odd" @click="openSheet('PARITY', 'odd')">
            Odd<small>{{ odds('PARITY', 'odd') }}</small>
          </button>
          <button class="b even" @click="openSheet('PARITY', 'even')">
            Even<small>{{ odds('PARITY', 'even') }}</small>
          </button>
        </div>
        <p class="hint faint">Big / Small and Odd / Even both lose on any triple.</p>
      </div>

      <!-- Exact total 3..18 -->
      <div v-else-if="betTab === 'total'" class="totals">
        <button v-for="t in TOTALS" :key="t" class="tot" @click="openSheet('TOTAL', String(t))">
          <span class="v">{{ t }}</span>
          <small>{{ odds('TOTAL', String(t)) }}</small>
        </button>
      </div>

      <!-- Triples, doubles, combinations -->
      <div v-else class="special">
        <button class="wide" @click="openSheet('TRIPLE_ANY', 'any')">
          Any triple<small>{{ odds('TRIPLE_ANY', 'any') }}</small>
        </button>

        <span class="label">Exact triple</span>
        <div class="faces">
          <button v-for="f in FACES" :key="`t${f}`" class="face triple" @click="openSheet('TRIPLE_EXACT', String(f))">
            {{ f }}{{ f }}{{ f }}
          </button>
        </div>

        <span class="label">Exact double</span>
        <div class="faces">
          <button v-for="f in FACES" :key="`d${f}`" class="face" @click="openSheet('DOUBLE_EXACT', String(f))">
            {{ f }}{{ f }}
          </button>
        </div>

        <span class="label">Two-face combination</span>
        <div class="combos">
          <button
            v-for="c in [
              [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
              [2, 3], [2, 4], [2, 5], [2, 6],
              [3, 4], [3, 5], [3, 6],
              [4, 5], [4, 6], [5, 6],
            ]"
            :key="c.join(',')"
            class="combo"
            @click="openSheet('COMBO', c.join(','))"
          >
            {{ c[0] }}+{{ c[1] }}
          </button>
        </div>
      </div>

      <div v-if="closed" class="lock-veil">
        <span class="mono">{{ game.countdown.mm }}:{{ game.countdown.ss }}</span>
        <em>Betting closed</em>
      </div>
    </section>

    <section class="history">
      <div class="tabs">
        <button :class="{ on: tab === 'history' }" @click="tab = 'history'">Game history</button>
        <button :class="{ on: tab === 'mine' }" @click="tab = 'mine'">My bets</button>
      </div>

      <table v-if="tab === 'history'" class="tbl">
        <thead>
          <tr>
            <th>Period</th>
            <th>Dice</th>
            <th>Sum</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in game.results" :key="r.periodNo">
            <td class="mono faint">{{ r.periodNo }}</td>
            <td>
              <i v-for="(d, i) in (r.result as any)?.dice ?? []" :key="i" class="die">{{ d }}</i>
            </td>
            <td class="mono">{{ ((r.result as any)?.dice ?? []).reduce((a: number, b: number) => a + b, 0) }}</td>
            <td>
              <span v-for="t in r.summary.tags" :key="t" class="chip-tag">{{ t }}</span>
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
            <span class="sel">{{ b.betType.replace('_', ' ').toLowerCase() }}<br /><b>{{ b.selection }}</b></span>
            <div>
              <div class="mono faint tiny">{{ b.periodNo }}</div>
              <div class="tiny dim">Stake ₹{{ formatMinor(b.stake) }} · {{ b.odds }}</div>
            </div>
          </div>
          <div class="br">
            <span v-if="b.status === 'PENDING'" class="dim">Pending</span>
            <span v-else-if="b.status === 'WON'" class="win">+₹{{ formatMinor(b.payout) }}</span>
            <span v-else class="loss">−₹{{ formatMinor(b.stake) }}</span>
            <div v-if="b.summary" class="tiny faint">{{ b.summary.primary }}</div>
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

.wallet {
  background: linear-gradient(135deg, #2a3247, #1b2233);
  border-radius: var(--radius);
  padding: 14px;

  .amount {
    font-size: 27px;
    font-weight: 800;
    margin: 4px 0 12px;
  }

  .actions .btn {
    text-decoration: none;
    height: 40px;
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

.rooms {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
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

.dice-strip {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mini {
  display: flex;
  gap: 2px;
}

.die-sm {
  width: 15px;
  height: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-3);
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  font-style: normal;
}

.die {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #16203a;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 800;
  font-style: normal;
  margin-right: 3px;
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

.panel {
  position: relative;
}

.bet-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 12px;

  button {
    height: 32px;
    border-radius: 6px;
    background: var(--surface-2);
    color: var(--text-faint);
    font-size: 12px;
    font-weight: 700;

    &.on {
      background: var(--surface-3);
      color: var(--gold);
    }
  }
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}

.b {
  height: 46px;
  border-radius: var(--radius-sm);
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
.odd {
  background: var(--green);
}
.even {
  background: var(--red);
}

.hint {
  margin: 6px 0 0;
  font-size: 10px;
}

.totals {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.tot {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 7px 0;
  border-radius: 6px;
  background: var(--surface-3);

  .v {
    font-size: 15px;
    font-weight: 800;
  }

  small {
    font-size: 9px;
    color: var(--gold);
  }
}

.special {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .label {
    font-size: 11px;
    color: var(--text-dim);
    margin-top: 2px;
  }
}

.wide {
  height: 40px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  color: #fff;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  small {
    font-size: 10px;
    opacity: 0.9;
  }
}

.faces {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}

.face {
  height: 34px;
  border-radius: 6px;
  background: var(--surface-3);
  font-size: 11px;
  font-weight: 700;

  &.triple {
    font-size: 10px;
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
}

.combos {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.combo {
  height: 30px;
  border-radius: 6px;
  background: var(--surface-3);
  font-size: 11px;
  font-weight: 700;
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

.chip-tag {
  display: inline-block;
  padding: 1px 6px;
  margin-right: 4px;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--text-dim);
  font-size: 10px;
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
  min-width: 60px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--surface-3);
  font-size: 9px;
  text-transform: capitalize;
  color: var(--text-dim);
  text-align: center;

  b {
    font-size: 12px;
    color: var(--text);
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
