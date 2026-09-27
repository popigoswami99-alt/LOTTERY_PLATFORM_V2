<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatMinor, toMinor } from '@lp/shared';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { apiError } from '@/api/client';
import SiteFooter from '@/components/SiteFooter.vue';

const auth = useAuthStore();
const profile = useProfileStore();
const router = useRouter();

const toast = ref('');
const refreshing = ref(false);
const copied = ref(false);

/** Which slide-over is open. */
type Sheet =
  | null
  | 'safe'
  | 'game-history'
  | 'transactions'
  | 'deposits'
  | 'withdrawals'
  | 'stats'
  | 'language'
  | 'notification'
  | 'gifts'
  | 'settings'
  | 'feedback'
  | 'announcement'
  | 'support'
  | 'guide'
  | 'about';

const sheet = ref<Sheet>(null);
const safeAmount = ref('100');
const busy = ref(false);

const p = computed(() => profile.profile);

const lastLogin = computed(() =>
  p.value?.lastLoginAt ? new Date(p.value.lastLoginAt).toLocaleString() : 'First session',
);

const initials = computed(() => (p.value?.nickname ?? '??').slice(0, 2).toUpperCase());

// --- actions ---------------------------------------------------------------

async function refresh() {
  refreshing.value = true;
  try {
    await profile.load();
  } catch (err) {
    flash(apiError(err));
  } finally {
    refreshing.value = false;
  }
}

async function copyUid() {
  if (!p.value) return;
  try {
    await navigator.clipboard.writeText(p.value.uid);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* clipboard blocked; the value is on screen */
  }
}

async function open(s: Sheet) {
  sheet.value = s;
  try {
    if (s === 'safe') await profile.loadSafe();
    if (s === 'game-history') await profile.loadGameHistory();
    if (s === 'stats') await profile.loadStats();
    if (s === 'transactions') await profile.loadMoneyHistory('all');
    if (s === 'deposits') await profile.loadMoneyHistory('deposit');
    if (s === 'withdrawals') await profile.loadMoneyHistory('withdraw');
  } catch (err) {
    flash(apiError(err));
  }
}

async function moveSafe(dir: 'in' | 'out') {
  busy.value = true;
  try {
    const minor = toMinor(safeAmount.value).toString();
    if (dir === 'in') await profile.safeDeposit(minor);
    else await profile.safeWithdraw(minor);
    flash(dir === 'in' ? 'Moved into the safe' : 'Moved back to your balance');
  } catch (err) {
    flash(err instanceof Error && !('response' in err) ? err.message : apiError(err));
  } finally {
    busy.value = false;
  }
}

async function logout() {
  await auth.logout();
  profile.reset();
  router.replace({ name: 'login' });
}

let toastTimer: number | undefined;
function flash(m: string) {
  toast.value = m;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2600);
}

onMounted(() => {
  if (auth.isLoggedIn) void refresh();
});

// --- static panels ---------------------------------------------------------

const SERVICE = [
  { key: 'settings' as const, icon: '⚙️', label: 'Settings' },
  { key: 'feedback' as const, icon: '📋', label: 'Feedback' },
  { key: 'announcement' as const, icon: '📢', label: 'Announcement' },
  { key: 'support' as const, icon: '🎧', label: 'Customer Service' },
  { key: 'guide' as const, icon: '📘', label: "Beginner's Guide" },
  { key: 'about' as const, icon: 'ℹ️', label: 'About us' },
];

const PANEL_TEXT: Record<string, { title: string; lines: string[] }> = {
  language: {
    title: 'Language',
    body: [],
    lines: ['English is the only language bundled in this build.'],
  } as never,
  notification: {
    title: 'Notification',
    lines: [
      'No notification system is connected yet.',
      'Balance changes push live over the socket while you are in a game, but there is no stored inbox.',
    ],
  },
  gifts: {
    title: 'Gifts',
    lines: [
      'Gift and redemption codes are not built yet.',
      'When they are, this is where a code is entered and credited through the same ledger as a deposit.',
    ],
  },
  settings: {
    title: 'Settings',
    lines: [
      'There are no adjustable settings in this build.',
      'Password change, 2FA and notification preferences belong here.',
    ],
  },
  feedback: {
    title: 'Feedback',
    lines: ['No feedback channel is wired up yet.'],
  },
  announcement: {
    title: 'Announcement',
    lines: [
      'Every round is provably fair: the result is committed as a hash before betting opens and the seed is revealed afterwards.',
      'This is a development build running on test balance.',
    ],
  },
  support: {
    title: 'Customer Service',
    lines: ['No support desk is connected to this build yet.'],
  },
  guide: {
    title: "Beginner's Guide",
    lines: [
      'Lottery games run on a fixed timer — bet before the countdown locks.',
      'Originals resolve instantly, or run continuous rounds you cash out of.',
      'Minimum bet is ₹10. Every game shows its odds before you stake.',
    ],
  },
  about: {
    title: 'About us',
    lines: [
      '12 in-house games on one shared money ledger.',
      'The house edge is a single 2% stake rake, identical on every game and bet type.',
      'Development build — no payment provider connected.',
    ],
  },
};

