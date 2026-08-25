<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { formatMinor } from '@lp/shared';
import { api, apiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import SiteFooter from '@/components/SiteFooter.vue';

const auth = useAuthStore();

interface SideStats {
  registers: number;
  depositors: number;
  depositAmount: string;
  firstDepositors: number;
}

interface Overview {
  inviteCode: string;
  yesterdayCommission: string;
  weekCommission: string;
  totalCommission: string;
  direct: SideStats;
  team: SideStats;
  levels: Array<{ level: number; users: number; rateBps: number }>;
}

const overview = ref<Overview | null>(null);
const subordinates = ref<Array<{ name: string; uid: string; joinedAt: string; turnover: string }>>([]);
const commissions = ref<
  Array<{ date: string; turnover: string; amount: string; levels: Array<{ level: number; users: number; turnover: string; rateBps: number; amount: string }> }>
>([]);
const rebate = ref<{ rates: Array<{ level: number; rateBps: number; ratePercent: number }>; totalBps: number; houseRakeBps: number } | null>(null);

const subLevel = ref(1);
const loading = ref(false);
const toast = ref('');
const copied = ref(false);

type Sheet = null | 'subordinates' | 'commission' | 'rules' | 'support' | 'rebate';
const sheet = ref<Sheet>(null);

const inviteLink = computed(() =>
  overview.value ? `${location.origin}/#/register?invite=${overview.value.inviteCode}` : '',
);

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/agency/overview');
    overview.value = data.data;
  } catch (err) {
    flash(apiError(err));
  } finally {
    loading.value = false;
  }
}

async function open(s: Sheet) {
  sheet.value = s;
  try {
    if (s === 'subordinates') await loadSubs();
    if (s === 'commission') {
      const { data } = await api.get('/agency/commissions?take=30');
      commissions.value = data.data;
    }
    if (s === 'rebate') {
      const { data } = await api.get('/agency/rebate-table');
      rebate.value = data.data;
    }
  } catch (err) {
    flash(apiError(err));
  }
}

async function loadSubs() {
  const { data } = await api.get(`/agency/subordinates?level=${subLevel.value}&take=50`);
  subordinates.value = data.data;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1600);
    flash('Copied');
  } catch {
    flash('Copy blocked — select the text instead');
  }
}

let toastTimer: number | undefined;
function flash(m: string) {
  toast.value = m;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2400);
}

onMounted(() => {
  if (auth.isLoggedIn) void load();
});

const SHEET_TITLES: Record<string, string> = {
  subordinates: 'Subordinate data',
  commission: 'Commission detail',
  rules: 'Invitation rules',
  support: 'Agent line customer service',
  rebate: 'Rebate ratio',
};
</script>

