<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  AB_SUIT_SYMBOLS,
  abCardLabel,
  formatMinor,
  formatX100,
  type ABCard,
  type ABSide,
} from '@lp/shared';
import { useInstantStore } from '@/stores/instant';
import { useAuthStore } from '@/stores/auth';
import { apiError } from '@/api/client';
import FairnessPanel from '@/components/FairnessPanel.vue';

const instant = useInstantStore();
const auth = useAuthStore();
const router = useRouter();

/** Table minimum is ₹10 — the server rejects anything below it. */
const MIN_STAKE = 1_000n;
const STEP = 1_000n;
const CHIPS = [1_000n, 10_000n, 50_000n, 100_000n];

const stake = ref(MIN_STAKE);
const busy = ref(false);
const toast = ref('');
/** How many cards of the finished deal have been turned over so far. */
const revealed = ref(0);

const hand = computed(() => instant.ab);
const result = computed(() => instant.abResult);
const playing = computed(() => hand.value !== null);

/** Cards visible on each pile — the whole deal animates in one card at a time. */
const shown = computed(() => {
  const r = result.value;
  if (!r) return { andar: [] as ABCard[], bahar: [] as ABCard[] };

  const order: Array<{ side: ABSide; card: ABCard }> = [];
  let a = 0;
  let b = 0;
  for (let i = 0; i < r.matchAt; i += 1) {
    const side: ABSide = i % 2 === 0 ? r.firstSide : r.firstSide === 'andar' ? 'bahar' : 'andar';
    order.push({ side, card: side === 'andar' ? r.andar[a++] : r.bahar[b++] });
  }

  const upto = order.slice(0, revealed.value);
  return {
    andar: upto.filter((o) => o.side === 'andar').map((o) => o.card),
    bahar: upto.filter((o) => o.side === 'bahar').map((o) => o.card),
  };
});

const dealDone = computed(() => !!result.value && revealed.value >= result.value.matchAt);

function isRed(card: ABCard) {
  return card.suit === 1 || card.suit === 2;
}

function bump(dir: 1 | -1) {
  const next = stake.value + STEP * BigInt(dir);
  stake.value = next < MIN_STAKE ? MIN_STAKE : next;
}

function exit() {
  router.push({ name: 'home' });
}

async function start() {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/andar-bahar' } });
    return;
  }
  busy.value = true;
  revealed.value = 0;
  try {
    await instant.startAB(stake.value.toString());
  } catch (err) {
    flash(apiError(err));
  } finally {
    busy.value = false;
  }
}

async function pick(side: ABSide) {
  if (!playing.value || busy.value) return;
  busy.value = true;
  try {
    const r = await instant.pickAB(side);

    // Turn the cards over one at a time so the hand plays out rather than
    // simply appearing already decided.
    revealed.value = 0;
    const total = r.hand.matchAt;
    const step = total > 20 ? 60 : 170;
    for (let i = 1; i <= total; i += 1) {
      revealed.value = i;
      await new Promise((res) => setTimeout(res, step));
    }

    flash(
      r.won
        ? `${side === 'andar' ? 'Andar' : 'Bahar'} wins — ₹${formatMinor(r.payout)}`
        : `${side === 'andar' ? 'Andar' : 'Bahar'} loses`,
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
    await Promise.all([instant.loadSeed(), instant.loadAB(), instant.loadHistory('ANDARBAHAR')]);
  }
});