const sheetTitle = computed(() => {
  const map: Record<string, string> = {
    safe: 'Safe',
    'game-history': 'Game History',
    transactions: 'Transaction history',
    deposits: 'Deposit history',
    withdrawals: 'Withdraw history',
    stats: 'Game statistics',
  };
  return map[sheet.value ?? ''] ?? PANEL_TEXT[sheet.value ?? '']?.title ?? '';
});
</script>

<template>
  <div class="page">
    <template v-if="auth.isLoggedIn && p">
      <!-- Identity -->
      <header class="ident">
        <div class="avatar">{{ initials }}</div>
        <div class="who">
          <div class="namerow">
            <strong class="name">{{ p.nickname }}</strong>
            <span class="vip">VIP{{ p.vip.level }}</span>
          </div>
          <button class="uid" @click="copyUid">
            <span class="uid-tag">UID</span>
            <span class="mono">{{ p.uid }}</span>
            <span class="cp">⧉</span>
          </button>
          <div class="last">Last login: {{ lastLogin }}</div>
        </div>
        <span v-if="copied" class="copied">Copied</span>
      </header>

      <!-- Balance -->
      <section class="balance">
        <div class="brow">
          <div>
            <span class="cap">Total balance</span>
            <div class="amt mono">
              ₹{{ formatMinor(p.balance) }}
              <button class="refresh" :class="{ spin: refreshing }" @click="refresh">⟳</button>
            </div>
          </div>
          <router-link class="enter" :to="{ name: 'wallet' }">Enter wallet</router-link>
        </div>

        <div class="quick">
          <button class="q" @click="open('safe')">
            <span class="qi qi-safe">🔐</span>
            <span>Safe</span>
          </button>
          <router-link class="q" :to="{ name: 'wallet' }">
            <span class="qi qi-dep">💳</span>
            <span>Deposit</span>
          </router-link>
          <button class="q" @click="open('withdrawals')">
            <span class="qi qi-wd">🏧</span>
            <span>Withdraw</span>
          </button>
          <button class="q" @click="open('stats')">
            <span class="qi qi-vip">💎</span>
            <span>VIP</span>
          </button>
        </div>
      </section>

      <!-- Safe -->
      <button class="safe-card" @click="open('safe')">
        <span class="safe-ico">🟨</span>
        <span class="safe-body">
          <span class="safe-head">
            <strong>Safe</strong>
            <span class="safe-amt">₹{{ formatMinor(p.safeBalance) }}</span>
            <span class="chev">›</span>
          </span>
          <span class="safe-note">
            The daily interest rate is 0.1%, and the income is calculated once every 1 minutes.
          </span>
        </span>
      </button>

      <!-- History tiles -->
      <section class="tiles">
        <button class="tile" @click="open('game-history')">
          <span class="t-ico t-blue">🧾</span>
          <span class="t-txt"><strong>Game History</strong><em>My game history</em></span>
        </button>
        <button class="tile" @click="open('transactions')">
          <span class="t-ico t-green">🔁</span>
          <span class="t-txt"><strong>Transaction</strong><em>My transaction history</em></span>
        </button>
        <button class="tile" @click="open('deposits')">
          <span class="t-ico t-red">📥</span>
          <span class="t-txt"><strong>Deposit</strong><em>My deposit history</em></span>
        </button>
        <button class="tile" @click="open('withdrawals')">
          <span class="t-ico t-amber">📤</span>
          <span class="t-txt"><strong>Withdraw</strong><em>My withdraw history</em></span>
        </button>
      </section>

      <!-- List -->
      <section class="list">
        <button class="li" @click="open('notification')">
          <span class="li-ico">✉️</span><span class="li-l">Notification</span>
          <span class="badge">1</span><span class="chev">›</span>
        </button>
        <button class="li" @click="open('gifts')">
          <span class="li-ico">🎁</span><span class="li-l">Gifts</span><span class="chev">›</span>
        </button>
        <button class="li" @click="open('stats')">
          <span class="li-ico">📊</span><span class="li-l">Game statistics</span>
          <span class="chev">›</span>
        </button>
        <button class="li" @click="open('language')">
          <span class="li-ico">🌐</span><span class="li-l">Language</span>
          <span class="li-v">English</span><span class="chev">›</span>
        </button>
      </section>

      <!-- Service centre -->
      <section class="service">
        <strong class="sc-title">Service center</strong>
        <div class="sc-grid">
          <button v-for="s in SERVICE" :key="s.key" class="sc" @click="open(s.key)">
            <span class="sc-ico">{{ s.icon }}</span>
            <span>{{ s.label }}</span>
          </button>
        </div>
      </section>

      <button class="logout" @click="logout">⏻ Log out</button>
    </template>

    <!-- Guest -->
    <section v-else class="guest card">
      <strong>You are browsing as a guest</strong>
      <p class="faint">Log in to see your profile, balance and history.</p>
      <router-link class="btn btn-primary" :to="{ name: 'login' }">Log in</router-link>
      <router-link class="btn btn-ghost" :to="{ name: 'register' }">Register</router-link>
    </section>

    <SiteFooter />

    <!-- ================= Sheets ================= -->
    <transition name="fade">
      <div v-if="sheet" class="backdrop" @click.self="sheet = null">
        <div class="sheet">
          <header class="sh">
            <strong>{{ sheetTitle }}</strong>
            <button class="x" @click="sheet = null">✕</button>
          </header>

          <!-- Safe -->
          <div v-if="sheet === 'safe'" class="sbody">
            <div class="safe-split">
              <div>
                <span class="cap">In safe</span>
                <strong class="mono">₹{{ formatMinor(profile.safe?.safeBalance ?? '0') }}</strong>
              </div>
              <div>
                <span class="cap">Spendable</span>
                <strong class="mono">₹{{ formatMinor(profile.safe?.cashBalance ?? '0') }}</strong>
              </div>
            </div>
            <p class="note faint">
              Funds in the safe cannot be staked — bets draw from your spendable balance only.
              Interest accrues at 0.1% a day, credited once a minute, and is calculated the
              moment you open this panel.
            </p>
            <label class="lbl">Amount</label>
            <input v-model="safeAmount" class="in mono" inputmode="decimal" />
            <div class="pair">
              <button class="btn btn-ghost" :disabled="busy" @click="moveSafe('out')">
                Take out
              </button>
              <button class="btn btn-primary" :disabled="busy" @click="moveSafe('in')">
                Put in
              </button>
            </div>
          </div>

          <!-- Game history -->
          <div v-else-if="sheet === 'game-history'" class="sbody">
            <div v-for="g in profile.gameHistory" :key="g.id" class="hrow">
              <div class="hl">
                <div class="hg">{{ g.label }}</div>
                <div class="tiny faint">{{ g.detail }}</div>
                <div class="tiny faint">{{ new Date(g.createdAt).toLocaleString() }}</div>
              </div>
              <div class="hr">
                <span :class="g.status === 'WON' ? 'win' : g.status === 'PENDING' ? 'dim' : 'loss'">
                  {{
                    g.status === 'WON'
                      ? `+₹${formatMinor(g.payout)}`
                      : g.status === 'PENDING'
                        ? 'In play'
                        : `−₹${formatMinor(g.stake)}`
                  }}
                </span>
                <div class="tiny faint">
                  ₹{{ formatMinor(g.stake) }}<template v-if="g.multiplier"> · {{ g.multiplier }}</template>
                </div>
              </div>
            </div>
            <p v-if="!profile.gameHistory.length" class="empty">No games played yet.</p>
          </div>

          <!-- Statistics -->
          <div v-else-if="sheet === 'stats'" class="sbody">
            <template v-if="profile.stats && p">
              <div class="vipbox">
                <div class="row between">
                  <strong>VIP{{ p.vip.level }}</strong>
                  <span class="tiny faint">
                    <template v-if="p.vip.nextAt">
                      ₹{{ formatMinor(p.vip.nextAt) }} turnover for VIP{{ p.vip.nextLevel }}
                    </template>
                    <template v-else>Top tier</template>
                  </span>
                </div>
                <div class="bar"><span :style="{ width: `${p.vip.progress}%` }" /></div>
                <span class="tiny faint">Lifetime turnover ₹{{ formatMinor(p.vip.turnover) }}</span>
              </div>

              <div class="statgrid">
                <div><span class="cap">Bets</span><strong>{{ profile.stats.bets }}</strong></div>
                <div><span class="cap">Won</span><strong>{{ profile.stats.wins }}</strong></div>
                <div><span class="cap">Win rate</span><strong>{{ profile.stats.winRate }}%</strong></div>
                <div><span class="cap">Staked</span><strong class="mono">₹{{ formatMinor(profile.stats.staked) }}</strong></div>
                <div><span class="cap">Returned</span><strong class="mono">₹{{ formatMinor(profile.stats.won) }}</strong></div>
                <div>
                  <span class="cap">Net</span>
                  <strong class="mono" :class="BigInt(profile.stats.net) >= 0n ? 'win' : 'loss'">
                    {{ BigInt(profile.stats.net) >= 0n ? '+' : '−' }}₹{{
                      formatMinor(BigInt(profile.stats.net) < 0n ? -BigInt(profile.stats.net) : profile.stats.net)
                    }}
                  </strong>
                </div>
              </div>

              <strong class="sub">By game</strong>
              <div v-for="g in profile.stats.byGame" :key="g.gameCode" class="grow">
                <span>{{ g.label }}</span>
                <span class="tiny faint">{{ g.bets }} bets</span>
                <span class="mono tiny">₹{{ formatMinor(g.staked) }}</span>
              </div>
              <p v-if="!profile.stats.byGame.length" class="empty">No games played yet.</p>
            </template>
          </div>

          <!-- Money histories -->
          <div
            v-else-if="['transactions', 'deposits', 'withdrawals'].includes(sheet)"
            class="sbody"
          >
            <div v-for="t in profile.moneyHistory" :key="t.id" class="hrow">
              <div class="hl">
                <div class="hg">{{ t.type.replaceAll('_', ' ').toLowerCase() }}</div>
                <div class="tiny faint">{{ t.memo }}</div>
                <div class="tiny faint">{{ new Date(t.createdAt).toLocaleString() }}</div>
              </div>
              <div class="hr">
                <span :class="BigInt(t.amount) >= 0n ? 'win' : 'loss'">
                  {{ BigInt(t.amount) >= 0n ? '+' : '−' }}₹{{
                    formatMinor(BigInt(t.amount) < 0n ? -BigInt(t.amount) : t.amount)
                  }}
                </span>
                <div class="tiny faint mono">bal ₹{{ formatMinor(t.balanceAfter) }}</div>
              </div>
            </div>
            <p v-if="!profile.moneyHistory.length" class="empty">
              <template v-if="sheet === 'withdrawals'">
                No withdrawals. Withdrawal is not available in this build — no payment provider
                is connected.
              </template>
              <template v-else>Nothing here yet.</template>
            </p>
          </div>

          <!-- Static panels -->
          <div v-else class="sbody">
            <p v-for="(line, i) in PANEL_TEXT[sheet]?.lines ?? []" :key="i" class="ptxt">
              {{ line }}
            </p>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped lang="scss">
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 12px 0;
}

