<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatMinor } from '@lp/shared';
import { api, apiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

/**
 * Back-office dashboard. Runs full-width (route meta `wide`), so it carries its
 * own header rather than the mobile chrome. Two tabs: an operational Overview
 * and Users management. Every mutation calls the admin API, which is the only
 * place these actions are authorised.
 */

const router = useRouter();
const auth = useAuthStore();

type Tab = 'overview' | 'users' | 'payouts' | 'announcements' | 'tickets' | 'gifts';
const tab = ref<Tab>('overview');

// --- overview --------------------------------------------------------------
interface Overview {
  users: { total: number; active: number; frozen: number; banned: number; newToday: number };
  money: {
    deposits: string;
    withdrawals: string;
    staked: string;
    payout: string;
    ggr: string;
    houseBalance: string;
  };
  activity: { totalBets: number; betsToday: number };
  integrity: { ok: boolean; total: string };
}
const overview = ref<Overview | null>(null);
const loadingOverview = ref(false);

async function loadOverview() {
  loadingOverview.value = true;
  try {
    const { data } = await api.get('/admin/overview');
    overview.value = data.data;
  } catch (e) {
    flash(apiError(e));
  } finally {
    loadingOverview.value = false;
  }
}

const rupees = (minor: string | bigint) => `₹${formatMinor(minor)}`;

// --- users -----------------------------------------------------------------
interface UserRow {
  id: string;
  nickname: string;
  phone: string | null;
  email: string | null;
  status: 'ACTIVE' | 'FROZEN' | 'BANNED';
  role: 'USER' | 'ADMIN';
  inviteCode: string;
  balance: string;
  bets: number;
  createdAt: string;
  lastLoginAt: string | null;
}
const query = ref('');
const users = ref<UserRow[]>([]);
const totalUsers = ref(0);
const loadingUsers = ref(false);

async function loadUsers() {
  loadingUsers.value = true;
  try {
    const { data } = await api.get('/admin/users', {
      params: { query: query.value, take: 30 },
    });
    users.value = data.data.users;
    totalUsers.value = data.data.total;
  } catch (e) {
    flash(apiError(e));
  } finally {
    loadingUsers.value = false;
  }
}

// --- user detail -----------------------------------------------------------
interface Detail {
  user: UserRow & { invitedById: string | null };
  balances: { cash: string; bonus: string; safe: string };
  counts: { bets: number; crashBets: number; instantBets: number; referrals: number };
  recentBets: Array<{
    id: string;
    gameCode: string;
    betType: string;
    selection: string;
    stake: string;
    status: string;
    payout: string;
    createdAt: string;
  }>;
  recentLedger: Array<{
    id: string;
    amount: string;
    balanceAfter: string;
    type: string;
    memo: string | null;
    createdAt: string;
  }>;
}
const detail = ref<Detail | null>(null);
const detailOpen = ref(false);
const busy = ref(false);

async function openDetail(id: string) {
  detailOpen.value = true;
  detail.value = null;
  try {
    const { data } = await api.get(`/admin/users/${id}`);
    detail.value = data.data;
  } catch (e) {
    flash(apiError(e));
  }
}

function closeDetail() {
  detailOpen.value = false;
  detail.value = null;
  adjAmount.value = '';
  adjMemo.value = '';
}

async function setStatus(status: 'ACTIVE' | 'FROZEN' | 'BANNED') {
  if (!detail.value) return;
  busy.value = true;
  try {
    await api.post(`/admin/users/${detail.value.user.id}/status`, { status });
    detail.value.user.status = status;
    flash(`Status set to ${status}`);
    void loadUsers();
  } catch (e) {
    flash(apiError(e));
  } finally {
    busy.value = false;
  }
}

async function toggleRole() {
  if (!detail.value) return;
  const role = detail.value.user.role === 'ADMIN' ? 'USER' : 'ADMIN';
  busy.value = true;
  try {
    await api.post(`/admin/users/${detail.value.user.id}/role`, { role });
    detail.value.user.role = role;
    flash(`Role set to ${role}`);
    void loadUsers();
  } catch (e) {
    flash(apiError(e));
  } finally {
    busy.value = false;
  }
}

// balance adjustment — rupees in the box, converted to signed paise
const adjAmount = ref('');
const adjMemo = ref('');
const adjSign = ref<1 | -1>(1);

const adjPreview = computed(() => {
  const n = Number(adjAmount.value);
  if (!adjAmount.value || Number.isNaN(n) || n <= 0) return null;
  return BigInt(Math.round(n * 100)) * BigInt(adjSign.value);
});

async function submitAdjust() {
  if (!detail.value || adjPreview.value === null) return;
  if (!adjMemo.value.trim()) {
    flash('A reason is required');
    return;
  }
  busy.value = true;
  try {
    const { data } = await api.post(`/admin/users/${detail.value.user.id}/adjust`, {
      amount: adjPreview.value.toString(),
      memo: adjMemo.value.trim(),
    });
    detail.value.balances.cash = data.data.balance;
    adjAmount.value = '';
    adjMemo.value = '';
    flash('Balance adjusted');
    void openDetail(detail.value.user.id);
    void loadUsers();
  } catch (e) {
    flash(apiError(e));
  } finally {
    busy.value = false;
  }
}

// --- payouts (withdrawal queue) --------------------------------------------
interface Payout {
  id: string; userId: string; nickname: string; phone: string | null;
  channel: 'JAZZCASH' | 'EASYPAISA'; amount: string; accountNumber: string; accountName: string;
  status: string; reviewNote: string | null; createdAt: string; paidAt: string | null;
}
const payouts = ref<Payout[]>([]);
const payoutFilter = ref<string>('PENDING');
const loadingPayouts = ref(false);

async function loadPayouts() {
  loadingPayouts.value = true;
  try {
    const { data } = await api.get('/admin/withdrawals', {
      params: { status: payoutFilter.value || undefined, take: 60 },
    });
    payouts.value = data.data;
  } catch (e) {
    flash(apiError(e));
  } finally {
    loadingPayouts.value = false;
  }
}

async function approvePayout(p: Payout) {
  busy.value = true;
  try {
    await api.post(`/admin/withdrawals/${p.id}/approve`);
    flash(`Paid ${rupees(p.amount)} to ${p.accountName}`);
    void loadPayouts();
  } catch (e) {
    flash(apiError(e));
  } finally {
    busy.value = false;
  }
}

async function rejectPayout(p: Payout) {
  const note = window.prompt(`Reject ${rupees(p.amount)} to ${p.accountName}?\nReason (refunds the player):`);
  if (!note) return;
  busy.value = true;
  try {
    await api.post(`/admin/withdrawals/${p.id}/reject`, { note });
    flash('Withdrawal rejected and refunded');
    void loadPayouts();
  } catch (e) {
    flash(apiError(e));
  } finally {
    busy.value = false;
  }
}

// --- announcements ---------------------------------------------------------
interface Ann { id: string; title: string; body: string; active: boolean; pinned: boolean; createdAt: string }
const anns = ref<Ann[]>([]);
const annTitle = ref('');
const annBody = ref('');
const annPinned = ref(false);

async function loadAnns() {
  try {
    const { data } = await api.get('/admin/announcements', { params: { take: 50 } });
    anns.value = data.data;
  } catch (e) { flash(apiError(e)); }
}
async function createAnn() {
  if (annTitle.value.trim().length < 3 || annBody.value.trim().length < 3) return flash('Title and body required');
  busy.value = true;
  try {
    await api.post('/admin/announcements', { title: annTitle.value, body: annBody.value, pinned: annPinned.value });
    annTitle.value = ''; annBody.value = ''; annPinned.value = false;
    flash('Announcement published');
    void loadAnns();
  } catch (e) { flash(apiError(e)); } finally { busy.value = false; }
}
async function patchAnn(a: Ann, patch: { active?: boolean; pinned?: boolean }) {
  try { await api.post(`/admin/announcements/${a.id}`, patch); void loadAnns(); }
  catch (e) { flash(apiError(e)); }
}
async function deleteAnn(a: Ann) {
  if (!window.confirm(`Delete "${a.title}"?`)) return;
  try { await api.delete(`/admin/announcements/${a.id}`); flash('Deleted'); void loadAnns(); }
  catch (e) { flash(apiError(e)); }
}

// --- support tickets -------------------------------------------------------
interface AdminTicket {
  id: string; nickname: string; phone: string | null; subject: string; message: string;
  status: string; reply: string | null; createdAt: string;
}
const ticketRows = ref<AdminTicket[]>([]);
const ticketFilter = ref<string>('OPEN');
const replyDraft = ref<Record<string, string>>({});

async function loadTickets() {
  try {
    const { data } = await api.get('/admin/tickets', { params: { status: ticketFilter.value || undefined, take: 60 } });
    ticketRows.value = data.data;
  } catch (e) { flash(apiError(e)); }
}
async function sendReply(t: AdminTicket) {
  const reply = (replyDraft.value[t.id] ?? '').trim();
  if (reply.length < 2) return flash('Write a reply');
  busy.value = true;
  try {
    await api.post(`/admin/tickets/${t.id}/reply`, { reply });
    replyDraft.value[t.id] = '';
    flash('Reply sent');
    void loadTickets();
  } catch (e) { flash(apiError(e)); } finally { busy.value = false; }
}
async function closeTicket(t: AdminTicket) {
  try { await api.post(`/admin/tickets/${t.id}/close`); void loadTickets(); }
  catch (e) { flash(apiError(e)); }
}

// --- gift codes ------------------------------------------------------------
interface GiftCode {
  id: string; code: string; amount: string; maxRedemptions: number; redeemed: number; active: boolean;
}
const gifts = ref<GiftCode[]>([]);
const giftAmount = ref<number | null>(null);
const giftMax = ref(1);
const giftCustom = ref('');

async function loadGifts() {
  try {
    const { data } = await api.get('/admin/gift-codes', { params: { take: 50 } });
    gifts.value = data.data;
  } catch (e) { flash(apiError(e)); }
}
async function createGift() {
  if (!giftAmount.value || giftAmount.value <= 0) return flash('Enter an amount');
  busy.value = true;
  try {
    const { data } = await api.post('/admin/gift-codes', {
      amount: String(Math.round(giftAmount.value * 100)),
      maxRedemptions: giftMax.value,
      ...(giftCustom.value.trim() ? { code: giftCustom.value.trim() } : {}),
    });
    flash(`Created code ${data.data.code}`);
    giftAmount.value = null; giftMax.value = 1; giftCustom.value = '';
    void loadGifts();
  } catch (e) { flash(apiError(e)); } finally { busy.value = false; }
}
async function toggleGift(g: GiftCode) {
  try { await api.post(`/admin/gift-codes/${g.id}/active`, { active: !g.active }); void loadGifts(); }
  catch (e) { flash(apiError(e)); }
}
function copyCode(code: string) {
  navigator.clipboard?.writeText(code).then(() => flash(`Copied ${code}`)).catch(() => {});
}

// --- toast -----------------------------------------------------------------
const toast = ref('');
let toastTimer: number | undefined;
function flash(m: string) {
  toast.value = m;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2600);
}

