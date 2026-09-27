
<template>
  <section class="history">
    <div class="tabs">
      <button v-for="t in tabs" :key="t" type="button"
        :class="{active:active===t}" @click="active=t">{{t}}</button>
    </div>
    <div v-if="active==='History'" class="rows">
      <div v-for="(r,i) in results" :key="i" class="row">
        <span>{{r.period ?? r.id ?? '-'}}</span>
        <strong>{{r.result ?? r.value ?? '-'}}</strong>
      </div>
      <div v-if="!results.length" class="empty">No results yet</div>
    </div>
    <div v-else-if="active==='My Bets'" class="empty">Your virtual bets will appear here.</div>
    <div v-else class="empty">Rules and payout information for this game.</div>
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const props = withDefaults(defineProps<{results?:any[]}>(), { results: () => [] })
const results = props.results
const tabs=['History','My Bets','Rules']
const active=ref('History')
</script>
<style scoped>
.history{margin-top:10px;background:#17171b;border:1px solid #292930;border-radius:10px;overflow:hidden;color:#fff}
.tabs{display:flex;border-bottom:1px solid #292930}
.tabs button{flex:1;border:0;background:transparent;color:#aaa;padding:10px 6px}
.tabs button.active{background:#25252d;color:#fff}
.row{display:flex;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #25252b}
.empty{padding:16px;text-align:center;color:#888}
</style>