/* --- identity ------------------------------------------------------------ */
.ident {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, #6a7bd6, #3b4a9e);
  flex: 0 0 auto;
}

.namerow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name {
  font-size: 16px;
  font-weight: 800;
  word-break: break-all;
}

.vip {
  padding: 2px 9px;
  border-radius: 999px;
  background: linear-gradient(135deg, #9aa7c7, #6b7899);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
}

.uid {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 5px 0 4px;
  padding: 3px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.uid-tag {
  opacity: 0.85;
  border-right: 1px solid rgba(255, 255, 255, 0.4);
  padding-right: 7px;
}

.cp {
  font-size: 11px;
}

.last {
  font-size: 11px;
  color: var(--text-dim);
}

.copied {
  position: absolute;
  top: 0;
  right: 0;
  font-size: 10px;
  color: var(--green);
}

/* --- balance ------------------------------------------------------------- */
.balance {
  background: linear-gradient(135deg, #33407a, #26305e);
  border-radius: var(--radius);
  padding: 16px 14px;
}

.brow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.cap {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.amt {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 26px;
  font-weight: 800;
  margin-top: 2px;
}

.refresh {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.75);

  &.spin {
    animation: rot 0.8s linear infinite;
  }
}

@keyframes rot {
  to {
    transform: rotate(360deg);
  }
}

.enter {
  padding: 10px 18px;
  border-radius: 999px;
  background: #4a7dff;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  flex: 0 0 auto;
}

.quick {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 18px;
}

.q {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}

.qi {
  font-size: 24px;
}

/* --- safe ---------------------------------------------------------------- */
.safe-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius);
  background: var(--surface);
  text-align: left;
}

.safe-ico {
  font-size: 30px;
  flex: 0 0 auto;
}

.safe-body {
  flex: 1;
  min-width: 0;
}

.safe-head {
  display: flex;
  align-items: center;
  gap: 8px;

  strong {
    font-size: 16px;
    margin-right: auto;
  }
}

.safe-amt {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--gold);
  color: #2a1a00;
  font-size: 11px;
  font-weight: 800;
}