function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleString() : '—';
}

async function doLogout() {
  await auth.logout();
  router.push({ name: 'home' });
}

onMounted(() => {
  loadOverview();
  loadUsers();
  loadPayouts();
});
</script>

<template>
  <div class="admin">
    <!-- Header -->
    <header class="a-head">
      <div class="a-brand">
        <span class="mark">◈</span> Skyway <span class="tag">Admin</span>
      </div>
      <div class="a-right">
        <span class="who">{{ auth.user?.nickname }}</span>
        <router-link :to="{ name: 'home' }" class="hbtn ghost">↩ App</router-link>
        <button class="hbtn" @click="doLogout">Log out</button>
      </div>
    </header>

    <!-- Tabs -->
    <nav class="tabs">
      <button :class="{ on: tab === 'overview' }" @click="tab = 'overview'">Overview</button>
      <button :class="{ on: tab === 'users' }" @click="tab = 'users'">Users</button>
      <button :class="{ on: tab === 'payouts' }" @click="tab = 'payouts'; loadPayouts()">Payouts</button>
      <button :class="{ on: tab === 'announcements' }" @click="tab = 'announcements'; loadAnns()">Announcements</button>
      <button :class="{ on: tab === 'tickets' }" @click="tab = 'tickets'; loadTickets()">Tickets</button>
      <button :class="{ on: tab === 'gifts' }" @click="tab = 'gifts'; loadGifts()">Gift codes</button>
    </nav>

    <!-- OVERVIEW -->
    <section v-if="tab === 'overview'" class="pane">
      <div class="pane-head">
        <h2>Platform overview</h2>
        <button class="refresh" :disabled="loadingOverview" @click="loadOverview">
          ⟳ Refresh
        </button>
      </div>

      <template v-if="overview">
        <div
          class="integrity"
          :class="overview.integrity.ok ? 'ok' : 'bad'"
        >
          <strong>Ledger integrity</strong>
          <span>
            {{ overview.integrity.ok ? '✓ Balanced' : '✕ BROKEN' }} · net
            {{ overview.integrity.total }}
          </span>
        </div>

        <h3 class="grp">Players</h3>
        <div class="cards">
          <div class="stat"><span class="k">Total users</span><span class="v num">{{ overview.users.total }}</span></div>
          <div class="stat"><span class="k">Active</span><span class="v num">{{ overview.users.active }}</span></div>
          <div class="stat"><span class="k">Frozen</span><span class="v num warn">{{ overview.users.frozen }}</span></div>
          <div class="stat"><span class="k">Banned</span><span class="v num bad">{{ overview.users.banned }}</span></div>
          <div class="stat"><span class="k">New today</span><span class="v num">{{ overview.users.newToday }}</span></div>
        </div>

        <h3 class="grp">Money</h3>
        <div class="cards">
          <div class="stat"><span class="k">Deposits</span><span class="v num">{{ rupees(overview.money.deposits) }}</span></div>
          <div class="stat"><span class="k">Withdrawals</span><span class="v num">{{ rupees(overview.money.withdrawals) }}</span></div>
          <div class="stat"><span class="k">Total staked</span><span class="v num">{{ rupees(overview.money.staked) }}</span></div>
          <div class="stat"><span class="k">Total payout</span><span class="v num">{{ rupees(overview.money.payout) }}</span></div>
          <div class="stat hi"><span class="k">GGR (house win)</span><span class="v num">{{ rupees(overview.money.ggr) }}</span></div>
          <div class="stat"><span class="k">House balance</span><span class="v num">{{ rupees(overview.money.houseBalance) }}</span></div>
        </div>

        <h3 class="grp">Activity</h3>
        <div class="cards">
          <div class="stat"><span class="k">Total bets</span><span class="v num">{{ overview.activity.totalBets }}</span></div>
          <div class="stat"><span class="k">Bets today</span><span class="v num">{{ overview.activity.betsToday }}</span></div>
        </div>
      </template>
      <p v-else-if="loadingOverview" class="muted">Loading…</p>
    </section>

    <!-- USERS -->
    <section v-if="tab === 'users'" class="pane">
      <div class="pane-head">
        <h2>Users <span class="muted">({{ totalUsers }})</span></h2>
        <form class="search" @submit.prevent="loadUsers">
          <input v-model="query" placeholder="id, phone, email, nickname, invite code" />
          <button type="submit" :disabled="loadingUsers">Search</button>
        </form>
      </div>

      <div class="table-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>ID</th><th>Nickname</th><th>Phone</th><th>Status</th>
              <th>Role</th><th class="r">Balance</th><th class="r">Bets</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" class="urow" @click="openDetail(u.id)">
              <td class="num">{{ u.id }}</td>
              <td>{{ u.nickname }}</td>
              <td>{{ u.phone ?? '—' }}</td>
              <td><span class="pill" :class="'s-' + u.status.toLowerCase()">{{ u.status }}</span></td>
              <td><span class="pill" :class="u.role === 'ADMIN' ? 'r-admin' : 'r-user'">{{ u.role }}</span></td>
              <td class="r num">{{ rupees(u.balance) }}</td>
              <td class="r num">{{ u.bets }}</td>
              <td class="muted small">{{ fmtDate(u.createdAt) }}</td>
            </tr>
            <tr v-if="!users.length && !loadingUsers">
              <td colspan="8" class="muted center">No users found.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- PAYOUTS -->
    <section v-if="tab === 'payouts'" class="pane">
      <div class="pane-head">
        <h2>Withdrawal queue</h2>
        <div class="filters">
          <button
            v-for="f in ['PENDING', 'PAID', 'REJECTED', '']" :key="f || 'all'"
            :class="{ on: payoutFilter === f }" @click="payoutFilter = f; loadPayouts()"
          >
            {{ f || 'All' }}
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>ID</th><th>User</th><th>Channel</th><th class="r">Amount</th>
              <th>Destination</th><th>Status</th><th>Requested</th><th class="r">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in payouts" :key="p.id">
              <td class="num">{{ p.id }}</td>
              <td>{{ p.nickname }}<span class="muted small"> #{{ p.userId }}</span></td>
              <td>{{ p.channel }}</td>
              <td class="r num">{{ rupees(p.amount) }}</td>
              <td class="small">{{ p.accountName }}<br /><span class="muted">{{ p.accountNumber }}</span></td>
              <td><span class="pill" :class="'w-' + p.status.toLowerCase()">{{ p.status }}</span></td>
              <td class="muted small">{{ fmtDate(p.createdAt) }}</td>
              <td class="r">
                <template v-if="p.status === 'PENDING'">
                  <button class="mini-btn ok" :disabled="busy" @click="approvePayout(p)">Approve</button>
                  <button class="mini-btn no" :disabled="busy" @click="rejectPayout(p)">Reject</button>
                </template>
                <span v-else class="muted small">—</span>
              </td>
            </tr>
            <tr v-if="!payouts.length && !loadingPayouts">
              <td colspan="8" class="muted center">No withdrawals in this view.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ANNOUNCEMENTS -->
    <section v-if="tab === 'announcements'" class="pane">
      <div class="pane-head"><h2>Announcements</h2></div>

      <div class="ann-form">
        <input v-model="annTitle" class="ann-in" placeholder="Title" maxlength="160" />
        <textarea v-model="annBody" class="ann-in ann-area" placeholder="Message shown to all players…" rows="3" maxlength="4000" />
        <div class="ann-actions">
          <label class="pin"><input v-model="annPinned" type="checkbox" /> Pin to top</label>
          <button class="refresh" :disabled="busy" @click="createAnn">Publish</button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Title</th><th>Message</th><th>State</th><th class="r">Actions</th></tr></thead>
          <tbody>
            <tr v-for="a in anns" :key="a.id">
              <td>{{ a.pinned ? '📌 ' : '' }}<strong>{{ a.title }}</strong></td>
              <td class="small muted">{{ a.body.slice(0, 80) }}</td>
              <td><span class="pill" :class="a.active ? 's-active' : 's-banned'">{{ a.active ? 'Active' : 'Hidden' }}</span></td>
              <td class="r">
                <button class="mini-btn" @click="patchAnn(a, { active: !a.active })">{{ a.active ? 'Hide' : 'Show' }}</button>
                <button class="mini-btn" @click="patchAnn(a, { pinned: !a.pinned })">{{ a.pinned ? 'Unpin' : 'Pin' }}</button>
                <button class="mini-btn no" @click="deleteAnn(a)">Delete</button>
              </td>
            </tr>
            <tr v-if="!anns.length"><td colspan="4" class="muted center">No announcements.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- TICKETS -->
    <section v-if="tab === 'tickets'" class="pane">
      <div class="pane-head">
        <h2>Support tickets</h2>
        <div class="filters">
          <button v-for="f in ['OPEN', 'ANSWERED', 'CLOSED', '']" :key="f || 'all'"
            :class="{ on: ticketFilter === f }" @click="ticketFilter = f; loadTickets()">{{ f || 'All' }}</button>
        </div>
      </div>

      <div v-for="t in ticketRows" :key="t.id" class="tk">
        <div class="tk-head">
          <div>
            <strong>{{ t.subject }}</strong>
            <span class="muted small"> · {{ t.nickname }} {{ t.phone ?? '' }}</span>
          </div>
          <span class="pill" :class="'k-' + t.status.toLowerCase()">{{ t.status }}</span>
        </div>
        <p class="tk-msg">{{ t.message }}</p>
        <p v-if="t.reply" class="tk-reply"><span class="r-tag">You</span>{{ t.reply }}</p>
        <div v-if="t.status !== 'CLOSED'" class="tk-reply-form">
          <input v-model="replyDraft[t.id]" class="ann-in" placeholder="Write a reply…" />
          <button class="mini-btn ok" :disabled="busy" @click="sendReply(t)">Reply</button>
          <button class="mini-btn" @click="closeTicket(t)">Close</button>
        </div>
      </div>
      <p v-if="!ticketRows.length" class="muted center pad">No tickets in this view.</p>
    </section>

    <!-- GIFT CODES -->
    <section v-if="tab === 'gifts'" class="pane">
      <div class="pane-head"><h2>Gift codes</h2></div>

      <div class="ann-form gift-form">
        <div class="gf-row">
          <label>Amount (₹)<input v-model.number="giftAmount" class="ann-in" type="number" min="0" placeholder="50" /></label>
          <label>Max uses<input v-model.number="giftMax" class="ann-in" type="number" min="1" placeholder="1" /></label>
          <label>Custom code (optional)<input v-model="giftCustom" class="ann-in" placeholder="auto" maxlength="32" /></label>
        </div>
        <button class="refresh" :disabled="busy" @click="createGift">Generate code</button>
      </div>

      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Code</th><th class="r">Amount</th><th class="r">Used</th><th>State</th><th class="r">Action</th></tr></thead>
          <tbody>
            <tr v-for="g in gifts" :key="g.id">
              <td><strong class="num">{{ g.code }}</strong> <button class="mini-btn" @click="copyCode(g.code)">Copy</button></td>
              <td class="r num">{{ rupees(g.amount) }}</td>
              <td class="r num">{{ g.redeemed }} / {{ g.maxRedemptions }}</td>
              <td><span class="pill" :class="g.active ? 's-active' : 's-banned'">{{ g.active ? 'Active' : 'Disabled' }}</span></td>
              <td class="r"><button class="mini-btn" @click="toggleGift(g)">{{ g.active ? 'Disable' : 'Enable' }}</button></td>
            </tr>
            <tr v-if="!gifts.length"><td colspan="5" class="muted center">No gift codes yet.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- DETAIL DRAWER -->
    <transition name="drawer">
      <aside v-if="detailOpen" class="drawer">
        <div class="d-scrim" @click="closeDetail" />
        <div class="d-body">
          <header class="d-head">
            <div>
              <strong v-if="detail">{{ detail.user.nickname }}</strong>
              <span v-if="detail" class="muted"> · #{{ detail.user.id }}</span>
            </div>
            <button class="x" @click="closeDetail">✕</button>
          </header>

          <div v-if="detail" class="d-content">
            <!-- balances -->
            <div class="bal-row">
              <div class="bal"><span class="k">Cash</span><span class="v num">{{ rupees(detail.balances.cash) }}</span></div>
              <div class="bal"><span class="k">Bonus</span><span class="v num">{{ rupees(detail.balances.bonus) }}</span></div>
              <div class="bal"><span class="k">Safe</span><span class="v num">{{ rupees(detail.balances.safe) }}</span></div>
            </div>

            <div class="meta">
              <span>Phone: {{ detail.user.phone ?? '—' }}</span>
              <span>Email: {{ detail.user.email ?? '—' }}</span>
              <span>Invite: {{ detail.user.inviteCode }}</span>
              <span>Referrals: {{ detail.counts.referrals }}</span>
              <span>Bets: {{ detail.counts.bets + detail.counts.crashBets + detail.counts.instantBets }}</span>
              <span>Last login: {{ fmtDate(detail.user.lastLoginAt) }}</span>
            </div>

            <!-- actions: status -->
            <h4>Status — <span class="pill" :class="'s-' + detail.user.status.toLowerCase()">{{ detail.user.status }}</span></h4>
            <div class="btns">
              <button :disabled="busy || detail.user.status === 'ACTIVE'" @click="setStatus('ACTIVE')">Activate</button>
              <button :disabled="busy || detail.user.status === 'FROZEN'" class="warn" @click="setStatus('FROZEN')">Freeze</button>
              <button :disabled="busy || detail.user.status === 'BANNED'" class="bad" @click="setStatus('BANNED')">Ban</button>
            </div>

            <!-- actions: role -->
            <h4>Role — <span class="pill" :class="detail.user.role === 'ADMIN' ? 'r-admin' : 'r-user'">{{ detail.user.role }}</span></h4>
            <div class="btns">
              <button :disabled="busy" @click="toggleRole">
                {{ detail.user.role === 'ADMIN' ? 'Demote to USER' : 'Promote to ADMIN' }}
              </button>
            </div>

            <!-- actions: balance adjust -->
            <h4>Adjust cash balance</h4>
            <div class="adjust">
              <div class="seg">
                <button :class="{ on: adjSign === 1 }" @click="adjSign = 1">Credit +</button>
                <button :class="{ on: adjSign === -1 }" @click="adjSign = -1">Debit −</button>
              </div>
              <input v-model="adjAmount" class="amt" inputmode="decimal" placeholder="Amount (₹)" />
              <input v-model="adjMemo" class="memo" placeholder="Reason (required)" />
              <button class="apply" :disabled="busy || adjPreview === null || !adjMemo.trim()" @click="submitAdjust">
                Apply
              </button>
            </div>
            <p v-if="adjPreview !== null" class="preview">
              Will {{ adjSign === 1 ? 'credit' : 'debit' }}
              <strong>{{ rupees((adjPreview < 0n ? -adjPreview : adjPreview).toString()) }}</strong>
              — new balance ≈
              {{ rupees((BigInt(detail.balances.cash) + adjPreview).toString()) }}
            </p>

            <!-- recent ledger -->
            <h4>Recent transactions</h4>
            <table class="mini">
              <tr v-for="e in detail.recentLedger" :key="e.id">
                <td class="muted small">{{ e.type }}</td>
                <td class="small">{{ e.memo ?? '' }}</td>
                <td class="r num" :class="BigInt(e.amount) >= 0n ? 'pos' : 'neg'">
                  {{ BigInt(e.amount) >= 0n ? '+' : '' }}{{ rupees(e.amount) }}
                </td>
              </tr>
              <tr v-if="!detail.recentLedger.length"><td colspan="3" class="muted">No transactions.</td></tr>
            </table>

            <!-- recent bets -->
            <h4>Recent bets</h4>
            <table class="mini">
              <tr v-for="b in detail.recentBets" :key="b.id">
                <td class="small">{{ b.gameCode }} · {{ b.betType }}/{{ b.selection }}</td>
                <td class="r num">{{ rupees(b.stake) }}</td>
                <td class="r"><span class="pill small" :class="'b-' + b.status.toLowerCase()">{{ b.status }}</span></td>
              </tr>
              <tr v-if="!detail.recentBets.length"><td colspan="3" class="muted">No bets.</td></tr>
            </table>
          </div>
          <p v-else class="muted pad">Loading…</p>
        </div>
      </aside>
    </transition>

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped lang="scss">
.admin {
  min-height: 100vh;
  background: var(--backdrop);
  color: var(--text);
  padding-bottom: 40px;
}