<template>
  <div class="page">
    <header class="topbar">
      <span class="title">Agency</span>
      <button class="doc" @click="open('rules')">📄</button>
    </header>

    <template v-if="auth.isLoggedIn && overview">
      <!-- Commission hero -->
      <section class="hero">
        <div class="big mono">{{ formatMinor(overview.yesterdayCommission) }}</div>
        <span class="pill">Yesterday's total commission</span>
        <p class="hint">Upgrade the level to increase commission income</p>
      </section>

      <!-- Subordinate columns -->
      <section class="subs">
        <div class="sub-head">
          <span>Direct subordinates</span>
          <span>Team subordinates</span>
        </div>
        <div class="sub-body">
          <div class="col">
            <div class="v">{{ overview.direct.registers }}</div>
            <div class="k">number of register</div>
            <div class="v green">{{ overview.direct.depositors }}</div>
            <div class="k">Deposit number</div>
            <div class="v amber">{{ formatMinor(overview.direct.depositAmount) }}</div>
            <div class="k">Deposit amount</div>
            <div class="v">{{ overview.direct.firstDepositors }}</div>
            <div class="k">Number of people making first deposit</div>
          </div>
          <div class="col">
            <div class="v">{{ overview.team.registers }}</div>
            <div class="k">number of register</div>
            <div class="v green">{{ overview.team.depositors }}</div>
            <div class="k">Deposit number</div>
            <div class="v amber">{{ formatMinor(overview.team.depositAmount) }}</div>
            <div class="k">Deposit amount</div>
            <div class="v">{{ overview.team.firstDepositors }}</div>
            <div class="k">Number of people making first deposit</div>
          </div>
        </div>
      </section>

      <button class="invite-btn" @click="copy(inviteLink)">INVITATION LINK</button>

      <!-- Rows -->
      <section class="rows">
        <button class="row" @click="copy(overview.inviteCode)">
          <span class="r-ico i-blue">📋</span>
          <span class="r-l">Copy invitation code</span>
          <span class="r-v mono">{{ overview.inviteCode }}</span>
          <span class="cp">⧉</span>
        </button>
      </section>

      <section class="rows">
        <button class="row" @click="open('subordinates')">
          <span class="r-ico i-blue">📑</span><span class="r-l">Subordinate data</span>
          <span class="chev">›</span>
        </button>
      </section>
      <section class="rows">
        <button class="row" @click="open('commission')">
          <span class="r-ico i-green">💲</span><span class="r-l">Commission detail</span>
          <span class="chev">›</span>
        </button>
      </section>
      <section class="rows">
        <button class="row" @click="open('rules')">
          <span class="r-ico i-violet">📕</span><span class="r-l">Invitation rules</span>
          <span class="chev">›</span>
        </button>
      </section>
      <section class="rows">
        <button class="row" @click="open('support')">
          <span class="r-ico i-cyan">🎧</span><span class="r-l">Agent line customer service</span>
          <span class="chev">›</span>
        </button>
      </section>
      <section class="rows">
        <button class="row" @click="open('rebate')">
          <span class="r-ico i-amber">💰</span><span class="r-l">Rebate ratio</span>
          <span class="chev">›</span>
        </button>
      </section>

      <!-- Promotion data -->
      <section class="pdata">
        <div class="pd-head"><span class="r-ico i-blue">📰</span> promotion data</div>
        <div class="pd-grid">
          <div>
            <strong class="mono">{{ formatMinor(overview.weekCommission) }}</strong>
            <span>This Week</span>
          </div>
          <div>
            <strong class="mono">{{ formatMinor(overview.totalCommission) }}</strong>
            <span>Total commission</span>
          </div>
          <div>
            <strong class="mono">{{ overview.direct.registers }}</strong>
            <span>direct subordinate</span>
          </div>
          <div>
            <strong class="mono">{{ overview.team.registers }}</strong>
            <span>Total number of subordinates in the team</span>
          </div>
        </div>
      </section>
    </template>

    <section v-else-if="!auth.isLoggedIn" class="guest card">
      <strong>Agency promotion center</strong>
      <p class="faint">Log in to view your invitation code, subordinate data and commission.</p>
      <router-link class="btn btn-primary" :to="{ name: 'login' }">Log in</router-link>
    </section>

    <p v-else-if="loading" class="loading faint">Loading…</p>

    <SiteFooter />

    <!-- ================= Sheets ================= -->
    <transition name="fade">
      <div v-if="sheet" class="backdrop" @click.self="sheet = null">
        <div class="sheet">
          <header class="sh">
            <strong>{{ SHEET_TITLES[sheet] }}</strong>
            <button class="x" @click="sheet = null">✕</button>
          </header>

          <!-- Subordinates -->
          <div v-if="sheet === 'subordinates'" class="sbody">
            <div class="lvtabs">
              <button
                v-for="l in overview?.levels ?? []"
                :key="l.level"
                :class="{ on: subLevel === l.level }"
                @click="((subLevel = l.level), loadSubs())"
              >
                L{{ l.level }} <em>{{ l.users }}</em>
              </button>
              <span v-if="!overview?.levels.length" class="faint tiny">No team yet</span>
            </div>
            <div v-for="s in subordinates" :key="s.uid" class="srow">
              <div>
                <div class="sname">{{ s.name }}</div>
                <div class="tiny faint mono">UID {{ s.uid }}</div>
              </div>
              <div class="right">
                <div class="mono">₹{{ formatMinor(s.turnover) }}</div>
                <div class="tiny faint">turnover</div>
              </div>
            </div>
            <p v-if="!subordinates.length" class="empty">
              No subordinates at this level. Share your invitation link to build a team.
            </p>
          </div>

          <!-- Commission detail -->
          <div v-else-if="sheet === 'commission'" class="sbody">
            <p class="note faint">
              Commission is settled once per whole day. Today is still accumulating and
              appears tomorrow.
            </p>
            <div v-for="c in commissions" :key="c.date" class="crow">
              <div class="chead">
                <strong>{{ new Date(c.date).toLocaleDateString() }}</strong>
                <span :class="BigInt(c.amount) > 0n ? 'win' : 'dim'">
                  +₹{{ formatMinor(c.amount) }}
                </span>
              </div>
              <div class="tiny faint">Team turnover ₹{{ formatMinor(c.turnover) }}</div>
              <div v-for="l in c.levels.filter((x) => BigInt(x.turnover) > 0n)" :key="l.level" class="lrow">
                <span>L{{ l.level }} · {{ l.users }} players</span>
                <span class="tiny faint">{{ (l.rateBps / 100).toFixed(2) }}%</span>
                <span class="mono tiny">₹{{ formatMinor(l.amount) }}</span>
              </div>
            </div>
            <p v-if="!commissions.length" class="empty">
              No settled days yet. Commission appears the day after your team plays.
            </p>
          </div>

          <!-- Rebate ratio -->
          <div v-else-if="sheet === 'rebate'" class="sbody">
            <p class="note faint">
              You earn a share of everything your team stakes — win or lose. Rates fall away
              with depth.
            </p>
            <div v-for="r in rebate?.rates ?? []" :key="r.level" class="lrow head">
              <span>Level {{ r.level }}</span>
              <span class="mono">{{ r.ratePercent.toFixed(2) }}% of turnover</span>
            </div>
            <p v-if="rebate" class="note faint">
              Across all {{ rebate.rates.length }} levels that totals
              {{ (rebate.totalBps / 100).toFixed(2) }}% of team turnover, against a
              {{ (rebate.houseRakeBps / 100).toFixed(2) }}% house rake — so a fully built
              team still leaves the platform sustainable.
            </p>
          </div>

          <!-- Rules -->
          <div v-else-if="sheet === 'rules'" class="sbody">
            <p class="ptxt">
              Anyone who registers with your invitation code is permanently attributed to
              you, and so is anyone <em>they</em> invite, six levels deep.
            </p>
            <p class="ptxt">
              You earn a rebate on your team's turnover — the total they stake, regardless
              of whether they win or lose. Nothing is taken from their winnings; the rebate
              is paid by the platform.
            </p>
            <p class="ptxt">
              Commission is calculated once per whole day and credited to your balance
              automatically. There is no minimum and nothing to claim.
            </p>
            <p class="ptxt">
              Self-referral does not work: the tree records who invited whom at signup and a
              player cannot be their own upline.
            </p>
          </div>

          <!-- Agent support -->
          <div v-else class="sbody">
            <p class="ptxt">No agent support desk is connected to this build yet.</p>
            <p class="ptxt">
              When one is, this is where high-volume agents reach a dedicated line rather
              than general customer service.
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
  gap: 10px;
  padding: 0 12px;
  background: #232a5c;
  min-height: 100vh;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 14px 0;
  margin: 0 -12px;
  background: #2d3470;

  .title {
    font-size: 17px;
    font-weight: 700;
  }
}