.safe-note {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-dim);
}

.chev {
  color: var(--text-faint);
  font-size: 16px;
}

/* --- tiles --------------------------------------------------------------- */
.tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.tile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--surface);
  text-align: left;
}

.t-ico {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex: 0 0 auto;
}

.t-blue {
  background: rgba(74, 125, 255, 0.18);
}
.t-green {
  background: rgba(22, 185, 121, 0.18);
}
.t-red {
  background: rgba(232, 69, 60, 0.18);
}
.t-amber {
  background: rgba(245, 166, 35, 0.18);
}

.t-txt {
  display: flex;
  flex-direction: column;
  min-width: 0;

  strong {
    font-size: 13px;
  }

  em {
    font-style: normal;
    font-size: 10px;
    color: var(--text-faint);
  }
}

/* --- list ---------------------------------------------------------------- */
.list {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 2px 14px;
}

.li {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 13px 0;
  border-bottom: 1px solid rgba(49, 60, 85, 0.5);
  text-align: left;

  &:last-child {
    border-bottom: 0;
  }
}

.li-ico {
  font-size: 17px;
}

.li-l {
  flex: 1;
  font-size: 14px;
}

.li-v {
  font-size: 13px;
  color: var(--text-dim);
}

.badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--red);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* --- service ------------------------------------------------------------- */
.service {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 14px;
}

