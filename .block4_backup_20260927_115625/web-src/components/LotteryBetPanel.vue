<script setup lang="ts">
import { computed, ref } from 'vue'

type Selection = {
  value: string
  label?: string
  multiplier?: number
  type?: string
}

const props = withDefaults(defineProps<{
  title?: string
  selections?: Selection[]
  unitAmounts?: number[]
  disabled?: boolean
}>(), {
  title: 'Place virtual bet',
  selections: () => [],
  unitAmounts: () => [10, 50, 100, 500],
  disabled: false,
})

const emit = defineEmits<{
  submit: [payload: {
    selection: string
    unitAmount: number
    multiplier: number
  }]
}>()

const selected = ref('')
const amount = ref(props.unitAmounts[0] ?? 10)

const selectedItem = computed(() =>
  props.selections.find(x => x.value === selected.value)
)

function submit() {
  if (props.disabled || !selected.value) return

  emit('submit', {
    selection: selected.value,
    unitAmount: Number(amount.value),
    multiplier: Number(selectedItem.value?.multiplier ?? 1),
  })
}
</script>

<template>
  <section class="lp-lottery-bet-panel">
    <div class="lp-bet-head">
      <strong>{{ title }}</strong>
      <small>TEST CREDITS</small>
    </div>

    <div class="lp-selection-grid">
      <button
        v-for="item in selections"
        :key="item.value"
        type="button"
        :class="{ active: selected === item.value }"
        :disabled="disabled"
        @click="selected = item.value"
      >
        {{ item.label || item.value }}
        <small v-if="item.multiplier">
          ×{{ item.multiplier }}
        </small>
      </button>
    </div>

    <div class="lp-amount-grid">
      <button
        v-for="value in unitAmounts"
        :key="value"
        type="button"
        :class="{ active: amount === value }"
        :disabled="disabled"
        @click="amount = value"
      >
        {{ value }}
      </button>
    </div>

    <button
      class="lp-confirm"
      type="button"
      :disabled="disabled || !selected"
      @click="submit"
    >
      Confirm Virtual Bet
    </button>

    <div class="lp-bet-note">
      Virtual/test credits only • No deposit • No withdrawal
    </div>
  </section>
</template>

<style scoped>
.lp-lottery-bet-panel{
  width:100%;
  max-width:100%;
  box-sizing:border-box;
  background:#191a1f;
  border:1px solid #30313a;
  border-radius:16px;
  padding:14px;
  color:#fff;
  overflow:hidden;
}

.lp-bet-head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:10px;
  margin-bottom:12px;
}

.lp-bet-head small,
.lp-bet-note{
  color:#9296a3;
  font-size:11px;
}

.lp-selection-grid{
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:8px;
}

.lp-selection-grid button,
.lp-amount-grid button{
  min-width:0;
  min-height:44px;
  border:1px solid #353640;
  border-radius:10px;
  background:#23252c;
  color:#fff;
}

.lp-selection-grid button.active,
.lp-amount-grid button.active{
  border-color:#f0b90b;
  background:#302a15;
}

.lp-selection-grid button small{
  display:block;
  opacity:.65;
  font-size:10px;
}

.lp-amount-grid{
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:8px;
  margin-top:12px;
}

.lp-confirm{
  width:100%;
  min-height:46px;
  margin-top:12px;
  border:0;
  border-radius:11px;
  background:#f0b90b;
  color:#111;
  font-weight:700;
}

.lp-confirm:disabled{
  opacity:.45;
}

.lp-bet-note{
  text-align:center;
  margin-top:9px;
}

@media(max-width:600px){
  .lp-selection-grid{
    grid-template-columns:repeat(3,minmax(0,1fr));
  }

  .lp-amount-grid{
    grid-template-columns:repeat(3,minmax(0,1fr));
  }
}
</style>