onUnmounted(() => {
  instant.reset();
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="ab">
    <div class="frame">
      <header class="top">
        <button class="exit" title="Exit game" @click="exit">←</button>
        <span class="title">ANDAR BAHAR</span>
        <div class="bal">
          <strong class="mono">{{ formatMinor(auth.balance) }}</strong>
          <span class="cur">INR</span>
        </div>
      </header>

      <!-- Table -->
      <section class="table">
        <!-- Joker -->
        <div class="joker-row">
          <span class="cap">Joker</span>
          <div class="joker">
            <template v-if="hand || result">
              <div
                class="card big"
                :class="{ red: isRed((hand?.joker ?? result!.joker) as ABCard) }"
              >
                <span class="rank">{{ abCardLabel((hand?.joker ?? result!.joker) as ABCard).slice(0, -1) }}</span>
                <span class="suit">{{ AB_SUIT_SYMBOLS[(hand?.joker ?? result!.joker).suit] }}</span>
              </div>
            </template>
            <div v-else class="card big back">?</div>
          </div>
          <span v-if="hand || result" class="firsttag">
            {{ (hand?.firstSide ?? result!.firstSide) === 'andar' ? 'Andar' : 'Bahar' }} deals first
          </span>
        </div>

        <!-- Piles -->
        <div class="piles">
          <div
            class="pile andar"
            :class="{ winner: dealDone && result?.winner === 'andar' }"
          >
            <div class="pile-head">
              <span class="name">ANDAR</span>
              <span v-if="hand" class="odds">{{ formatX100(hand.odds.andar) }}x</span>
            </div>
            <div class="cards">
              <div
                v-for="(c, i) in shown.andar"
                :key="i"
                class="card"
                :class="{ red: isRed(c), hit: dealDone && result?.winner === 'andar' && i === shown.andar.length - 1 }"
                :style="{ marginLeft: i === 0 ? '0' : '-26px' }"
              >
                <span class="rank">{{ abCardLabel(c).slice(0, -1) }}</span>
                <span class="suit">{{ AB_SUIT_SYMBOLS[c.suit] }}</span>
              </div>
              <span v-if="!shown.andar.length" class="empty-pile">—</span>
            </div>
          </div>

          <div
            class="pile bahar"
            :class="{ winner: dealDone && result?.winner === 'bahar' }"
          >
            <div class="pile-head">
              <span class="name">BAHAR</span>
              <span v-if="hand" class="odds">{{ formatX100(hand.odds.bahar) }}x</span>
            </div>
            <div class="cards">
              <div
                v-for="(c, i) in shown.bahar"
                :key="i"
                class="card"
                :class="{ red: isRed(c), hit: dealDone && result?.winner === 'bahar' && i === shown.bahar.length - 1 }"
                :style="{ marginLeft: i === 0 ? '0' : '-26px' }"
              >
                <span class="rank">{{ abCardLabel(c).slice(0, -1) }}</span>
                <span class="suit">{{ AB_SUIT_SYMBOLS[c.suit] }}</span>
              </div>
              <span v-if="!shown.bahar.length" class="empty-pile">—</span>
            </div>
          </div>
        </div>

        <div v-if="dealDone && result" class="verdict" :class="result.won ? 'win' : 'lose'">
          {{ result.winner === 'andar' ? 'ANDAR' : 'BAHAR' }} wins on card {{ result.matchAt }}
          <template v-if="result.won"> · +₹{{ formatMinor(result.payout) }}</template>
        </div>
      </section>

      <!-- Controls -->
      <section class="ctrl">
        <template v-if="playing">
          <p class="prompt">Joker is up — pick a side</p>
          <div class="sides">
            <button class="side andar" :disabled="busy" @click="pick('andar')">
              <span class="lbl">ANDAR</span>
              <small>{{ formatX100(hand!.odds.andar) }}x</small>
            </button>
            <button class="side bahar" :disabled="busy" @click="pick('bahar')">
              <span class="lbl">BAHAR</span>
              <small>{{ formatX100(hand!.odds.bahar) }}x</small>
            </button>
          </div>
          <p class="note faint">
            The side dealt first wins slightly more often, so it pays slightly less. Both
            carry the same 98% return — the longer side buys variance, not value.
          </p>
        </template>

        <template v-else>
          <span class="label">Bet amount · min {{ formatMinor(MIN_STAKE).replace('.00', '') }}</span>
          <div class="stepper">
            <button class="rnd" :disabled="busy || stake <= MIN_STAKE" @click="bump(-1)">−</button>
            <span class="val mono">{{ formatMinor(stake) }}</span>
            <button class="rnd" :disabled="busy" @click="bump(1)">+</button>
          </div>
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
          <button class="btn deal" :disabled="busy" @click="start">
            {{ busy ? 'Dealing…' : `Deal ₹${formatMinor(stake)}` }}
          </button>
        </template>
      </section>

      <FairnessPanel v-if="auth.isLoggedIn" />

      <section v-if="instant.history.length" class="hist">
        <strong class="hd">Recent hands</strong>
        <div v-for="h in instant.history" :key="h.id" class="row">
          <span class="faint tiny">{{ ((h.params as any).side ?? '—') }}</span>
          <span class="mono">{{ (h.resultData as any)?.winner ?? '—' }}</span>
          <span :class="h.status === 'WON' ? 'win' : 'loss'">
            {{ h.status === 'WON' ? `+₹${formatMinor(h.payout)}` : `−₹${formatMinor(h.stake)}` }}
          </span>
        </div>
      </section>
    </div>

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped lang="scss">
.ab {
  min-height: 100vh;
  background: #071a12;
  display: flex;
  justify-content: center;
  padding: 10px;
}

.frame {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* --- header -------------------------------------------------------------- */
.top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.exit {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #123c2a;
  border: 1px solid #1f6b4a;
  color: #d6f5e5;
  font-size: 18px;
  line-height: 1;
  flex: 0 0 auto;

  &:hover {
    background: #17513a;
  }
}

.title {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #f5d98a;
}

.bal {
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 4px;
  color: #d6f5e5;

  strong {
    font-size: 15px;
  }

  .cur {
    font-size: 11px;
    opacity: 0.7;
  }
}

/* --- table --------------------------------------------------------------- */
.table {
  background: radial-gradient(ellipse at 50% 0%, #12603f, #0a3a27 80%);
  border: 2px solid #1f6b4a;
  border-radius: 16px;
  padding: 14px;
}

.joker-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 14px;
}

.cap {
  font-size: 11px;
  color: #8fd6b4;
  letter-spacing: 1px;
}

.firsttag {
  font-size: 11px;
  color: #f5d98a;
}

.card {
  width: 46px;
  height: 64px;
  border-radius: 7px;
  background: #f7f9ff;
  color: #16203a;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
  flex: 0 0 auto;
  border: 1px solid #cfd6e6;
  animation: dealin 0.18s ease;

  &.red {
    color: #d92b2b;
  }

  &.big {
    width: 62px;
    height: 86px;

    .rank {
      font-size: 26px;
    }
    .suit {
      font-size: 20px;
    }
  }

  &.back {
    background: repeating-linear-gradient(45deg, #1f6b4a 0 6px, #17513a 6px 12px);
    color: #8fd6b4;
    font-size: 28px;
    font-weight: 800;
    align-items: center;
    justify-content: center;
  }

  &.hit {
    box-shadow:
      0 3px 10px rgba(0, 0, 0, 0.4),
      0 0 0 3px #f5d98a;
    transform: translateY(-6px);
  }

  .rank {
    font-size: 17px;
    font-weight: 800;
    line-height: 1;
  }

  .suit {
    font-size: 14px;
    line-height: 1;
  }
}

@keyframes dealin {
  from {
    opacity: 0;
    transform: translateY(-14px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.piles {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pile {
  border-radius: 10px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid transparent;
  transition: border-color 0.25s ease;

  &.winner {
    border-color: #f5d98a;
    background: rgba(245, 217, 138, 0.12);
  }
}

.pile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;

  .name {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1.5px;
  }

  .odds {
    font-size: 11px;
    color: #f5d98a;
    font-weight: 700;
  }
}

.andar .name {
  color: #7fd1ff;
}
.bahar .name {
  color: #ffb37f;
}

.cards {
  display: flex;
  align-items: center;
  min-height: 66px;
  overflow-x: auto;
  padding: 2px 0;

  &::-webkit-scrollbar {
    display: none;
  }
}

.empty-pile {
  color: #4e8a70;
  font-size: 14px;
}

.verdict {
  margin-top: 12px;
  text-align: center;
  font-size: 13px;
  font-weight: 800;
  padding: 7px;
  border-radius: 8px;

  &.win {
    background: rgba(61, 220, 151, 0.18);
    color: #3ddc97;
  }

  &.lose {
    background: rgba(255, 95, 122, 0.15);
    color: #ff8fa3;
  }
}

/* --- controls ------------------------------------------------------------ */
.ctrl {
  background: #0d2f21;
  border: 1px solid #1f6b4a;
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #d6f5e5;
}

.prompt {
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: #f5d98a;
  font-weight: 700;
}

.sides {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.side {
  height: 56px;
  border-radius: 10px;
  color: #08210f;
  font-weight: 800;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  .lbl {
    font-size: 14px;
    letter-spacing: 1px;
  }

  small {
    font-size: 11px;
    opacity: 0.8;
  }

  &.andar {
    background: linear-gradient(180deg, #7fd1ff, #4aa9e0);
  }
  &.bahar {
    background: linear-gradient(180deg, #ffb37f, #e08a4a);
  }

  &:disabled {
    opacity: 0.55;
  }
}

.label {
  font-size: 11px;
  color: #8fd6b4;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #071a12;
  border: 1px solid #1f6b4a;
  border-radius: 999px;
  padding: 4px 8px;
}

.rnd {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #17513a;
  color: #d6f5e5;
  font-size: 16px;
  flex: 0 0 auto;

  &:disabled {
    opacity: 0.4;
  }
}

.val {
  flex: 1;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
}

.chips {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.chip {
  height: 30px;
  border-radius: 6px;
  background: #123c2a;
  border: 1px solid #1f6b4a;
  color: #8fd6b4;
  font-size: 12px;
  font-weight: 700;

  &.on {
    background: #f5d98a;
    color: #08210f;
    border-color: #f5d98a;
  }
}

.deal {
  height: 46px;
  border-radius: 999px;
  background: linear-gradient(180deg, #f5d98a, #d9b455);
  color: #08210f;
  font-weight: 800;
  font-size: 15px;

  &:disabled {
    opacity: 0.6;
  }
}

.note {
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: #6fae90;
}

/* --- history ------------------------------------------------------------- */
.hist {
  background: #0d2f21;
  border: 1px solid #1f6b4a;
  border-radius: 14px;
  padding: 12px;
  color: #d6f5e5;
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
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(31, 107, 74, 0.5);
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;

  &:last-child {
    border-bottom: 0;
  }
}

.faint {
  color: #6fae90;
}

.tiny {
  font-size: 10px;
}

.win {
  color: #3ddc97;
}

.loss {
  color: #ff8fa3;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  background: rgba(7, 26, 18, 0.97);
  border: 1px solid #1f6b4a;
  color: #d6f5e5;
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 13px;
  z-index: 200;
}
</style>