.a-head {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  height: 56px;
  background: linear-gradient(135deg, var(--header-from), var(--header-to));
  color: #fff;
}
.a-brand {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.5px;
  .mark { opacity: 0.9; }
  .tag {
    font-size: 11px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.25);
    padding: 2px 8px;
    border-radius: 999px;
    vertical-align: middle;
  }
}
.a-right { display: flex; align-items: center; gap: 10px; }
.who { font-size: 13px; opacity: 0.9; }
.hbtn {
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  background: #fff;
  color: var(--primary-deep);
  font-size: 13px;
  font-weight: 700;
  &.ghost { background: rgba(255, 255, 255, 0.2); color: #fff; text-decoration: none; display: flex; align-items: center; }
}

.tabs {
  display: flex;
  gap: 8px;
  padding: 14px 18px 0;
  max-width: 1100px;
  margin: 0 auto;
  button {
    height: 38px;
    padding: 0 20px;
    border-radius: 999px 999px 0 0;
    font-weight: 700;
    font-size: 14px;
    color: var(--text-dim);
    background: transparent;
    &.on { background: var(--surface); color: var(--primary-deep); box-shadow: var(--shadow-card); }
  }
}

.pane {
  max-width: 1100px;
  margin: 0 auto;
  padding: 18px;
}
.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  h2 { margin: 0; font-size: 18px; }
}
.refresh, .search button {
  height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  background: var(--primary);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  &:disabled { opacity: 0.5; }
}

