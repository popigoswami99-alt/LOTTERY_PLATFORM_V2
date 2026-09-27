<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, apiError } from '@/api/client'

const tab = ref('overview')
const loading = ref(false)
const message = ref('')
const overview = ref<any>(null)
const history = ref<any[]>([])
const giftCode = ref('')
const promoLevel = ref(1)
const promoBox = ref(1)

const tabs = [
  ['overview','Rewards'],
  ['checkin','Daily'],
  ['vip','VIP'],
  ['wheel','Wheel'],
  ['promotions','Promotions'],
  ['gift','Gift Code'],
  ['history','History']
]

function money(v:any) {
  try { return (Number(BigInt(String(v ?? '0'))) / 100).toFixed(2) }
  catch { return '0.00' }
}

function notify(v:string) {
  message.value = v
  setTimeout(() => message.value = '', 2500)
}

async function load() {
  loading.value = true
  try {
    const [o,h] = await Promise.all([
      api.get('/activity/overview'),
      api.get('/activity/bonus-history?take=100')
    ])
    overview.value = o.data.data
    history.value = h.data.data
  } catch(e) {
    notify(apiError(e))
  } finally {
    loading.value = false
  }
}

async function claim(path:string, body?:any) {
  loading.value = true
  try {
    await api.post(path, body)
    notify('Reward claimed successfully')
    await load()
  } catch(e) {
    notify(apiError(e))
  } finally {
    loading.value = false
  }
}

async function redeemGift() {
  if (!giftCode.value.trim()) return
  await claim('/activity/gift', { code: giftCode.value.trim() })
  giftCode.value = ''
}

const checkin = computed(() => overview.value?.checkin)
const wheel = computed(() => overview.value?.wheel)

onMounted(load)
</script>

<template>
  <section class="rewards">

    <div class="virtual-banner">
      <b>VIRTUAL REWARDS</b>
      <small>No real-money deposits, withdrawals or recharge</small>
    </div>

    <div class="tabs">
      <button
        v-for="t in tabs"
        :key="t[0]"
        :class="{active:tab===t[0]}"
        @click="tab=t[0]"
      >{{t[1]}}</button>
    </div>

    <div v-if="loading" class="loading">Processing reward...</div>

    <template v-if="tab==='overview' && overview">
      <div class="hero">
        <small>Today's rewards</small>
        <strong>₹{{money(overview.todayBonus)}}</strong>
        <span>Total earned ₹{{money(overview.totalBonus)}}</span>
      </div>

      <div class="grid">
        <button @click="tab='checkin'">
          <b>Daily Check-in</b>
          <small>Claim daily virtual reward</small>
        </button>

        <button @click="tab='vip'">
          <b>VIP Rewards</b>
          <small>Level rewards</small>
        </button>

        <button @click="tab='wheel'">
          <b>Invite Wheel</b>
          <small>{{wheel?.available ?? 0}} spins</small>
        </button>

        <button @click="tab='promotions'">
          <b>Promotion Boxes</b>
          <small>Eligibility rewards</small>
        </button>

        <button @click="tab='gift'">
          <b>Gift Code</b>
          <small>Redeem code</small>
        </button>

        <button @click="tab='history'">
          <b>Reward History</b>
          <small>{{history.length}} records</small>
        </button>
      </div>
    </template>

    <template v-if="tab==='checkin' && checkin">
      <div class="card">
        <h3>Daily Check-in</h3>
        <p>Streak: <b>{{checkin.streak}}</b></p>

        <div class="row">
          <div v-for="x in checkin.ladder" :key="x.day">
            <b>Day {{x.day}}</b>
            <small>₹{{money(x.amount)}}</small>
          </div>
        </div>

        <button
          class="primary"
          :disabled="checkin.claimedToday"
          @click="claim('/activity/checkin')"
        >
          {{checkin.claimedToday ? 'Claimed Today' : 'Claim Daily Reward'}}
        </button>
      </div>
    </template>

    <template v-if="tab==='vip'">
      <div class="card">
        <h3>VIP Rewards</h3>
        <p>Virtual turnover based rewards.</p>
        <button class="primary" @click="claim('/activity/vip/claim')">
          Claim Available VIP Rewards
        </button>
      </div>
    </template>

    <template v-if="tab==='wheel' && wheel">
      <div class="card">
        <h3>Invite Wheel</h3>
        <p>Available spins: <b>{{wheel.available}}</b></p>

        <button
          class="primary"
          :disabled="wheel.available<=0"
          @click="claim('/activity/wheel/spin')"
        >
          Spin Wheel
        </button>
      </div>
    </template>

    <template v-if="tab==='promotions'">
      <div class="card">
        <h3>Promotion Boxes</h3>
        <p>Virtual rewards unlock after their requirements are met.</p>

        <label>Level</label>
        <select v-model.number="promoLevel">
          <option :value="1">Level 1</option>
          <option :value="2">Level 2</option>
          <option :value="3">Level 3</option>
        </select>

        <label>Box</label>
        <select v-model.number="promoBox">
          <option v-for="n in 19" :key="n" :value="n">Box {{n}}</option>
        </select>

        <button
          class="primary"
          @click="claim('/activity/promotions/claim',{
            level:promoLevel,
            boxGroup:promoBox
          })"
        >
          Check & Claim
        </button>
      </div>
    </template>

    <template v-if="tab==='gift'">
      <div class="card">
        <h3>Gift Code</h3>

        <input
          v-model="giftCode"
          maxlength="32"
          placeholder="Enter gift code"
          @keyup.enter="redeemGift"
        />

        <button class="primary" @click="redeemGift">
          Redeem
        </button>
      </div>
    </template>

    <template v-if="tab==='history'">
      <div class="card">
        <h3>Reward History</h3>

        <div v-if="!history.length">No rewards yet.</div>

        <div v-for="r in history" :key="r.id" class="history">
          <span>
            <b>{{r.type}}</b>
            <small>{{r.scope}}</small>
          </span>
          <strong>+₹{{money(r.amount)}}</strong>
        </div>
      </div>
    </template>

    <div v-if="message" class="toast">{{message}}</div>
  </section>
