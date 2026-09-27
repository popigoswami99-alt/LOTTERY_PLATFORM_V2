
<template>
  <section class="gx">
    <div class="gx-head">
      <button type="button" class="back" @click="$emit('back')">← Back</button>
      <div class="title">
        <strong>{{ title }}</strong>
        <span v-if="live" class="live">● LIVE</span>
      </div>
      <div class="tools">
        <button type="button" @click="sound=!sound">{{ sound ? '🔊' : '🔇' }}</button>
        <button type="button" @click="$emit('rules')">Rules</button>
        <button type="button" @click="$emit('fairness')">Fair</button>
      </div>
    </div>

    <div class="gx-tabs">
      <button v-for="t in tabs" :key="t" type="button"
        :class="{active:modelValue===t}" @click="$emit('update:modelValue',t)">
        {{ t }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
defineProps<{
  title:string
  modelValue?:string
  tabs?:string[]
  live?:boolean
}>()
defineEmits(['update:modelValue','back','rules','fairness'])
const sound=ref(true)
</script>

<style scoped>
.gx{width:100%;max-width:100%;box-sizing:border-box;background:#17171b;color:#fff;border:1px solid #292930;border-radius:12px;overflow:hidden}
.gx-head{display:flex;align-items:center;gap:10px;padding:10px 12px;min-width:0}
.back,.tools button,.gx-tabs button{border:0;background:#24242b;color:#fff;border-radius:8px;padding:8px 10px;cursor:pointer}
.title{flex:1;min-width:0;display:flex;align-items:center;gap:8px;overflow:hidden}
.title strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.live{font-size:10px;color:#4ade80;white-space:nowrap}
.tools{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
.gx-tabs{display:flex;overflow-x:auto;border-top:1px solid #292930}
.gx-tabs button{flex:0 0 auto;border-radius:0;background:transparent}
.gx-tabs button.active{background:#2b2b35}
@media(max-width:600px){
 .gx-head{padding:8px;gap:6px}
 .tools button{font-size:11px;padding:7px}
 .back{font-size:11px;padding:7px}
}
</style>
