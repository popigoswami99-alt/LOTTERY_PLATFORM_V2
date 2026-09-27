<script setup lang="ts">
withDefaults(defineProps<{
  results?: Array<Record<string, any>>
  bets?: Array<Record<string, any>>
}>(), {
  results: () => [],
  bets: () => [],
})
</script>

<template>
  <section class="lp-history">
    <div class="lp-tabs">
      <span class="active">Results</span>
      <span>My Bets</span>
      <span>Rules</span>
    </div>

    <div v-if="results.length" class="lp-results">
      <div
        v-for="(item,index) in results.slice(0,20)"
        :key="item.periodNo || item.period || index"
        class="lp-result-row"
      >
        <span>
          {{ item.periodNo || item.period || '—' }}
        </span>

        <strong>
          {{ item.result ?? item.number ?? item.value ?? '—' }}
        </strong>
      </div>
    </div>

    <div v-else class="lp-empty">
      Result history will appear here.
    </div>
  </section>
</template>

<style scoped>
.lp-history{
  width:100%;
  max-width:100%;
  box-sizing:border-box;
  background:#18191e;
  border:1px solid #2c2d34;
  border-radius:14px;
  overflow:hidden;
  color:#fff;
}

.lp-tabs{
  display:flex;
  gap:20px;
  padding:12px 14px;
  border-bottom:1px solid #2b2c32;
  font-size:13px;
}

.lp-tabs .active{
  font-weight:700;
}

.lp-result-row{
  display:flex;
  justify-content:space-between;
  gap:10px;
  padding:10px 14px;
  border-bottom:1px solid #25262c;
  font-size:12px;
}

.lp-empty{
  padding:18px;
  color:#8f93a0;
  font-size:12px;
}
</style>
