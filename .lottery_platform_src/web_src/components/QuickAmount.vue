
<template>
  <div class="qa">
    <button v-for="n in amounts" :key="n" type="button" @click="$emit('select',n)">
      {{ n }}
    </button>
  </div>
</template>
<script setup lang="ts">
defineProps<{amounts?:number[]}>()
defineEmits(['select'])
</script>
<style scoped>
.qa{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;width:100%;min-width:0}
.qa button{min-width:0;border:1px solid #34343d;background:#222229;color:#fff;border-radius:7px;padding:8px 4px;font-size:12px}
</style>