.doc {
  position: absolute;
  right: 14px;
  font-size: 18px;
}

/* --- hero ---------------------------------------------------------------- */
.hero {
  margin: 0 -12px;
  padding: 22px 14px 26px;
  background: linear-gradient(160deg, #4aa3f0, #6fbcf7 60%, #4aa3f0);
  text-align: center;
  color: #fff;
}

.big {
  font-size: 34px;
  font-weight: 800;
  line-height: 1;
}

.pill {
  display: inline-block;
  margin: 12px 0 8px;
  padding: 8px 20px;
  border-radius: 999px;
  background: #3a53a8;
  color: #cfe4ff;
  font-size: 14px;
  font-weight: 600;
}

.hint {
  margin: 0;
  font-size: 12px;
  opacity: 0.95;
}

/* --- subordinate columns ------------------------------------------------- */
.subs {
  margin-top: -14px;
  border-radius: 12px;
  overflow: hidden;
  background: #2d3470;
}

.sub-head {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: #39418a;

  span {
    padding: 14px 6px;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
  }
}

.sub-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.col {
  padding: 14px 10px;
  text-align: center;

  & + .col {
    border-left: 1px solid #454d99;
  }

  .v {
    font-size: 15px;
    font-weight: 700;
  }

  .k {
    margin-bottom: 12px;
    font-size: 12px;
    color: #b9c2ee;
    line-height: 1.4;
  }

  .k:last-child {
    margin-bottom: 0;
  }
}

.green {
  color: #4ade80;
}
.amber {
  color: #fbbf24;
}

/* --- invite -------------------------------------------------------------- */
.invite-btn {
  height: 52px;
  border-radius: 999px;
  background: linear-gradient(90deg, #4aa3f0, #3b6ef0);
  color: #fff;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 1px;
}

/* --- rows ---------------------------------------------------------------- */
.rows {
  background: #2d3470;
  border-radius: 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 16px 14px;
  text-align: left;
}

.r-ico {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex: 0 0 auto;
}

.i-blue {
  background: rgba(74, 163, 240, 0.22);
}
.i-green {
  background: rgba(74, 222, 128, 0.2);
}
.i-violet {
  background: rgba(155, 89, 246, 0.22);
}
.i-cyan {
  background: rgba(45, 212, 191, 0.2);
}
.i-amber {
  background: rgba(251, 191, 36, 0.2);
}

.r-l {
  flex: 1;
  font-size: 15px;
}

.r-v {
  font-size: 13px;
  color: #b9c2ee;
}

.cp,
.chev {
  color: #b9c2ee;
  font-size: 16px;
}

/* --- promotion data ------------------------------------------------------ */
.pdata {
  background: #2d3470;
  border-radius: 12px;
  padding: 14px;
}

.pd-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 14px;
}

.pd-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px 8px;
  text-align: center;

  strong {
    display: block;
    font-size: 17px;
    font-weight: 700;
  }

  span {
    font-size: 12px;
    color: #b9c2ee;
    line-height: 1.4;
  }

  > div + div {
    border-left: 1px solid #454d99;
  }

  > div:nth-child(3) {
    border-left: 0;
  }
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

.loading {
  text-align: center;
  padding: 30px 0;
  font-size: 12px;
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
  background: #2d3470;
  border-radius: 16px 16px 0 0;
}

.sh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #454d99;

  strong {
    font-size: 15px;
  }
}