.integrity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: var(--radius);
  margin-bottom: 18px;
  box-shadow: var(--shadow-card);
  &.ok { background: #e7f8f0; color: #0c7a52; }
  &.bad { background: #fde8e6; color: #b3271b; }
}

.grp { margin: 18px 0 10px; font-size: 13px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; }

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-card);
  .k { font-size: 12px; color: var(--text-dim); }
  .v { font-size: 22px; font-weight: 800; }
  .warn { color: #d98a00; }
  .bad { color: var(--red); }
  &.hi { background: linear-gradient(135deg, var(--accent-from), var(--accent-to)); color: #fff; .k { color: rgba(255,255,255,0.85); } }
}

.search { display: flex; gap: 8px; }
.search input {
  height: 36px;
  width: 320px;
  max-width: 48vw;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  outline: none;
  &:focus { border-color: var(--primary); }
}

.table-wrap { overflow-x: auto; border-radius: var(--radius); box-shadow: var(--shadow-card); }
.tbl {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  font-size: 13px;
  th, td { padding: 11px 14px; text-align: left; white-space: nowrap; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); border-bottom: 1px solid var(--line); }
  .r { text-align: right; }
  .urow { cursor: pointer; border-bottom: 1px solid var(--line); &:hover { background: var(--surface-2); } }
}

