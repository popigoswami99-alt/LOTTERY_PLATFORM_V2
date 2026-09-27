<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  title?: string
  quickAmounts?: number[]
  disabled?: boolean
  showAutoCashout?: boolean
}>(), {
  title: 'Virtual Bet',
  quickAmounts: () => [10, 50, 100, 500],
  disabled: false,
  showAutoCashout: false,
})

const emit = defineEmits<{
  play: [payload: {
    amount: number
    autoCashout?: number
  }]
}>()

const amount = ref(props.quickAmounts[0] ?? 10)
const autoCashout = ref(2)
const enabledAuto = ref(false)

const canPlay = computed(() =>
  !props.disabled &&
  Number.isFinite(Number(amount.value)) &&
  Number(amount.value) > 0
)

function play() {
  if (!canPlay.value) return

  emit('play', {
    amount: Number(amount.value),
    ...(props.showAutoCashout && enabledAuto.value
      ? { autoCashout: Number(autoCashout.value) }
      : {}),
  })
}
</script>

<template>
  <section class="lp-originals-control">
    <div class="lp-originals-head">
      <strong>{{ title }}</strong>
      <span>TEST CREDITS</span>
    </div>

    <div class="lp-quick">
      <button
        v-for="value in quickAmounts"
        :key="value"
        type="button"
        :class="{ active: amount === value }"
        :disabled="disabled"
        @click="amount = value"
      >
        {{ value }}
      </button>
    </div>

    <label class="lp-amount">
      <span>Amount</span>
      <input
        v-model.number="amount"
        type="number"
        min="1"
        step="1"
        inputmode="numeric"
        :disabled="disabled"
      >
    </label>

    <label v-if="showAutoCashout" class="lp-auto">
      <input v-model="enabledAuto" type="checkbox" :disabled="disabled">
      <span>Auto Cashout</span>

      <input
        v-if="enabledAuto"
        v-model.number="autoCashout"
        class="lp-auto-value"
        type="number"
        min="1.01"
        step="0.01"
        :disabled="disabled"
      >
    </label>

    <button
      class="lp-play"
      type="button"
      :disabled="!canPlay"
      @click="play"
    >
      Play Virtual Round
    </button>

    <small>
      Virtual/test credits only • No deposit • No withdrawal
    </small>
  </section>
</template>

<style scoped>
.lp-originals-control{
  width:100%;
  max-width:100%;
  min-width:0;
  box-sizing:border-box;
  background:#18191e;
  border:1px solid #30313a;
  border-radius:16px;
  padding:14px;
  color:#fff;
}

.lp-originals-head{
  display:flex;
  justify-content:space-between;
  gap:10px;
  margin-bottom:12px;
}

.lp-originals-head span,
.lp-originals-control>small{
  color:#9094a1;
  font-size:11px;
}

.lp-quick{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:8px;
}

.lp-quick button{
  min-height:44px;
  min-width:0;
  border:1px solid #34353e;
  border-radius:10px;
  background:#24262d;
  color:#fff;
}

.lp-quick button.active{
  border-color:#f0b90b;
  background:#302a15;
}

.lp-amount{
  display:block;
  margin-top:12px;
}

.lp-amount span{
  display:block;
  margin-bottom:6px;
  font-size:12px;
  color:#a2a5af;
}

.lp-amount input,
.lp-auto-value{
  width:100%;
  box-sizing:border-box;
  min-height:44px;
  border:1px solid #353640;
  border-radius:10px;
  background:#22242a;
  color:#fff;
  padding:0 12px;
  font-size:16px;
}

.lp-auto{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:8px;
  margin-top:12px;
  font-size:13px;
}

.lp-auto-value{
  width:100px;
}

.lp-play{
  width:100%;
  min-height:46px;
  margin-top:12px;
  border:0;
  border-radius:11px;
  background:#f0b90b;
  color:#111;
  font-weight:700;
}

.lp-play:disabled{
  opacity:.45;
}

.lp-originals-control>small{
  display:block;
  text-align:center;
  margin-top:9px;
}

@media(max-width:500px){
  .lp-quick{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }

  .lp-auto-value{
    width:100%;
  }
}
</style>
