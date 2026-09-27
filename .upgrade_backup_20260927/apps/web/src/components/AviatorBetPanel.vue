<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatMinor, formatX100, parseMultiplier } from '@lp/shared';
import { useCrashStore } from '@/stores/crash';

/**
 * One of the two independent bet panels.
 *
 * Each panel owns its own stake, its own auto settings and its own bet on the
 * round — the server tracks them as separate slots, so the two never interfere.
 */
const props = defineProps<{ slot: number }>();
const emit = defineEmits<{ notify: [msg: string] }>();

const crash = useCrashStore();

const QUICK = [1_000n, 10_000n, 50_000n, 100_000n]; // ₹10 / 100 / 500 / 1000

/** Table minimum is ₹10 — the server rejects anything below it. */
const MIN_STAKE = 1_000n;
const STEP = 1_000n;

const mode = ref<'bet' | 'auto'>('bet');
const stake = ref(MIN_STAKE);
const autoCashEnabled = ref(false);
const autoCashText = ref('2.00');
const autoBet = ref(false);
const busy = ref(false);

const myBet = computed(() => crash.slots[props.slot]);
const canCash = computed(() => crash.canCashOut(props.slot));
const hasBet = computed(() => crash.hasBet(props.slot));

/** Live value of this panel's stake at the current multiplier. */
const liveValue = computed(() => {
  if (!myBet.value) return 0n;
  const m = myBet.value.cashedOutX100 ?? crash.multiplierX100;
  return (BigInt(myBet.value.stake) * 98n * BigInt(m)) / (100n * 100n);
});

function bump(dir: 1 | -1) {
  const next = stake.value + STEP * BigInt(dir);
  stake.value = next < MIN_STAKE ? MIN_STAKE : next;
}

async function place() {
  busy.value = true;
  try {
    let auto: number | null = null;
    if (autoCashEnabled.value || mode.value === 'auto') {
      auto = parseMultiplier(autoCashText.value);
      if (auto <= 100) throw new Error('Auto cash out must be above 1.00x');
    }
    await crash.placeBet(props.slot, stake.value.toString(), auto);
    emit('notify', `Bet placed on panel ${props.slot}`);
  } catch (err) {
    emit('notify', errText(err));
  } finally {
    busy.value = false;
  }
}

async function cash() {
  busy.value = true;
  try {
    const r = await crash.cashOut(props.slot);
    emit('notify', `Cashed out ${formatX100(r.multiplierX100)}x — ₹${formatMinor(r.payout)}`);
  } catch (err) {
    emit('notify', errText(err));
  } finally {
    busy.value = false;
  }
}

function errText(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = err as { response?: { data?: { message?: string } } };
    return r.response?.data?.message ?? 'Something went wrong';
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}

/**
 * Auto-bet: when a new betting window opens and this panel is armed, place the
 * bet again automatically.
 */
watch(
  () => crash.roundNo,
  () => {
    if (autoBet.value && crash.isWaiting && !hasBet.value && !busy.value) void place();
  },
);
</script>

