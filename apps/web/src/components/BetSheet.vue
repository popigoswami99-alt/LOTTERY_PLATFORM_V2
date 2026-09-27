<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatMinor, oddsLabel as fmtOdds } from '@lp/shared';
import { useGameStore } from '@/stores/game';

const props = defineProps<{
  open: boolean;
  betType: string;
  selection: string;
  submitting: boolean;
  balance: string;
}>();

// Odds come from whichever game owns the current room, never from a hardcoded
// table in the UI — the sheet is shared by every game.
const game = useGameStore();

const emit = defineEmits<{
  close: [];
  confirm: [payload: { unitAmount: string; multiplier: number }];
}>();

/** Chip values in minor units — ₹1, ₹10, ₹100, ₹1,000. */
const CHIPS = [100n, 1_000n, 10_000n, 100_000n];
const MULTIPLIERS = [1, 5, 10, 20, 50, 100];

const unitAmount = ref<bigint>(100n);
const multiplier = ref(1);
const agreed = ref(true);

// Reset to a sane default every time the sheet opens.
watch(
  () => props.open,
  (open) => {
    if (open) {
      unitAmount.value = 100n;
      multiplier.value = 1;
      agreed.value = true;
    }
  },
);

const total = computed(() => unitAmount.value * BigInt(multiplier.value));

const oddsLabel = computed(() => {
  const rules = game.rules;
  if (!rules) return '';
  try {
    return fmtOdds(rules.displayOdds(props.betType, props.selection));
  } catch {
    return '';
  }
});

const affordable = computed(() => total.value <= BigInt(props.balance || '0'));
const canSubmit = computed(
  () => agreed.value && affordable.value && !props.submitting && total.value > 0n,
);

const TITLES: Record<string, (sel: string) => string> = {
  NUMBER: (s) => `Number ${s}`,
  SIZE: (s) => (s === 'big' ? 'Big' : 'Small'),
  PARITY: (s) => (s === 'odd' ? 'Odd' : 'Even'),
  TOTAL: (s) => `Total ${s}`,
  TRIPLE_ANY: () => 'Any triple',
  TRIPLE_EXACT: (s) => `Triple ${s}${s}${s}`,
  DOUBLE_EXACT: (s) => `Double ${s}${s}`,
  COMBO: (s) => `Combination ${s.replace(',', ' + ')}`,
};

const title = computed(() => {
  const fn = TITLES[props.betType];
  if (fn) return fn(props.selection);
  return props.selection.charAt(0).toUpperCase() + props.selection.slice(1);
});

const accent = computed(() => {
  if (props.betType === 'COLOUR') {
    return (
      { green: 'var(--green)', red: 'var(--red)', violet: 'var(--violet)' }[props.selection] ??
      'var(--gold)'
    );
  }
  if (props.betType === 'SIZE') return props.selection === 'big' ? 'var(--gold)' : 'var(--violet)';
  if (props.betType === 'PARITY') return props.selection === 'odd' ? 'var(--green)' : 'var(--red)';
  return 'var(--gold)';
});

function submit() {
  if (!canSubmit.value) return;
  emit('confirm', { unitAmount: unitAmount.value.toString(), multiplier: multiplier.value });
}
</script>

