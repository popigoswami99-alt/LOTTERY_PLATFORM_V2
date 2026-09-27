<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MINES_TILES, formatMinor, formatX100, minesMultiplierX100 } from '@lp/shared';
import { useInstantStore } from '@/stores/instant';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';
import FairnessPanel from '@/components/FairnessPanel.vue';

const instant = useInstantStore();
const auth = useAuthStore();
const router = useRouter();

const stake = ref(10_000n);
const mineCount = ref(3);
const busy = ref(false);
const toast = ref('');

const CHIPS = [1_000n, 10_000n, 50_000n, 100_000n];
const MINE_OPTIONS = [1, 3, 5, 10, 24];

const playing = computed(() => instant.mines !== null);
const revealed = computed(() => instant.mines?.revealed ?? []);
const currentMult = computed(() => instant.mines?.multiplierX100 ?? 100);

/** What one more safe tile would be worth — the reason to keep going. */
const nextMult = computed(() => {
  if (!instant.mines) return 0;
  return minesMultiplierX100(instant.mines.mines, instant.mines.revealed.length + 1);
});

const cashValue = computed(() => {
  if (!instant.mines) return 0n;
  return (BigInt(instant.mines.stake) * 98n * BigInt(currentMult.value)) / (100n * 100n);
});

function tileState(i: number): string {
  if (instant.minePositions?.includes(i)) {
    return i === instant.lastMineHit ? 'boom' : 'mine';
  }
  if (revealed.value.includes(i)) return 'safe';
  if (instant.minePositions) return 'dim';
  return '';
}

async function start() {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/mines' } });
    return;
  }
  busy.value = true;
  try {
    await instant.startMines(stake.value.toString(), mineCount.value);
  } catch (err) {
    flash(apiError(err));
  } finally {
    busy.value = false;
  }
}

async function reveal(i: number) {
  if (!playing.value || busy.value || revealed.value.includes(i)) return;
  busy.value = true;
  try {
    const r = await instant.revealTile(i);
    if (r.hitMine) flash('Mine! Round over');
    else if (r.status === 'WON') flash(`Board cleared — ₹${formatMinor(r.payout)}`);
  } catch (err) {
    flash(apiError(err));
  } finally {
    busy.value = false;
  }
}

async function cashout() {
  busy.value = true;
  try {
    const r = await instant.cashoutMines();
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
    await Promise.all([instant.loadSeed(), instant.loadMines(), instant.loadHistory('MINES')]);
  }
});

// Only the cached view is cleared — an unfinished board lives on the server
// and is restored by loadMines() on the next visit.
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

    <!-- Board -->
    <section class="board">
      <div class="hdr">
        <div>
          <span class="cap">Multiplier</span>
          <strong class="mono big">{{ formatX100(currentMult) }}x</strong>
        </div>
        <div v-if="playing" class="right">
          <span class="cap">Next tile</span>
          <strong class="mono next">{{ formatX100(nextMult) }}x</strong>
        </div>
      </div>

      <div class="grid">
        <button
          v-for="i in MINES_TILES"
          :key="i - 1"
          class="tile"
          :class="tileState(i - 1)"
          :disabled="!playing || busy"
          @click="reveal(i - 1)"
        >
          <span v-if="tileState(i - 1) === 'safe'">💎</span>
          <span v-else-if="tileState(i - 1) === 'mine' || tileState(i - 1) === 'boom'">💣</span>
        </button>
      </div>
    </section>

    <!-- Controls -->
    <section class="card ctrl">
      <template v-if="playing">
        <button class="btn cash" :disabled="busy || revealed.length === 0" @click="cashout">
          {{
            revealed.length === 0
              ? 'Reveal a tile first'
              : `Cash out ₹${formatMinor(cashValue)}`
          }}
          <small v-if="revealed.length">{{ formatX100(currentMult) }}x</small>
        </button>
        <p class="note faint">
          {{ instant.mines?.mines }} mines hidden · {{ revealed.length }} safe tiles found
        </p>
      </template>

      <template v-else>
        <span class="label">Mines</span>
        <div class="chips five">
          <button
            v-for="m in MINE_OPTIONS"
            :key="m"
            class="chip"
            :class="{ on: mineCount === m }"
            @click="mineCount = m"
          >
            {{ m }}
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

        <button class="btn btn-primary" :disabled="busy" @click="start">
          {{ busy ? 'Starting…' : `Play ₹${formatMinor(stake)}` }}
        </button>
      </template>
    </section>

    <FairnessPanel v-if="auth.isLoggedIn" />

    <section v-if="instant.history.length" class="hist">
      <strong class="hd">Recent games</strong>
      <div v-for="h in instant.history" :key="h.id" class="row">
        <span class="faint tiny">{{ (h.params as any).mines }} mines</span>
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
  margin-bottom: 12px;
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

.next {
  font-size: 16px;
  font-weight: 700;
  color: var(--gold);
}

.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 7px;
}

.tile {
  aspect-ratio: 1;
  border-radius: 9px;
  background: var(--surface-3);
  border: 1px solid var(--line);
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.1s ease,
    background 0.2s ease;

  &:not(:disabled):active {
    transform: scale(0.94);
  }

  &:disabled {
    cursor: default;
  }

  &.safe {
    background: rgba(22, 185, 121, 0.22);
    border-color: var(--green);
  }

  &.mine {
    background: rgba(232, 69, 60, 0.16);
    border-color: rgba(232, 69, 60, 0.5);
    opacity: 0.75;
  }

  &.boom {
    background: rgba(232, 69, 60, 0.5);
    border-color: var(--red);
  }

  &.dim {
    opacity: 0.4;
  }
}

.ctrl {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cash {
  background: linear-gradient(135deg, #16b979, #0e8f5c);
  color: #fff;
  height: 50px;
  font-size: 15px;

  small {
    font-size: 11px;
    background: rgba(0, 0, 0, 0.22);
    padding: 2px 7px;
    border-radius: 4px;
  }

  &:disabled {
    background: var(--surface-3);
    color: var(--text-faint);
  }
}

.note {
  margin: 0;
  text-align: center;
  font-size: 11px;
}

.chips {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;

  &.five {
    grid-template-columns: repeat(5, 1fr);
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

.hd {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  gap: 8px;
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
</style>