<template>
  <div class="panel">
    <div class="mode">
      <button :class="{ on: mode === 'bet' }" @click="mode = 'bet'">Bet</button>
      <button :class="{ on: mode === 'auto' }" @click="mode = 'auto'">Auto</button>
    </div>

    <div class="body">
      <div class="left">
        <div class="stepper">
          <button class="rnd" :disabled="hasBet || stake <= MIN_STAKE" @click="bump(-1)">−</button>
          <span class="val mono">{{ formatMinor(stake) }}</span>
          <button class="rnd" :disabled="hasBet" @click="bump(1)">+</button>
        </div>
        <div class="minnote">min {{ formatMinor(MIN_STAKE).replace('.00', '') }} INR</div>
        <div class="quick">
          <button
            v-for="q in QUICK"
            :key="q.toString()"
            :disabled="hasBet"
            @click="stake = q"
          >
            {{ formatMinor(q).replace('.00', '') }}
          </button>
        </div>
      </div>

      <div class="right">
        <!-- Cash out -->
        <button v-if="canCash" class="act cashout" :disabled="busy" @click="cash">
          <span class="lbl">CASH OUT</span>
          <span class="amt">{{ formatMinor(liveValue) }} INR</span>
        </button>

        <!-- Waiting for the round to end, already cashed or busted -->
        <button
          v-else-if="hasBet"
          class="act waiting"
          disabled
        >
          <span v-if="myBet?.cashedOutX100" class="lbl">
            WON {{ formatX100(myBet.cashedOutX100) }}x
          </span>
          <span v-else-if="crash.isCrashed" class="lbl">LOST</span>
          <span v-else class="lbl">WAITING</span>
          <span class="amt">{{ formatMinor(myBet?.payout ?? '0') }} INR</span>
        </button>

        <!-- Place a bet -->
        <button
          v-else
          class="act bet"
          :disabled="busy || !crash.isWaiting"
          @click="place"
        >
          <span class="lbl">BET</span>
          <span class="amt">{{ formatMinor(stake) }} INR</span>
        </button>
      </div>
    </div>

    <div v-if="mode === 'auto'" class="auto-row">
      <label class="tick">
        <input v-model="autoBet" type="checkbox" />
        <span>Auto Bet</span>
      </label>
      <label class="tick">
        <input v-model="autoCashEnabled" type="checkbox" />
        <span>Auto Cash Out</span>
      </label>
      <input v-model="autoCashText" class="auto-in mono" :disabled="!autoCashEnabled" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.panel {
  background: #1b1b1b;
  border: 1px solid #2c2c2c;
  border-radius: 12px;
  padding: 10px;
}

.mode {
  display: flex;
  width: 160px;
  margin: 0 auto 10px;
  background: #141414;
  border-radius: 999px;
  padding: 2px;

  button {
    flex: 1;
    height: 24px;
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

.body {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: 8px;
  align-items: center;
}

.stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  background: #0f0f0f;
  border: 1px solid #2c2c2c;
  border-radius: 999px;
  padding: 3px 6px;
  margin-bottom: 6px;
}

.rnd {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #2c2c2c;
  color: #bdbdbd;
  font-size: 15px;
  line-height: 1;
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
  color: #fff;
}

.minnote {
  text-align: center;
  font-size: 10px;
  color: #6d6d6d;
  margin: -3px 0 5px;
}

.quick {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;

  button {
    height: 22px;
    border-radius: 999px;
    background: #232323;
    border: 1px solid #2f2f2f;
    color: #9a9a9a;
    font-size: 11px;
    font-weight: 600;

    &:disabled {
      opacity: 0.4;
    }
  }
}

.act {
  width: 100%;
  min-height: 78px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  border: 2px solid rgba(255, 255, 255, 0.25);

  .lbl {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .amt {
    font-size: 19px;
    font-weight: 800;
  }

  &:disabled {
    opacity: 0.65;
  }
}

.bet {
  background: linear-gradient(180deg, #4bbd3f, #2e8c25);
}

.cashout {
  background: linear-gradient(180deg, #f5a623, #e08a00);
}

.waiting {
  background: linear-gradient(180deg, #3a3a3a, #2a2a2a);
  border-color: rgba(255, 255, 255, 0.12);
}

.auto-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #2c2c2c;
}

.tick {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #9a9a9a;

  input {
    accent-color: #4bbd3f;
  }
}

.auto-in {
  width: 60px;
  height: 24px;
  margin-left: auto;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid #2c2c2c;
  background: #0f0f0f;
  color: #fff;
  outline: none;
  font-size: 12px;

  &:disabled {
    opacity: 0.4;
  }
}
</style>

/* LOTTERY_RESPONSIVE_AVIATOR */
@media (min-width: 769px) {
  .bet-panel,
  .panel,
  .aviator-bet-panel {
    width: min(100%, 620px);
    margin-left: auto;
    margin-right: auto;
  }
}

@media (max-width: 768px) {
  .bet-panel,
  .panel,
  .aviator-bet-panel {
    width: 100%;
    max-width: 100%;
  }
}