.sc-title {
  display: block;
  margin-bottom: 12px;
  font-size: 15px;
}

.sc-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px 8px;
}

.sc {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: var(--text-dim);
}

.sc-ico {
  font-size: 22px;
}

.logout {
  height: 46px;
  border-radius: 999px;
  border: 1px solid #4a7dff;
  color: #7ba1ff;
  font-size: 15px;
  font-weight: 600;
}

.guest {
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: center;

  .btn {
    text-decoration: none;
  }
}

/* --- sheets -------------------------------------------------------------- */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 300;
}

.sheet {
  width: 100%;
  max-width: var(--shell);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
}

.sh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);

  strong {
    font-size: 15px;
  }
}

.x {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--text-dim);
  font-size: 12px;
}

.sbody {
  padding: 14px 16px 20px;
  overflow-y: auto;
}

.ptxt {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-dim);
}

.safe-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;

  > div {
    background: var(--surface-2);
    border-radius: 8px;
    padding: 9px 11px;
  }

  strong {
    display: block;
    font-size: 17px;
    margin-top: 2px;
  }
}

.note {
  margin: 0 0 12px;
  font-size: 11px;
  line-height: 1.7;
}

.lbl {
  display: block;
  margin-bottom: 5px;
  font-size: 11px;
  color: var(--text-dim);
}

.in {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  outline: none;
  font-size: 16px;
  margin-bottom: 12px;

  &:focus {
    border-color: var(--gold);
  }
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.hrow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(49, 60, 85, 0.4);

  &:last-child {
    border-bottom: 0;
  }
}

.hg {
  font-size: 13px;
  font-weight: 700;
  text-transform: capitalize;
}

.hl {
  min-width: 0;
}

.hr {
  text-align: right;
  font-weight: 700;
  font-size: 13px;
  flex: 0 0 auto;
}

.vipbox {
  background: var(--surface-2);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}

.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  margin: 8px 0 6px;
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--accent-from), var(--accent-to));
  }
}

.statgrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;

  > div {
    background: var(--surface-2);
    border-radius: 8px;
    padding: 8px 10px;
  }

  strong {
    display: block;
    font-size: 15px;
    margin-top: 2px;
  }
}

.sub {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
}

.grow {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid rgba(49, 60, 85, 0.4);
  font-size: 12px;
}

.empty {
  padding: 22px 0;
  text-align: center;
  color: var(--text-faint);
  font-size: 12px;
  line-height: 1.7;
}

.tiny {
  font-size: 10px;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 92px;
  transform: translateX(-50%);
  background: rgba(20, 26, 40, 0.96);
  border: 1px solid var(--line);
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 13px;
  z-index: 400;
  max-width: 90%;
  text-align: center;
}
</style>