</template>

<style scoped>
.rewards{display:flex;flex-direction:column;gap:12px;padding:12px}
.virtual-banner,.card,.hero{background:#20242d;border:1px solid #343a45;border-radius:14px;padding:15px}
.virtual-banner{display:flex;flex-direction:column;gap:4px}
.virtual-banner small{opacity:.65}
.tabs{display:flex;gap:6px;overflow-x:auto}
.tabs button{min-height:40px;min-width:78px;border:0;border-radius:10px;background:#292e38;color:inherit}
.tabs button.active{background:var(--primary,#4d7cff);color:white}
.hero{text-align:center;display:flex;flex-direction:column;gap:5px}
.hero strong{font-size:30px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.grid button{min-height:85px;text-align:left;border:0;border-radius:14px;padding:14px;background:#20242d;color:inherit}
.grid small{display:block;opacity:.65;margin-top:5px}
.primary{width:100%;min-height:46px;margin-top:12px;border:0;border-radius:12px;background:var(--primary,#4d7cff);color:white;font-weight:800}
.primary:disabled{opacity:.4}
.row{display:flex;gap:7px;overflow-x:auto}
.row>div{min-width:70px;padding:9px;border-radius:10px;background:#292e38}
.row small{display:block;margin-top:4px}
label{display:block;margin-top:10px;margin-bottom:5px;font-size:12px;opacity:.7}
select,input{width:100%;min-height:44px;box-sizing:border-box;border-radius:10px;border:1px solid #424957;background:#171a20;color:inherit;padding:0 12px}
.history{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid #343a45}
.history small{display:block;opacity:.5}
.history strong{color:#4ade80}
.loading{text-align:center;padding:15px;opacity:.65}
.toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);padding:10px 16px;border-radius:999px;background:#11151c;border:1px solid #424957;z-index:999}
</style>
