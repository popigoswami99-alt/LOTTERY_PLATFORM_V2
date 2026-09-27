<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { formatMinor } from '@lp/shared';
import { api, apiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

/**
 * Wallet — JazzCash / Easypaisa deposits and withdrawals.
 *
 * Deposit is a direct-debit: the player picks a channel and amount, a payment
 * request is sent to their wallet, and they approve it with their MPIN. No
 * transaction id is ever typed. In sandbox mode the MPIN is entered in the
 * modal here (standing in for the on-phone approval); in live mode it is
 * entered on the handset and this screen polls for the result.
 */

const auth = useAuthStore();

type Channel = 'JAZZCASH' | 'EASYPAISA';
interface Txn {
  id: string; amount: string; balanceAfter: string; type: string; memo: string | null; createdAt: string;
}
interface Withdrawal {
  id: string; channel: Channel; amount: string; accountNumber: string; accountName: string;
  status: string; createdAt: string; reviewNote: string | null;
}
interface Config {
  mode: 'sandbox' | 'live'; channels: Channel[]; minDeposit: string; minWithdraw: string; bonusBps: number;
}

const cfg = ref<Config | null>(null);
const txns = ref<Txn[]>([]);
const withdrawals = ref<Withdrawal[]>([]);
const tab = ref<'deposit' | 'withdraw'>('deposit');
const busy = ref(false);
const msg = ref('');
const err = ref('');

const CHANNELS: Array<{ key: Channel; label: string; tone: string; glyph: string }> = [
  { key: 'JAZZCASH', label: 'JazzCash', tone: 'jc', glyph: 'J' },
  { key: 'EASYPAISA', label: 'Easypaisa', tone: 'ep', glyph: 'e' },
];

function flash(m: string, isErr = false) {
  if (isErr) { err.value = m; msg.value = ''; } else { msg.value = m; err.value = ''; }
  window.setTimeout(() => { msg.value = ''; err.value = ''; }, 3200);
}

async function load() {
  const [c, t, w] = await Promise.all([
    cfg.value ? Promise.resolve({ data: { data: cfg.value } }) : api.get('/payments/config'),
    api.get('/wallet/transactions?take=50'),
    api.get('/payments/withdrawals?take=10'),
  ]);
  cfg.value = c.data.data;
  txns.value = t.data.data;
  withdrawals.value = w.data.data;
  await auth.refreshBalance();
}

// --- deposit ---------------------------------------------------------------
const depChannel = ref<Channel>('JAZZCASH');
const depAmount = ref<number | null>(null);
const depMobile = ref('');
const depCnic = ref('');
const QUICK = [500, 1000, 2000, 5000];

const bonusPreview = computed(() => {
  if (!depAmount.value || !cfg.value) return null;
  const minor = BigInt(Math.round(depAmount.value * 100));
  const bonus = (minor * BigInt(cfg.value.bonusBps)) / 10000n;
  return { deposit: minor, bonus, total: minor + bonus };
});

// MPIN modal state
const order = ref<{ id: string; accountNumber: string; channel: Channel } | null>(null);
const mpin = ref('');
const mpinBusy = ref(false);

async function startDeposit() {
  err.value = '';
  if (!depAmount.value || depAmount.value < Number(cfg.value!.minDeposit) / 100) {
    return flash(`Minimum deposit is ₹${Number(cfg.value!.minDeposit) / 100}`, true);
  }
  if (!/^03\d{9}$/.test(depMobile.value)) return flash('Enter a valid 11-digit mobile (03XXXXXXXXX)', true);
  if (depChannel.value === 'JAZZCASH' && !/^\d{6}$/.test(depCnic.value)) {
    return flash('JazzCash needs the last 6 digits of your CNIC', true);
  }
  busy.value = true;
  try {
    const { data } = await api.post('/payments/deposit', {
      channel: depChannel.value,
      amount: String(Math.round(depAmount.value * 100)),
      accountNumber: depMobile.value,
      ...(depChannel.value === 'JAZZCASH' ? { cnicLast6: depCnic.value } : {}),
    });
    order.value = { id: data.data.id, accountNumber: data.data.accountNumber, channel: data.data.channel };
    mpin.value = '';
  } catch (e) {
    flash(apiError(e), true);
  } finally {
    busy.value = false;
  }
}

async function approveMpin() {
  if (!order.value) return;
  mpinBusy.value = true;
  try {
    const { data } = await api.post(`/payments/deposit/${order.value.id}/confirm`, { mpin: mpin.value });
    if (data.data.status === 'SUCCESS') {
      order.value = null;
      depAmount.value = null;
      await load();
      flash('Deposit successful — coins added to your wallet');
    } else {
      flash('Payment was declined on the wallet', true);
      order.value = null;
    }
  } catch (e) {
    flash(apiError(e), true);
  } finally {
    mpinBusy.value = false;
  }
}

function cancelMpin() { order.value = null; }

// --- withdraw --------------------------------------------------------------
const wdChannel = ref<Channel>('JAZZCASH');
const wdAmount = ref<number | null>(null);
const wdMobile = ref('');
const wdName = ref('');

async function requestWithdraw() {
  err.value = '';
  if (!wdAmount.value || wdAmount.value < Number(cfg.value!.minWithdraw) / 100) {
    return flash(`Minimum withdrawal is ₹${Number(cfg.value!.minWithdraw) / 100}`, true);
  }
  if (BigInt(Math.round(wdAmount.value * 100)) > BigInt(auth.balance)) {
    return flash('Amount exceeds your balance', true);
  }
  if (!/^03\d{9}$/.test(wdMobile.value)) return flash('Enter a valid 11-digit mobile (03XXXXXXXXX)', true);
  if (wdName.value.trim().length < 2) return flash('Enter the account holder name', true);
  busy.value = true;
  try {
    await api.post('/payments/withdraw', {
      channel: wdChannel.value,
      amount: String(Math.round(wdAmount.value * 100)),
      accountNumber: wdMobile.value,
      accountName: wdName.value.trim(),
    });
    wdAmount.value = null;
    await load();
    flash('Withdrawal requested — pending review');
  } catch (e) {
    flash(apiError(e), true);
  } finally {
    busy.value = false;
  }
}

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal', BET_STAKE: 'Bet placed', BET_PAYOUT: 'Winnings',
  BET_REFUND: 'Refund', ADJUSTMENT: 'Adjustment', BONUS_GRANT: 'Bonus',
};
const rupees = (m: string | bigint) => `₹${formatMinor(m)}`;
function fmtDate(s: string) { return new Date(s).toLocaleString(); }