<template>
  <teleport to="body">
    <!-- No outer fade transition: the shared `fade` can wedge on rapid
         open/close and leave the backdrop stuck. Toggle it directly; the sheet
         keeps its slide-up entrance. -->
    <div v-if="open" class="backdrop" @click.self="emit('close')">
      <transition name="slide-up" appear>
        <div class="sheet">
            <header class="head" :style="{ background: accent }">
              <span>{{ game.rules?.label ?? '' }}</span>
              <strong>{{ title }}</strong>
            </header>

            <div class="body">
              <div class="line">
                <span class="label">Balance</span>
                <div class="chips">
                  <button
                    v-for="c in CHIPS"
                    :key="c.toString()"
                    class="chip"
                    :class="{ on: unitAmount === c }"
                    @click="unitAmount = c"
                  >
                    {{ formatMinor(c).replace('.00', '') }}
                  </button>
                </div>
              </div>

              <div class="line">
                <span class="label">Quantity</span>
                <div class="qty">
                  <button class="step" @click="multiplier = Math.max(1, multiplier - 1)">−</button>
                  <span class="qty-val mono">{{ multiplier }}</span>
                  <button class="step" @click="multiplier = multiplier + 1">+</button>
                </div>
              </div>

              <div class="chips wrap">
                <button
                  v-for="m in MULTIPLIERS"
                  :key="m"
                  class="chip"
                  :class="{ on: multiplier === m }"
                  @click="multiplier = m"
                >
                  X{{ m }}
                </button>
              </div>

              <label class="agree">
                <input v-model="agreed" type="checkbox" />
                <span>I agree to the <em>pre-sale rules</em></span>
              </label>

              <p v-if="!affordable" class="warn">
                Not enough balance — you have ₹{{ formatMinor(balance) }}
              </p>
            </div>

            <footer class="foot">
              <button class="cancel" @click="emit('close')">Cancel</button>
              <button
                class="ok"
                :style="{ background: accent }"
                :disabled="!canSubmit"
                @click="submit"
              >
                {{ submitting ? 'Placing…' : `Total ₹${formatMinor(total)}` }}
                <small>{{ oddsLabel }}</small>
              </button>
            </footer>
          </div>
        </transition>
      </div>
  </teleport>
</template>

<style scoped lang="scss">
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}

.sheet {
  width: 100%;
  max-width: var(--shell);
  background: #1b1b1f !important;
  opacity: 1 !important;
  border-radius: 16px 16px 0 0;
  overflow: hidden;
  isolation: isolate;
}

.head {
  padding: 14px 16px;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;

  span {
    font-size: 12px;
    opacity: 0.85;
  }
  strong {
    font-size: 17px;
  }
}

.body {
  padding: 14px 16px 4px;
}

.line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.label {
  font-size: 13px;
  color: var(--text-dim);
  flex-shrink: 0;
}

.chips {
  display: flex;
  gap: 6px;

  &.wrap {
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-bottom: 12px;
  }
}

.chip {
  min-width: 44px;
  height: 30px;
  padding: 0 10px;
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

.qty {
  display: flex;
  align-items: center;
  gap: 1px;
}

.step {
  width: 34px;
  height: 30px;
  background: var(--surface-3);
  color: var(--text);
  font-size: 17px;
  font-weight: 700;

  &:first-child {
    border-radius: 6px 0 0 6px;
  }
  &:last-child {
    border-radius: 0 6px 6px 0;
  }
}

.qty-val {
  min-width: 52px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  font-weight: 700;
}

.agree {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 10px;

  input {
    accent-color: var(--gold);
  }

  em {
    color: var(--gold);
    font-style: normal;
  }
}

.warn {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--red);
}

.foot {
  display: grid;
  grid-template-columns: 1fr 2fr;
}

.cancel {
  height: 50px;
  background: var(--surface-3);
  color: var(--text-dim);
  font-weight: 700;
}

.ok {
  height: 50px;
  color: #fff;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  small {
    font-size: 11px;
    opacity: 0.85;
    background: rgba(0, 0, 0, 0.2);
    padding: 1px 6px;
    border-radius: 4px;
  }

  &:disabled {
    opacity: 0.55;
  }
}
</style>

/* LOTTERY_RESPONSIVE_BETSHEET */
@media (min-width: 769px) {
  .sheet {
    width: min(100%, 560px);
    margin: 0 auto;
    border-radius: 16px 16px 0 0;
  }
}

@media (max-width: 768px) {
  .sheet {
    width: 100%;
    max-width: 100%;
    border-radius: 16px 16px 0 0;
  }
}