.x {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #39418a;
  color: #b9c2ee;
  font-size: 12px;
}

.sbody {
  padding: 14px 16px 20px;
  overflow-y: auto;
}

.ptxt {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.75;
  color: #cbd3f5;

  em {
    font-style: italic;
    color: #fff;
  }
}

.note {
  margin: 0 0 12px;
  font-size: 11px;
  line-height: 1.7;
}

.lvtabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;

  button {
    padding: 5px 11px;
    border-radius: 999px;
    background: #39418a;
    color: #b9c2ee;
    font-size: 12px;
    font-weight: 700;

    em {
      font-style: normal;
      opacity: 0.75;
    }

    &.on {
      background: #4aa3f0;
      color: #fff;
    }
  }
}

.srow,
.crow {
  padding: 10px 0;
  border-bottom: 1px solid rgba(69, 77, 153, 0.6);

  &:last-child {
    border-bottom: 0;
  }
}

.srow {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sname {
  font-size: 13px;
  font-weight: 700;
}

.right {
  text-align: right;
}

.chead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 3px;
}

.lrow {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 5px 0;
  font-size: 12px;
  color: #cbd3f5;

  &.head {
    border-bottom: 1px solid rgba(69, 77, 153, 0.6);
    padding: 9px 0;
    grid-template-columns: 1fr auto;
    font-size: 13px;
  }
}

.empty {
  padding: 22px 0;
  text-align: center;
  color: #8d97cf;
  font-size: 12px;
  line-height: 1.7;
}

.faint {
  color: #8d97cf;
}

.tiny {
  font-size: 10px;
}

.win {
  color: #4ade80;
}

.dim {
  color: #8d97cf;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 92px;
  transform: translateX(-50%);
  background: rgba(20, 26, 60, 0.97);
  border: 1px solid #454d99;
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 13px;
  z-index: 400;
}
</style>
