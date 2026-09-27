<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  AB_SUIT_SYMBOLS,
  DT_SIDES,
  abCardLabel,
  dtMultiplierX100,
  formatMinor,
  formatX100,
  type ABCard,
  type DTSide,
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
/** Cards stay face-down until the deal animation turns them. */
const flipped = ref({ dragon: false, tiger: false });

const result = computed(() => instant.dt);

/** Odds come from the shared table the server pays from, not a hardcoded list. */
const odds = computed(() =>
  Object.fromEntries(DT_SIDES.map((s) => [s, dtMultiplierX100(s)])) as Record<DTSide, number>,
);

const LABELS: Record<DTSide, string> = { dragon: 'DRAGON', tiger: 'TIGER', tie: 'TIE' };

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

async function play(side: DTSide) {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/dragon-tiger' } });
    return;
  }
  busy.value = true;
  flipped.value = { dragon: false, tiger: false };
  try {
    const r = await instant.playDragonTiger(stake.value.toString(), side);

    // Turn Dragon, then Tiger, so the hand resolves rather than appearing.
    await new Promise((res) => setTimeout(res, 260));
    flipped.value.dragon = true;
    await new Promise((res) => setTimeout(res, 520));
    flipped.value.tiger = true;
    await new Promise((res) => setTimeout(res, 320));

    flash(
      r.won
        ? `${LABELS[r.winner]} wins — ₹${formatMinor(r.payout)}`
        : `${LABELS[r.winner]} wins — no return`,
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
    await Promise.all([instant.loadSeed(), instant.loadHistory('DRAGONTIGER')]);
  }
});

