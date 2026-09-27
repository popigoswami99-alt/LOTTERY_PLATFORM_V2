<template>
  <main class="extra-game">
    <header class="game-head">
      <button @click="$router.back()">← Back</button>
      <div>
        <h1>{{ title }}</h1>
        <small>Virtual credits • Transparent simulation</small>
      </div>
    </header>

    <section class="card">
      <div class="round">
        <span>Room</span>
        <strong>{{ roomKey }}</strong>
      </div>

      <div v-if="loading">Loading game…</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <template v-else>
        <div class="result">
          <small>Latest result</small>
          <strong>{{ latestResult }}</strong>
        </div>

        <label>Selection</label>
        <select v-model="selection">
          <option v-for="x in selections" :key="x" :value="x">{{ x }}</option>
        </select>

        <label>Virtual stake</label>
        <input v-model="unitAmount" type="number" min="1" step="1">

        <button class="bet" :disabled="betting" @click="placeBet">
          {{ betting ? 'Placing…' : 'Place Virtual Bet' }}
        </button>

        <p v-if="message" class="message">{{ message }}</p>

        <div class="balance">
          Balance: <strong>{{ balance }}</strong>
        </div>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const props = defineProps<{ gameCode?: string }>()
const gameCode = String((props.gameCode || route.query.gameCode || route.params.gameCode || location.pathname.split('/').pop() || '')).toUpperCase().replace('TEEN-PATTI','TEEN_PATTI')

const meta: Record<string, {title:string; room:string; selections:string[]}> = {
  ROULETTE: {
    title: 'Roulette',
    room: 'ROULETTE_1M',
    selections: ['NUMBER:0','NUMBER:1','NUMBER:7','NUMBER:17','NUMBER:36','COLOR:RED','COLOR:BLACK','COLOR:GREEN']
  },
  BLACKJACK: {
    title: 'Blackjack',
    room: 'BLACKJACK_1M',
    selections: ['RESULT:PLAYER','RESULT:DEALER','RESULT:TIE']
  },
  TEEN_PATTI: {
    title: 'Teen Patti',
    room: 'TEEN_PATTI_1M',
    selections: ['RESULT:PLAYER','RESULT:BANKER','RESULT:TIE']
  },
  SLOTS: {
    title: 'Slots',
    room: 'SLOTS_1M',
    selections: ['SYMBOL:CHERRY','SYMBOL:LEMON','SYMBOL:BELL','SYMBOL:STAR','SYMBOL:SEVEN']
  },
  FISHING: {
    title: 'Fishing',
    room: 'FISHING_1M',
    selections: ['TARGET:FISH_1','TARGET:FISH_2','TARGET:FISH_3','TARGET:FISH_4','TARGET:FISH_5']
  }
}

const cfg = meta[gameCode] || meta.SLOTS
const title = cfg.title
const roomKey = cfg.room
const selections = cfg.selections

const loading = ref(true)
const betting = ref(false)
const error = ref('')
const message = ref('')
const balance = ref('0')
const latestResult = ref('—')
const selection = ref(selections[0])
const unitAmount = ref('100')

function token() {
  return localStorage.getItem('accessToken') ||
         localStorage.getItem('access_token') ||
         localStorage.getItem('token') || ''
}

async function api(path:string, options:RequestInit={}) {
  const t = token()
  const headers:any = {'Content-Type':'application/json', ...(options.headers || {})}
  if (t) headers.Authorization = `Bearer ${t}`
  const r = await fetch(path, {...options, headers})
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`)
  return j
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const state = await api(`/api/rooms/${roomKey}/state`)
    const d = state?.data || state
    latestResult.value =
      d?.result?.primary ??
      d?.result?.value ??
      d?.primary ??
      '—'

    try {
      const me = await api('/api/auth/me')
      const u = me?.data?.user || me?.user || me?.data || {}
      balance.value = String(u?.balance ?? u?.walletBalance ?? balance.value)
    } catch {}
  } catch (e:any) {
    error.value = e?.message || 'Unable to load game'
  } finally {
    loading.value = false
  }
}

async function placeBet() {
  betting.value = true
  message.value = ''
  error.value = ''
  try {
    const [betType, pick] = selection.value.split(':')
    const amount = String(Math.max(1, Math.floor(Number(unitAmount.value) || 1)))
    await api(`/api/rooms/${roomKey}/bet`, {
      method: 'POST',
      body: JSON.stringify({
        betType,
        selection: pick,
        unitAmount: amount,
        multiplier: 1
      })
    })
    message.value = 'Virtual bet placed successfully.'
    await load()
  } catch (e:any) {
    error.value = e?.message || 'Bet failed'
  } finally {
    betting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.extra-game{max-width:760px;margin:0 auto;padding:20px}
.game-head{display:flex;gap:14px;align-items:center;margin-bottom:20px}
.game-head button{padding:10px 14px}
h1{margin:0}
.card{background:#1b1b1f;border-radius:18px;padding:20px}
.round,.result,.balance{padding:14px;margin-bottom:14px;background:#25252b;border-radius:12px}
.round span,.result small{display:block;opacity:.7}
.result strong{display:block;font-size:28px;margin-top:6px}
label{display:block;margin:14px 0 7px}
select,input{width:100%;padding:13px;border-radius:10px;border:1px solid #555;background:#111;color:#fff;box-sizing:border-box}
.bet{width:100%;margin-top:18px;padding:14px;border:0;border-radius:12px;font-weight:700}
.error{padding:12px;background:#401f1f;border-radius:10px}
.message{padding:12px;background:#203b27;border-radius:10px}
</style>