.pill {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  &.small { font-size: 10px; }
  &.s-active { background: #e7f8f0; color: #0c7a52; }
  &.s-frozen { background: #fff3d6; color: #b3820b; }
  &.s-banned { background: #fde8e6; color: #b3271b; }
  &.r-admin { background: var(--primary); color: #fff; }
  &.r-user { background: var(--surface-3); color: var(--text-dim); }
  &.b-won { background: #e7f8f0; color: #0c7a52; }
  &.b-lost { background: var(--surface-3); color: var(--text-dim); }
  &.b-pending { background: #fff3d6; color: #b3820b; }
  &.b-refunded { background: #eef; color: #55c; }
  &.w-pending { background: #fff3d6; color: #b3820b; }
  &.w-approved { background: #e6f0ff; color: #1e5fbf; }
  &.w-paid { background: #e7f8f0; color: #0c7a52; }
  &.w-rejected, &.w-failed { background: #fde8e6; color: #b3271b; }
}

.filters { display: flex; gap: 6px; }
.filters button {
  height: 32px; padding: 0 14px; border-radius: 999px; font-weight: 700; font-size: 12px;
  background: var(--surface-2); color: var(--text-dim);
  &.on { background: var(--primary); color: #fff; }
}
.mini-btn {
  height: 30px; padding: 0 12px; border-radius: 8px; font-weight: 700; font-size: 12px;
  background: var(--surface-2); color: var(--text-dim); border: 1px solid var(--line);
  & + .mini-btn { margin-left: 6px; }
  &.ok { background: #e7f8f0; color: #0c7a52; border: 1px solid #b7e6ce; }
  &.no { background: #fde8e6; color: #b3271b; border: 1px solid #f3c2bd; }
  &:disabled { opacity: 0.5; }
}

.ann-form { background: var(--surface); border-radius: var(--radius); padding: 14px; box-shadow: var(--shadow-card); margin-bottom: 16px; }
.ann-in {
  width: 100%; margin-bottom: 8px; padding: 10px 12px; border-radius: 8px;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: inherit; outline: none;
  &:focus { border-color: var(--primary); }
}
.ann-area { resize: vertical; }
.ann-actions { display: flex; align-items: center; justify-content: space-between; }
.pin { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); }

.gift-form .gf-row { display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 10px; margin-bottom: 10px; }
.gf-row label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text-dim); font-weight: 700; }
.gf-row .ann-in { margin: 0; }

.tk { background: var(--surface); border-radius: var(--radius); padding: 14px; box-shadow: var(--shadow-card); margin-bottom: 10px; }
.tk-head { display: flex; align-items: center; justify-content: space-between; }
.tk-msg { margin: 8px 0; font-size: 13px; color: var(--text-dim); line-height: 1.5; }
.tk-reply { margin: 8px 0; padding: 10px 12px; border-radius: 10px; background: var(--surface-2); font-size: 13px; line-height: 1.5; }
.r-tag { display: inline-block; margin-right: 6px; padding: 1px 7px; border-radius: 999px; background: var(--primary); color: #fff; font-size: 10px; font-weight: 800; }
.tk-reply-form { display: flex; gap: 8px; align-items: center; .ann-in { margin: 0; flex: 1; } }
.pill.k-open { background: #fff3d6; color: #b3820b; }
.pill.k-answered { background: #e7f8f0; color: #0c7a52; }
.pill.k-closed { background: var(--surface-3); color: var(--text-dim); }
.pad { padding: 24px; }

.muted { color: var(--text-dim); }
.small { font-size: 11px; }
.center { text-align: center; }

/* --- drawer -------------------------------------------------------------- */
.drawer { position: fixed; inset: 0; z-index: 80; }
.d-scrim { position: absolute; inset: 0; background: rgba(60, 20, 40, 0.45); }
.d-body {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  width: min(460px, 92vw);
  background: var(--bg);
  box-shadow: -8px 0 30px rgba(120, 30, 70, 0.25);
  display: flex;
  flex-direction: column;
}
.d-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  strong { font-size: 16px; }
}
.x { width: 30px; height: 30px; border-radius: 50%; background: var(--surface-3); color: var(--text-dim); font-size: 13px; }
.d-content { padding: 16px 18px; overflow-y: auto; }
.pad { padding: 24px; }

.bal-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.bal {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px; border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-card);
  .k { font-size: 11px; color: var(--text-dim); }
  .v { font-size: 17px; font-weight: 800; }
}
.meta {
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px;
  margin: 14px 0; font-size: 12px; color: var(--text-dim);
}

h4 { margin: 18px 0 8px; font-size: 13px; }
.btns { display: flex; flex-wrap: wrap; gap: 8px; }
.btns button, .apply {
  height: 34px; padding: 0 14px; border-radius: 8px;
  background: var(--surface-2); color: var(--text); font-weight: 700; font-size: 12px;
  border: 1px solid var(--line);
  &.warn { background: #fff3d6; color: #b3820b; border-color: #f0d79a; }
  &.bad { background: #fde8e6; color: #b3271b; border-color: #f3c2bd; }
  &:disabled { opacity: 0.45; }
}

.adjust { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; }
.seg { grid-column: 1 / -1; display: flex; gap: 6px; }
.seg button {
  height: 32px; padding: 0 14px; border-radius: 999px; font-weight: 700; font-size: 12px;
  background: var(--surface-2); color: var(--text-dim); border: 1px solid var(--line);
  &.on { background: var(--primary); color: #fff; border-color: var(--primary); }
}
.amt, .memo {
  height: 36px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--surface); color: var(--text); outline: none;
  &:focus { border-color: var(--primary); }
}
.amt { grid-column: 1 / -1; }
.memo { grid-column: 1 / 2; }
.apply { grid-column: 2 / 3; background: var(--primary); color: #fff; border: 0; }
.preview { margin: 8px 0 0; font-size: 12px; color: var(--text-dim); }

.mini {
  width: 100%; border-collapse: collapse; font-size: 12px;
  td { padding: 7px 4px; border-bottom: 1px solid var(--line); }
  .r { text-align: right; }
  .pos { color: #0c7a52; }
  .neg { color: var(--red); }
}

.toast {
  position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
  background: rgba(40, 16, 28, 0.95); color: #fff;
  padding: 10px 18px; border-radius: 999px; font-size: 13px; z-index: 200;
}

.drawer-enter-active .d-body, .drawer-leave-active .d-body { transition: transform 0.24s ease; }
.drawer-enter-from .d-body, .drawer-leave-to .d-body { transform: translateX(100%); }
.drawer-enter-active .d-scrim, .drawer-leave-active .d-scrim { transition: opacity 0.24s ease; }
.drawer-enter-from .d-scrim, .drawer-leave-to .d-scrim { opacity: 0; }
</style>