onUnmounted(() => {
  instant.reset();
  window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="dt">
    <div class="frame">
      <header class="top">
        <button class="exit" title="Exit game" @click="exit">←</button>
        <span class="title">DRAGON <i>vs</i> TIGER</span>
        <div class="bal">
          <strong class="mono">{{ formatMinor(auth.balance) }}</strong>
          <span class="cur">INR</span>
        </div>
      </header>

      <!-- Table -->
      <section class="table">
        <div class="seats">
          <div class="seat dragon" :class="{ win: result && flipped.tiger && result.winner === 'dragon' }">
            <span class="seat-name">DRAGON</span>
            <div class="card" :class="{ faceup: flipped.dragon, red: result && isRed(result.dragon) }">
              <template v-if="flipped.dragon && result">
                <span class="rank">{{ abCardLabel(result.dragon).slice(0, -1) }}</span>
                <span class="suit">{{ AB_SUIT_SYMBOLS[result.dragon.suit] }}</span>
              </template>
              <span v-else class="back">🐉</span>
            </div>
            <span class="pay">{{ formatX100(odds.dragon) }}x</span>
          </div>

          <div class="vs">
            <span v-if="result && flipped.tiger" class="verdict" :class="result.winner">
              {{ LABELS[result.winner] }}
            </span>
            <span v-else class="vs-text">VS</span>
          </div>

          <div class="seat tiger" :class="{ win: result && flipped.tiger && result.winner === 'tiger' }">
            <span class="seat-name">TIGER</span>
            <div class="card" :class="{ faceup: flipped.tiger, red: result && isRed(result.tiger) }">
              <template v-if="flipped.tiger && result">
                <span class="rank">{{ abCardLabel(result.tiger).slice(0, -1) }}</span>
                <span class="suit">{{ AB_SUIT_SYMBOLS[result.tiger.suit] }}</span>
              </template>
              <span v-else class="back">🐯</span>
            </div>
            <span class="pay">{{ formatX100(odds.tiger) }}x</span>
          </div>
        </div>

        <div
          v-if="result && flipped.tiger"
          class="outcome"
          :class="result.won ? 'won' : 'lost'"
        >
          You backed {{ LABELS[result.side] }} —
          {{ result.won ? `+₹${formatMinor(result.payout)}` : `−₹${formatMinor(stake)}` }}
        </div>
      </section>

      <!-- Betting -->
      <section class="ctrl">
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

        <span class="label">Back a side</span>
        <div class="bets">
          <button class="bet b-dragon" :disabled="busy" @click="play('dragon')">
            <span class="lbl">DRAGON</span>
            <small>{{ formatX100(odds.dragon) }}x</small>
          </button>
          <button class="bet b-tie" :disabled="busy" @click="play('tie')">
            <span class="lbl">TIE</span>
            <small>{{ formatX100(odds.tie) }}x</small>
          </button>
          <button class="bet b-tiger" :disabled="busy" @click="play('tiger')">
            <span class="lbl">TIGER</span>
            <small>{{ formatX100(odds.tiger) }}x</small>
          </button>
        </div>

        <p class="note faint">
          Higher card wins, Ace low. Equal ranks are a tie, and a tie loses a Dragon or
          Tiger bet — there is no half-stake rule, which is why the sides pay 2.12x rather
          than 2x. All three bets return 98%.
        </p>
      </section>

      <FairnessPanel v-if="auth.isLoggedIn" />

      <section v-if="instant.history.length" class="hist">
        <strong class="hd">Recent hands</strong>
        <div v-for="h in instant.history" :key="h.id" class="row">
          <span class="faint tiny">backed {{ (h.params as any).side }}</span>
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
.dt {
  min-height: 100vh;
  background: #1a0d16;
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
  background: #3a1424;
  border: 1px solid #8a2f4a;
  color: #ffd9e2;
  font-size: 18px;
  line-height: 1;
  flex: 0 0 auto;

  &:hover {
    background: #4d1a2f;
  }
}

.title {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: #f0c674;

  i {
    font-style: italic;
    font-weight: 500;
    opacity: 0.7;
  }
}

.bal {
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 4px;
  color: #ffd9e2;

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
  background: radial-gradient(ellipse at 50% 10%, #5a1730, #2a0c18 80%);
  border: 2px solid #8a2f4a;
  border-radius: 16px;
  padding: 18px 14px;
}

.seats {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
}

.seat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 10px 6px;
  border-radius: 12px;
  border: 2px solid transparent;
  transition:
    border-color 0.3s ease,
    background 0.3s ease;

  &.win {
    border-color: #f0c674;
    background: rgba(240, 198, 116, 0.12);
  }
}

.seat-name {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1.5px;
}

.dragon .seat-name {
  color: #ff8a8a;
}
.tiger .seat-name {
  color: #ffc46b;
}

.card {
  width: 76px;
  height: 106px;
  border-radius: 9px;
  background: #f7f9ff;
  color: #16203a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 5px 16px rgba(0, 0, 0, 0.5);
  border: 1px solid #cfd6e6;
  transition: transform 0.3s ease;

  &.red {
    color: #d92b2b;
  }

  &.faceup {
    animation: flip 0.4s ease;
  }

  .rank {
    font-size: 32px;
    font-weight: 800;
    line-height: 1;
  }

  .suit {
    font-size: 22px;
    line-height: 1;
  }

  .back {
    font-size: 34px;
  }
}

/* Face-down cards keep the table's colour rather than the card face. */
.card:not(.faceup) {
  background: repeating-linear-gradient(45deg, #8a2f4a 0 7px, #6d2039 7px 14px);
  border-color: #a8425f;
}

@keyframes flip {
  from {
    transform: rotateY(90deg) scale(0.9);
  }
  to {
    transform: none;
  }
}

.vs {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 62px;
}

.vs-text {
  font-size: 15px;
  font-weight: 800;
  color: #a8748c;
}

.verdict {
  font-size: 13px;
  font-weight: 800;
  padding: 4px 8px;
  border-radius: 6px;
  text-align: center;

  &.dragon {
    background: rgba(255, 138, 138, 0.2);
    color: #ff8a8a;
  }
  &.tiger {
    background: rgba(255, 196, 107, 0.2);
    color: #ffc46b;
  }
  &.tie {
    background: rgba(240, 198, 116, 0.22);
    color: #f0c674;
  }
}

.pay {
  font-size: 11px;
  font-weight: 700;
  color: #f0c674;
}

.outcome {
  margin-top: 14px;
  text-align: center;
  font-size: 13px;
  font-weight: 800;
  padding: 7px;
  border-radius: 8px;

  &.won {
    background: rgba(61, 220, 151, 0.18);
    color: #3ddc97;
  }

  &.lost {
    background: rgba(255, 95, 122, 0.15);
    color: #ff8fa3;
  }
}

/* --- controls ------------------------------------------------------------ */
.ctrl {
  background: #2a0c18;
  border: 1px solid #8a2f4a;
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #ffd9e2;
}

.label {
  font-size: 11px;
  color: #d09aae;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1a0d16;
  border: 1px solid #8a2f4a;
  border-radius: 999px;
  padding: 4px 8px;
}

.rnd {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #4d1a2f;
  color: #ffd9e2;
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
  background: #3a1424;
  border: 1px solid #8a2f4a;
  color: #d09aae;
  font-size: 12px;
  font-weight: 700;

  &.on {
    background: #f0c674;
    color: #2a0c18;
    border-color: #f0c674;
  }
}

.bets {
  display: grid;
  grid-template-columns: 1fr 0.8fr 1fr;
  gap: 8px;
}

.bet {
  height: 56px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: #2a0c18;

  .lbl {
    font-size: 13px;
    letter-spacing: 1px;
  }

  small {
    font-size: 11px;
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.55;
  }
}

.b-dragon {
  background: linear-gradient(180deg, #ff8a8a, #e05a5a);
}
.b-tiger {
  background: linear-gradient(180deg, #ffc46b, #e09a30);
}
.b-tie {
  background: linear-gradient(180deg, #f0c674, #cfa347);
}

.note {
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: #b07f92;
}

/* --- history ------------------------------------------------------------- */
.hist {
  background: #2a0c18;
  border: 1px solid #8a2f4a;
  border-radius: 14px;
  padding: 12px;
  color: #ffd9e2;
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
  border-bottom: 1px solid rgba(138, 47, 74, 0.5);
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;

  &:last-child {
    border-bottom: 0;
  }
}

.faint {
  color: #b07f92;
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
  background: rgba(26, 13, 22, 0.97);
  border: 1px solid #8a2f4a;
  color: #ffd9e2;
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 13px;
  z-index: 200;
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