onMounted(load);
</script>

<template>
  <div class="page">
    <section class="hero">
      <span class="dim">Total balance</span>
      <div class="amount mono">₹{{ formatMinor(auth.balance) }}</div>
      <span v-if="cfg?.mode === 'sandbox'" class="mode">SANDBOX</span>
    </section>

    <div class="switch">
      <button :class="{ on: tab === 'deposit' }" @click="tab = 'deposit'">Deposit</button>
      <button :class="{ on: tab === 'withdraw' }" @click="tab = 'withdraw'">Withdraw</button>
    </div>

    <!-- DEPOSIT -->
    <section v-if="tab === 'deposit'" class="card">
      <p class="hint">Choose a wallet, then approve the payment on your phone with your MPIN.</p>

      <div class="channels">
        <button
          v-for="c in CHANNELS" :key="c.key" class="chan" :class="[c.tone, { on: depChannel === c.key }]"
          @click="depChannel = c.key"
        >
          <span class="glyph">{{ c.glyph }}</span>{{ c.label }}
        </button>
      </div>

      <label class="lbl">Amount</label>
      <div class="quick">
        <button v-for="a in QUICK" :key="a" :class="{ on: depAmount === a }" @click="depAmount = a">
          ₹{{ a.toLocaleString('en-IN') }}
        </button>
      </div>
      <div class="field"><span class="pfx">₹</span><input v-model.number="depAmount" type="number" min="0" placeholder="Custom amount" /></div>

      <p v-if="bonusPreview" class="bonus">
        You'll receive <strong class="num">{{ rupees(bonusPreview.deposit) }}</strong>
        + <strong class="num win">{{ rupees(bonusPreview.bonus) }}</strong> bonus
        = <strong class="num">{{ rupees(bonusPreview.total) }}</strong> coins
      </p>

      <label class="lbl">{{ depChannel === 'JAZZCASH' ? 'JazzCash' : 'Easypaisa' }} mobile number</label>
      <div class="field"><input v-model="depMobile" inputmode="numeric" placeholder="03XXXXXXXXX" maxlength="11" /></div>

      <template v-if="depChannel === 'JAZZCASH'">
        <label class="lbl">CNIC (last 6 digits)</label>
        <div class="field"><input v-model="depCnic" inputmode="numeric" placeholder="XXXXXX" maxlength="6" /></div>
      </template>

      <button class="btn btn-primary go" :disabled="busy" @click="startDeposit">
        Send payment request
      </button>
    </section>

    <!-- WITHDRAW -->
    <section v-if="tab === 'withdraw'" class="card">
      <p class="hint">Withdrawals are reviewed before payout. Held funds are refunded if rejected.</p>

      <div class="channels">
        <button
          v-for="c in CHANNELS" :key="c.key" class="chan" :class="[c.tone, { on: wdChannel === c.key }]"
          @click="wdChannel = c.key"
        >
          <span class="glyph">{{ c.glyph }}</span>{{ c.label }}
        </button>
      </div>

      <label class="lbl">Amount <span class="avail">available {{ rupees(auth.balance) }}</span></label>
      <div class="field"><span class="pfx">₹</span><input v-model.number="wdAmount" type="number" min="0" placeholder="Amount to withdraw" /></div>

      <label class="lbl">Receiving mobile number</label>
      <div class="field"><input v-model="wdMobile" inputmode="numeric" placeholder="03XXXXXXXXX" maxlength="11" /></div>

      <label class="lbl">Account holder name</label>
      <div class="field"><input v-model="wdName" placeholder="As registered on the wallet" maxlength="64" /></div>

      <button class="btn btn-primary go" :disabled="busy" @click="requestWithdraw">
        Request withdrawal
      </button>

      <div v-if="withdrawals.length" class="wd-list">
        <strong class="head">Your withdrawals</strong>
        <div v-for="w in withdrawals" :key="w.id" class="wd">
          <div>
            <div class="ttl">{{ w.channel }} · {{ rupees(w.amount) }}</div>
            <div class="tiny faint">{{ w.accountNumber }} · {{ fmtDate(w.createdAt) }}</div>
            <div v-if="w.reviewNote" class="tiny note">“{{ w.reviewNote }}”</div>
          </div>
          <span class="pill" :class="'w-' + w.status.toLowerCase()">{{ w.status }}</span>
        </div>
      </div>
    </section>

    <p v-if="msg" class="banner ok">{{ msg }}</p>
    <p v-if="err" class="banner bad">{{ err }}</p>

    <!-- history -->
    <section class="card">
      <strong class="head">Transaction history</strong>
      <div v-for="t in txns" :key="t.id" class="txn">
        <div>
          <div class="ttl">{{ TYPE_LABEL[t.type] ?? t.type }}</div>
          <div class="tiny faint">{{ fmtDate(t.createdAt) }}</div>
        </div>
        <div class="amt">
          <span :class="BigInt(t.amount) >= 0n ? 'win' : 'loss'">
            {{ BigInt(t.amount) >= 0n ? '+' : '−' }}{{ rupees(BigInt(t.amount) < 0n ? -BigInt(t.amount) : BigInt(t.amount)) }}
          </span>
          <div class="tiny faint mono">bal {{ rupees(t.balanceAfter) }}</div>
        </div>
      </div>
      <p v-if="!txns.length" class="empty">No transactions yet.</p>
    </section>

    <!-- MPIN modal — no transition wrapper: a shared fade transition can wedge
         on rapid open/close and leave the overlay stuck, so toggle it directly. -->
    <div v-if="order" class="scrim" @click.self="cancelMpin">
      <div class="mpin-sheet">
          <div class="mpin-head" :class="order.channel === 'JAZZCASH' ? 'jc' : 'ep'">
            <span class="glyph">{{ order.channel === 'JAZZCASH' ? 'J' : 'e' }}</span>
            {{ order.channel === 'JAZZCASH' ? 'JazzCash' : 'Easypaisa' }}
          </div>
          <p class="mpin-msg">
            A payment request was sent to <strong>{{ order.accountNumber }}</strong>.
            Enter your MPIN to approve.
          </p>
          <input
            v-model="mpin" class="mpin-input mono" inputmode="numeric" maxlength="6"
            type="password" placeholder="• • • •" autofocus
          />
          <p v-if="cfg?.mode === 'sandbox'" class="tiny faint sbx">
            Sandbox: any 4–6 digits approve · <strong>0000</strong> simulates a decline
          </p>
          <div class="mpin-btns">
            <button class="btn btn-ghost" :disabled="mpinBusy" @click="cancelMpin">Cancel</button>
            <button class="btn btn-primary" :disabled="mpinBusy || mpin.length < 4" @click="approveMpin">
              Approve
            </button>
          </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }

.hero {
  position: relative;
  background: linear-gradient(135deg, var(--header-from), var(--header-to));
  border-radius: var(--radius);
  padding: 18px 14px;
  color: #fff;
  box-shadow: var(--shadow-card);
  .dim { color: rgba(255, 255, 255, 0.85); }
  .amount { font-size: 30px; font-weight: 800; margin-top: 4px; }
  .mode {
    position: absolute; top: 12px; right: 12px;
    font-size: 10px; font-weight: 800; letter-spacing: 1px;
    background: rgba(255, 255, 255, 0.25); padding: 3px 8px; border-radius: 999px;
  }
}

.switch {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
  background: var(--surface-2); padding: 4px; border-radius: 999px;
  button {
    height: 38px; border-radius: 999px; font-weight: 700; font-size: 14px; color: var(--text-dim);
    &.on { background: var(--surface); color: var(--primary-deep); box-shadow: var(--shadow-card); }
  }
}

.hint { margin: 0 0 12px; font-size: 12px; color: var(--text-dim); line-height: 1.5; }

.channels { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
.chan {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  height: 48px; border-radius: var(--radius); font-weight: 800; font-size: 14px;
  border: 2px solid var(--line); background: var(--surface); color: var(--text-dim);
  .glyph {
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; border-radius: 6px; color: #fff; font-weight: 900;
  }
  &.jc .glyph { background: #b8144b; }
  &.ep .glyph { background: #16a34a; }
  &.on.jc { border-color: #b8144b; color: #b8144b; background: #fdeef3; }
  &.on.ep { border-color: #16a34a; color: #128a3e; background: #eafaf0; }
}

.lbl { display: block; margin: 12px 0 6px; font-size: 12px; color: var(--text-dim); }
.avail { float: right; color: var(--text-faint); }

.quick { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; }
.quick button {
  height: 38px; border-radius: var(--radius-sm); background: var(--surface-2);
  font-weight: 700; font-size: 13px; color: var(--text);
  &.on { background: var(--primary); color: #fff; }
}

.field {
  display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 14px;
  background: var(--surface-2); border-radius: var(--radius-sm); border: 1px solid transparent;
  &:focus-within { border-color: var(--primary); }
  .pfx { color: var(--text-dim); font-weight: 700; }
  input { flex: 1; min-width: 0; background: none; border: 0; outline: none; color: var(--text); font: inherit; }
}

.bonus { margin: 12px 0 0; font-size: 12px; color: var(--text-dim); }

.go { margin-top: 16px; }

.wd-list { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 12px; }
.wd { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid var(--line); &:last-child { border: 0; } }
.note { color: var(--primary-deep); font-style: italic; }

.pill {
  padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800;
  &.w-pending { background: #fff3d6; color: #b3820b; }
  &.w-approved { background: #e6f0ff; color: #1e5fbf; }
  &.w-paid { background: #e7f8f0; color: #0c7a52; }
  &.w-rejected, &.w-failed { background: #fde8e6; color: #b3271b; }
}

.banner { margin: 0; padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600;
  &.ok { background: #e7f8f0; color: #0c7a52; }
  &.bad { background: #fde8e6; color: #b3271b; }
}

.head { display: block; margin-bottom: 8px; font-size: 14px; }
.txn { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid var(--line); &:last-child { border: 0; } }
.ttl { font-size: 13px; font-weight: 600; }
.amt { text-align: right; font-weight: 700; }
.tiny { font-size: 10px; }
.empty { padding: 16px 0 4px; text-align: center; color: var(--text-faint); font-size: 12px; }

/* MPIN modal */
.scrim {
  position: fixed; inset: 0; z-index: 300; background: rgba(60, 20, 40, 0.5);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.mpin-sheet {
  width: 100%; max-width: 340px; background: var(--bg); border-radius: 18px; padding: 18px;
  box-shadow: var(--shadow-pop);
}
.mpin-head {
  display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 16px; color: #fff;
  padding: 10px 14px; border-radius: var(--radius); margin-bottom: 14px;
  .glyph { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; background: rgba(255,255,255,0.25); font-weight: 900; }
  &.jc { background: #b8144b; }
  &.ep { background: #16a34a; }
}
.mpin-msg { margin: 0 0 14px; font-size: 13px; line-height: 1.5; color: var(--text-dim); }
.mpin-input {
  width: 100%; height: 52px; text-align: center; letter-spacing: 8px; font-size: 24px;
  border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--surface); color: var(--text); outline: none;
  &:focus { border-color: var(--primary); }
}
.sbx { margin: 8px 0 0; text-align: center; }
.mpin-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
</style>
