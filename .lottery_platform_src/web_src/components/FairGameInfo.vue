
<template>
  <section class="fair">
    <div class="head">
      <strong>{{ title }}</strong>
      <span>VIRTUAL / TEST CREDITS</span>
    </div>
    <div class="grid">
      <div><small>Round</small><b>{{ round || '-' }}</b></div>
      <div><small>Server Seed Hash</small><b>{{ hash || '-' }}</b></div>
      <div><small>Client Seed</small><b>{{ clientSeed || '-' }}</b></div>
      <div><small>Nonce</small><b>{{ nonce ?? '-' }}</b></div>
    </div>
    <button type="button" @click="verify">Verify Fairness</button>
    <p v-if="verified" class="ok">Verification data ready for independent checking.</p>
  </section>
</template>
<script setup lang="ts">
import {ref} from 'vue'
defineProps<{title?:string;round?:string;hash?:string;clientSeed?:string;nonce?:number}>()
const verified=ref(false)
function verify(){verified.value=true}
</script>
<style scoped>
.fair{margin-top:10px;padding:12px;background:#17171b;border:1px solid #2b2b32;border-radius:10px;color:#fff}
.head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.head span{font-size:10px;color:#7dd3fc}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:10px 0}
.grid div{background:#222229;padding:8px;border-radius:7px;min-width:0}
small{display:block;color:#888;font-size:10px}
b{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis}
button{border:0;border-radius:7px;padding:9px 12px;background:#30303a;color:#fff}
.ok{font-size:11px;color:#4ade80}
</style>
