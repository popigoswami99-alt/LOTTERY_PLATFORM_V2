<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { formatMinor } from '@lp/shared';
import { api, apiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import SiteFooter from '@/components/SiteFooter.vue';

const auth = useAuthStore();

interface Overview {
  todayBonus: string;
  totalBonus: string;
  checkin: {
    streak: number;
    claimedToday: boolean;
    nextDay: number;
    nextReward: string;
    ladder: Array<{ day: number; amount: string }>;
    history: Array<{ date: string; amount: string }>;
  };
  wheel: {
    earned: number;
    used: number;
    available: number;
    prizes: Array<{ amount: string; chance: number }>;
  };
  firstDeposit: {
    firstDepositAmount: string | null;
    qualifiedThreshold: string | null;
    qualifiedBonus: string | null;
    claimed: boolean;
    ratePct: number;
    tiers: Array<{ threshold: string; bonus: string; qualified: boolean; skipped: boolean }>;
  };
  rebateRate: number;
  promo: {
    subDeposit: string;
    subBet: string;
    claims: Array<{ level: number; boxGroup: number }>;
  };
}

const ov = ref<Overview | null>(null);
const history = ref<Array<{ id: string; type: string; scope: string; amount: string; createdAt: string }>>([]);
const loading = ref(false);
const busy = ref(false);
const toast = ref('');
const giftCode = ref('');
const spinResult = ref<{ prize: string; index: number } | null>(null);

type Sheet =
  | null
  | 'details'
  | 'checkin'
  | 'gifts'
  | 'wheel'
  | 'rebate'
  | 'first-deposit'
  | 'promo'
  | 'promotion-levels';
const sheet = ref<Sheet>(null);
const promo = ref<(typeof BANNERS)[number] | null>(null);

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/activity/overview');
    ov.value = data.data;
    
    // Also load promo
    const { data: promoData } = await api.get('/activity/promotions');
    if (ov.value) ov.value.promo = promoData.data;
  } catch (err) {
    flash(apiError(err));
  } finally {
    loading.value = false;
  }
}

async function open(s: Sheet) {
  sheet.value = s;
  if (s === 'details') {
    const { data } = await api.get('/activity/bonus-history?take=50');
    history.value = data.data;
  }
  if (s === 'wheel') spinResult.value = null;
}

async function act(fn: () => Promise<void>) {
  busy.value = true;
  try {
    await fn();
    await load();
    await auth.refreshBalance();
  } catch (err) {
    flash(apiError(err));
  } finally {
    busy.value = false;
  }
}

const checkIn = () =>
  act(async () => {
    const { data } = await api.post('/activity/checkin', {});
    flash(`Day ${data.data.day} — ₹${formatMinor(data.data.amount)} added`);
  });

const redeem = () =>
  act(async () => {
    const { data } = await api.post('/activity/gift', { code: giftCode.value });
    flash(`Redeemed — ₹${formatMinor(data.data.amount)} added`);
    giftCode.value = '';
  });

const claimFirst = () =>
  act(async () => {
    const { data } = await api.post('/activity/first-deposit', {});
    flash(`First deposit bonus — ₹${formatMinor(data.data.amount)} added`);
  });

const spin = () =>
  act(async () => {
    const { data } = await api.post('/activity/wheel/spin', {});
    spinResult.value = { prize: data.data.prize, index: data.data.index };
    flash(`You won ₹${formatMinor(data.data.prize)}`);
  });

let toastTimer: number | undefined;
function flash(m: string) {
  toast.value = m;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2800);
}

onMounted(() => {
  if (auth.isLoggedIn) void load();
});

/** Top icon row — each opens its own mechanic. */
const SHORTCUTS = [
  { key: 'details' as const, icon: '🏆', label: 'Activity Award', tone: 's-rose' },
  { key: 'rebate' as const, icon: '💰', label: 'Betting rebate', tone: 's-amber' },
  { key: 'promotion-levels' as const, icon: '🏅', label: 'Promotion Levels', tone: 's-green' },
  { key: 'first-deposit' as const, icon: '🎁', label: 'First gift', tone: 's-violet' },
  { key: 'wheel' as const, icon: '🎡', label: 'Invite Wheel', tone: 's-rose' },
];

/**
 * Campaign banners.
 *
 * `live` marks the ones with real mechanics behind them; the rest are
 * marketing campaigns on the reference site that would be operator-run, and
 * their detail sheet says so rather than pretending to pay.
 */
const BANNERS = [
  {
    key: 'promotion-levels',
    title: 'PROMOTION LEVELS',
    sub: 'BONUS BOXES',
    caption: '🎉 Subordinate Promotion Levels 🎉',
    tone: 'b-green',
    live: true,
    detail: 'Unlock 100 bonus boxes at each level by referring active players. Level 1 (₹500 deposit, ₹5,000 bet) pays ₹600. Level 2 (₹2,000 deposit, ₹20,000 bet) pays ₹1,000. Level 3 (₹5,000 deposit, ₹50,000 bet) pays ₹3,000.',
  },
  {
    key: 'first-deposit',
    title: 'FIRST DEPOSIT',
    sub: 'UP TO ₹50,000 BONUS',
    caption: '💸 First Deposit Bonus 💸',
    tone: 'b-navy',
    live: true,
    detail:
      'A 10% welcome bonus sized by your first deposit — the bigger the deposit, the higher the bracket it reaches, from ₹500 up to ₹5,00,000. Only the highest bracket your deposit clears pays; lower brackets are superseded, not stacked. Claimable once per account.',
  },
  {
    key: 'checkin',
    title: 'DAILY CHECK-IN',
    sub: 'BONUS · CLAIM REWARD',
    caption: '💰 Get Daily Check-in Bonus 💰',
    tone: 'b-blue',
    live: true,
    detail:
      'Check in once a day. The reward climbs with your streak — ₹1, ₹2, ₹5, ₹10, ₹20, ₹50, then ₹100 from day seven. Miss a day and the streak resets.',
  },
  {
    key: 'aviator',
    title: 'FLY HIGH & WIN BIG',
    sub: 'AVIATOR SPECIAL CHALLENGE',
    caption: '🚀 Aviator Fly High & Win Big 🚀',
    tone: 'b-red',
    live: true,
    route: 'crash',
    detail:
      'Aviator runs continuous rounds with a provably fair bust point. No separate prize pool is running — this opens the game.',
  },
  {
    key: 'rebate',
    title: 'BETTING REBATE',
    sub: 'ON EVERY STAKE',
    caption: '💰 Daily Betting Rebate 💰',
    tone: 'b-gold',
    live: true,
    detail:
      'You get 0.20% of everything you stake back, win or lose. Settled once per whole day and credited automatically — nothing to claim.',
  },
  {
    key: 'wheel',
    title: 'INVITE WHEEL',
    sub: 'SPIN FOR REWARDS',
    caption: '🎡 Invite & Spin 🎡',
    tone: 'b-violet',
    live: true,
    detail:
      'Every player who registers with your invite code earns you one spin. The prize is drawn from your own provably fair seed pair, so it can be verified like a game round.',
  },
  {
    key: 'gifts',
    title: 'MYSTERIOUS GIFT',
    sub: 'REDEMPTION CODES',
    caption: '❗ Gift Codes ❗',
    tone: 'b-dark',
    live: true,
    detail:
      'Enter a redemption code to credit its reward. Each code can be used once per account, and has a total redemption limit.',
  },
  {
    key: 'affiliate',
    title: 'AFFILIATE PROGRAM',
    sub: 'AGENT COMMISSION',
    caption: '$ Affiliate Program $',
    tone: 'b-teal',
    live: true,
    route: 'promotion',
    detail:
      'Earn a rebate on your whole team’s turnover, six levels deep, from 0.70% at level one down to 0.02% at level six. Settled daily and paid automatically.',
  },
  {
    key: 'streak',
    title: 'WIN STREAK BONUS',
    sub: 'WINGO',
    caption: '✨ Member Wingo Winning Streak ✨',
    tone: 'b-indigo',
    live: false,
    detail:
      'Not built. A streak bonus would pay an escalating reward for consecutive Win Go wins.',
  },
  {
    key: 'mission',
    title: 'MISSION BONUS',
    sub: 'DAILY / WEEKLY TASKS',
    caption: '⚙️ Mission Bonus ⚙️',
    tone: 'b-slate',
    live: false,
    detail:
      'Not built. Missions would set daily and weekly targets — place N bets, stake a total — and pay on completion.',
  },
  {
    key: 'jackpot',
    title: 'SUPER JACKPOT',
    sub: 'PRIZE POOL',
    caption: '🏅 Super Jackpot 🏅',
    tone: 'b-purple',
    live: false,
    detail:
      'Not built. A progressive jackpot would take a slice of turnover into a pool paid out on a rare trigger.',
  },
];

function openBanner(b: (typeof BANNERS)[number]) {
  promo.value = b;
  sheet.value = 'promo';
}

function shortcut(key: string) {
  if (key === 'promo-jackpot') {
    openBanner(BANNERS.find((b) => b.key === 'jackpot')!);
    return;
  }
  void open(key as Sheet);
}

const sheetTitle = computed(() => {
  const map: Record<string, string> = {
    details: 'Bonus details',
    checkin: 'Attendance bonus',
    gifts: 'Gifts',
    wheel: 'Invite Wheel',
    rebate: 'Betting rebate',
    'first-deposit': 'First gift',
    promo: promo.value?.caption ?? '',
  };
  return map[sheet.value ?? ''] ?? '';
});

const TYPE_LABEL: Record<string, string> = {
  CHECKIN: 'Daily check-in',
  REBATE: 'Betting rebate',
  FIRST_DEPOSIT: 'First deposit bonus',
  GIFT_CODE: 'Gift code',
  WHEEL: 'Invite wheel',
  PROMO_BOX: 'Promotion box claim',
};

const claimPromoBox = (level: number, boxGroup: number) =>
  act(async () => {
    const { data } = await api.post('/activity/promotions/claim', { level, boxGroup });
    flash(`Claimed — ₹${formatMinor(data.data.amount)} added`);
  });
</script>

<template>
  <div class="page">
    <template v-if="auth.isLoggedIn && ov">
      <!-- Bonus summary -->
      <header class="summary">
        <div class="pair">
          <div>
            <span class="cap">Today's bonus</span>
            <strong class="mono">₹{{ formatMinor(ov.todayBonus) }}</strong>
          </div>
          <span class="divider" />
          <div>
            <span class="cap">Total bonus</span>
            <strong class="mono">₹{{ formatMinor(ov.totalBonus) }}</strong>
          </div>
        </div>
        <button class="details-btn" @click="open('details')">Bonus details</button>
      </header>

      <!-- Shortcut icons -->
      <section class="shortcuts">
        <button v-for="s in SHORTCUTS" :key="s.label" class="sc" @click="shortcut(s.key)">
          <span class="sc-ico" :class="s.tone">{{ s.icon }}</span>
          <span class="sc-l">{{ s.label }}</span>
        </button>
      </section>

      <!-- Gifts + Attendance -->
      <section class="duo">
        <button class="duo-card c-red" @click="open('gifts')">
          <span class="duo-art">🧧</span>
          <span class="duo-body">
            <strong>Gifts</strong>
            <em>Enter the redemption code to receive gift rewards</em>
          </span>
        </button>
        <button class="duo-card c-orange" @click="open('checkin')">
          <span class="duo-art">📅</span>
          <span class="duo-body">
            <strong>Attendance bonus</strong>
            <em>The more consecutive days you sign in, the higher the reward will be.</em>
          </span>
        </button>
      </section>

      <!-- Campaign banners -->
      <section
        v-for="b in BANNERS"
        :key="b.key"
        class="banner-card"
      >
        <button class="banner" :class="b.tone" @click="openBanner(b)">
          <span class="bn-title">{{ b.title }}</span>
          <span class="bn-sub">{{ b.sub }}</span>
          <span v-if="!b.live" class="bn-soon">Not built</span>
        </button>
        <button class="banner-cap" @click="openBanner(b)">{{ b.caption }}</button>
      </section>

      <p class="notice">
        Bonuses are credited straight to your balance through the same ledger as game
        payouts. Everything listed above with a mechanic behind it is calculated
        automatically — there is nothing to chase.
      </p>
    </template>

    <section v-else-if="!auth.isLoggedIn" class="guest card">
      <strong>Activity centre</strong>
      <p class="faint">Log in to see your bonuses and daily rewards.</p>
      <router-link class="btn btn-primary" :to="{ name: 'login' }">Log in</router-link>
    </section>

    <p v-else-if="loading" class="loading faint">Loading…</p>

    <SiteFooter />

    <!-- ================= Sheets ================= -->
    <transition name="fade">
      <div v-if="sheet" class="backdrop" @click.self="sheet = null">
        <div class="sheet">
          <header class="sh">
            <strong>{{ sheetTitle }}</strong>
            <button class="x" @click="sheet = null">✕</button>
          </header>

          <!-- Bonus details -->
          <div v-if="sheet === 'details'" class="sbody">
            <div v-for="h in history" :key="h.id" class="hrow">
              <div>
                <div class="hg">{{ TYPE_LABEL[h.type] ?? h.type }}</div>
                <div class="tiny faint">
                  {{ h.scope }} · {{ new Date(h.createdAt).toLocaleDateString() }}
                </div>
              </div>
              <span :class="BigInt(h.amount) > 0n ? 'win' : 'dim'">
                +₹{{ formatMinor(h.amount) }}
              </span>
            </div>
            <p v-if="!history.length" class="empty">No bonuses yet.</p>
          </div>

          <!-- Attendance -->
          <div v-else-if="sheet === 'checkin' && ov" class="sbody">
            <p class="note faint">
              Check in once a day. Miss a day and the streak resets to day one.
            </p>
            <div class="ladder">
              <div
                v-for="d in ov.checkin.ladder"
                :key="d.day"
                class="rung"
                :class="{
                  done: d.day <= ov.checkin.streak,
                  next: d.day === ov.checkin.nextDay && !ov.checkin.claimedToday,
                }"
              >
                <span class="rd">Day {{ d.day }}</span>
                <span class="ra mono">₹{{ formatMinor(d.amount) }}</span>
              </div>
            </div>
            <div class="streakline">
              Current streak <strong>{{ ov.checkin.streak }}</strong> day(s)
            </div>
            <button
              class="btn btn-primary"
              :disabled="busy || ov.checkin.claimedToday"
              @click="checkIn"
            >
              {{
                ov.checkin.claimedToday
                  ? 'Already checked in today'
                  : `Check in — ₹${formatMinor(ov.checkin.nextReward)}`
              }}
            </button>
          </div>

          <!-- Gifts -->
          <div v-else-if="sheet === 'gifts'" class="sbody">
            <p class="note faint">
              Enter a redemption code. Each code works once per account.
            </p>
            <input
              v-model="giftCode"
              class="in mono"
              placeholder="ENTER CODE"
              maxlength="32"
              @keyup.enter="redeem"
            />
            <button class="btn btn-primary" :disabled="busy || !giftCode" @click="redeem">
              Redeem
            </button>
          </div>

          <!-- Wheel -->
          <div v-else-if="sheet === 'wheel' && ov" class="sbody">
            <div class="wheelbox">
              <div class="wheel-face" :class="{ spun: spinResult }">
                <span v-if="spinResult" class="prize mono">
                  ₹{{ formatMinor(spinResult.prize) }}
                </span>
                <span v-else class="prize idle">🎡</span>
              </div>
              <div class="spins">
                <strong>{{ ov.wheel.available }}</strong> spin(s) available
                <div class="tiny faint">
                  {{ ov.wheel.earned }} earned · {{ ov.wheel.used }} used
                </div>
              </div>
            </div>
            <p class="note faint">
              One spin for every player who registers with your invite code. The result is
              drawn from your own seed pair, so it is verifiable like a game round.
            </p>
            <div class="prizes">
              <div v-for="(p, i) in ov.wheel.prizes" :key="i" class="prow">
                <span class="mono">₹{{ formatMinor(p.amount) }}</span>
                <span class="tiny faint">{{ p.chance }}%</span>
              </div>
            </div>
            <button
              class="btn btn-primary"
              :disabled="busy || ov.wheel.available <= 0"
              @click="spin"
            >
              {{ ov.wheel.available > 0 ? 'Spin' : 'Invite a player to earn a spin' }}
            </button>
          </div>

          <!-- Rebate -->
          <div v-else-if="sheet === 'rebate' && ov" class="sbody">
            <p class="ptxt">
              You get <strong>{{ ov.rebateRate }}%</strong> of everything you stake back —
              win or lose.
            </p>
            <p class="ptxt">
              It is settled once per whole day and credited automatically. Today's play
              appears tomorrow; there is nothing to claim.
            </p>
            <p class="ptxt faint">
              This is separate from the agency commission, which pays on your team's
              turnover rather than your own.
            </p>
          </div>

          <!-- First deposit: ONE reward, sized by the highest bracket reached -->
          <div v-else-if="sheet === 'first-deposit' && ov" class="sbody fd-sheet">
            <p class="ptxt faint">
              A {{ ov.firstDeposit.ratePct }}% welcome bonus sized by your first deposit's bracket.
              Claimable once per account — a lower bracket your deposit also clears is superseded by
              the highest one, not paid in addition.
            </p>

            <!-- Your outcome -->
            <div v-if="ov.firstDeposit.firstDepositAmount === null" class="fd-hero">
              <span class="fd-hero-l">Make your first deposit to unlock this bonus.</span>
              <router-link class="fd-btn ready" :to="{ name: 'wallet' }" @click="sheet = null">
                Deposit
              </router-link>
            </div>
            <div v-else class="fd-hero" :class="{ done: ov.firstDeposit.claimed }">
              <span class="fd-hero-l">
                Your first deposit ₹{{ formatMinor(ov.firstDeposit.firstDepositAmount) }}
                <template v-if="ov.firstDeposit.qualifiedBonus">qualifies for a bonus below.</template>
                <template v-else>
                  is below the ₹{{ formatMinor(ov.firstDeposit.tiers[0]?.threshold ?? '0') }} minimum — no
                  bonus qualifies.
                </template>
              </span>
            </div>

            <!-- Every bracket — only the qualified row's Claim button is active -->
            <div class="fd-list">
              <div
                v-for="t in ov.firstDeposit.tiers"
                :key="t.threshold"
                class="fd-row"
                :class="{ qualified: t.qualified, skipped: t.skipped }"
              >
                <span class="fd-title">₹{{ formatMinor(t.threshold) }}</span>
                <span class="fd-bonus">+₹{{ formatMinor(t.bonus) }}</span>
                <button
                  class="fd-claim"
                  :class="{ active: t.qualified && !ov.firstDeposit.claimed }"
                  :disabled="!t.qualified || ov.firstDeposit.claimed || busy"
                  @click="claimFirst"
                >
                  {{ t.qualified && ov.firstDeposit.claimed ? 'Claimed' : 'Claim' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Campaign detail -->
          <div v-else-if="sheet === 'promo' && promo" class="sbody">
            <div class="promo-hero" :class="promo.tone">
              <span class="bn-title">{{ promo.title }}</span>
              <span class="bn-sub">{{ promo.sub }}</span>
            </div>
            <p class="ptxt">{{ promo.detail }}</p>
            <router-link
              v-if="promo.route"
              class="btn btn-primary"
              :to="{ name: promo.route }"
              @click="sheet = null"
            >
              Open
            </router-link>
            <button
              v-else-if="promo.live"
              class="btn btn-primary"
              @click="open(promo.key as Sheet)"
            >
              Open
            </button>
          </div>

          <!-- Promotion Levels -->
          <div v-else-if="sheet === 'promotion-levels' && ov" class="sbody fd-sheet">
            <p class="ptxt faint">
              Unlock 100 bonus boxes at each level by referring active players. Level 1 pays ₹600, Level 2 pays ₹1,000, Level 3 pays ₹3,000.
            </p>

            <div class="fd-hero">
              <span class="fd-hero-l">
                Subordinates Deposit: <strong>₹{{ formatMinor(ov.promo.subDeposit) }}</strong><br />
                Subordinates Bet: <strong>₹{{ formatMinor(ov.promo.subBet) }}</strong>
              </span>
            </div>

            <div class="fd-list">
              <template v-for="lvl in [1, 2, 3]" :key="lvl">
                <div class="fd-row" style="background: #232a5c; justify-content: center; margin-top: 8px;">
                  <span class="fd-bonus">Level {{ lvl }} Boxes</span>
                </div>
                
                <div v-for="g in 19" :key="g" class="fd-row" :class="{ qualified: true }">
                  <span class="fd-title">{{ g <= 10 ? `Box ${g}` : `Boxes ${g * 10 - 99}-${g * 10 - 90}` }}</span>
                  <button
                    class="fd-claim"
                    :class="{ active: !ov.promo.claims.some(c => c.level === lvl && c.boxGroup === g) }"
                    :disabled="ov.promo.claims.some(c => c.level === lvl && c.boxGroup === g) || busy"
                    @click="claimPromoBox(lvl, g)"
                  >
                    {{ ov.promo.claims.some(c => c.level === lvl && c.boxGroup === g) ? 'Claimed' : 'Claim' }}
                  </button>
                </div>
              </template>
            </div>
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
  padding: 0 12px;
  background: #232a5c;
  min-height: 100vh;
}

/* --- summary ------------------------------------------------------------- */
.summary {
  margin: 0 -12px;
  padding: 20px 14px 24px;
  background: #2d3470;
  text-align: center;
}

.pair {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;

  .cap {
    display: block;
    font-size: 13px;
    color: #b9c2ee;
    margin-bottom: 6px;
  }

  strong {
    font-size: 21px;
    font-weight: 800;
  }
}

.divider {
  width: 1px;
  height: 42px;
  background: #4b54a8;
}

.details-btn {
  margin-top: 18px;
  padding: 11px 34px;
  border-radius: 999px;
  border: 1px solid #6d79d8;
  color: #a9b6ff;
  font-size: 14px;
}

/* --- shortcuts ----------------------------------------------------------- */
.shortcuts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px 6px;
}

.sc {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
}

.sc-ico {
  width: 54px;
  height: 54px;
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 25px;
}

.s-rose {
  background: linear-gradient(160deg, #ffb3b3, #f07b7b);
}
.s-amber {
  background: linear-gradient(160deg, #ffd479, #f0a83a);
}
.s-green {
  background: linear-gradient(160deg, #8ce8c4, #46c79a);
}
.s-violet {
  background: linear-gradient(160deg, #c4a6ff, #9b6ef0);
}

.sc-l {
  font-size: 11px;
  color: #cbd3f5;
  text-align: center;
  line-height: 1.3;
}

/* --- duo ----------------------------------------------------------------- */
.duo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.duo-card {
  border-radius: 12px;
  overflow: hidden;
  text-align: left;
  background: #2d3470;
}

.duo-art {
  display: block;
  padding: 26px 0;
  text-align: center;
  font-size: 42px;
}

.c-red .duo-art {
  background: linear-gradient(160deg, #ff9a8b, #ff5f5f);
}
.c-orange .duo-art {
  background: linear-gradient(160deg, #ffd18b, #ff9d4d);
}

.duo-body {
  display: block;
  padding: 10px 12px 12px;

  strong {
    display: block;
    font-size: 15px;
    margin-bottom: 3px;
  }

  em {
    font-style: normal;
    font-size: 11px;
    color: #b9c2ee;
    line-height: 1.5;
  }
}

/* --- banners ------------------------------------------------------------- */
.banner-card {
  border-radius: 12px;
  overflow: hidden;
  background: #2d3470;
}

.banner {
  position: relative;
  width: 100%;
  min-height: 132px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 18px;
}

.bn-title {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #fff;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  text-align: center;
}

.bn-sub {
  padding: 3px 12px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.35);
  color: #ffd479;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  text-align: center;
}

.bn-soon {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.45);
  color: #b9c2ee;
  font-size: 10px;
  font-weight: 700;
}

.b-navy {
  background: linear-gradient(120deg, #101a3d, #1d2f68 60%, #0d1730);
}
.b-blue {
  background: linear-gradient(120deg, #0d2145, #1b4a8f 60%, #0d2145);
}
.b-red {
  background: linear-gradient(120deg, #1a1030, #3d1030 55%, #8a1230);
}
.b-gold {
  background: linear-gradient(120deg, #3a2a06, #7a5a12 60%, #3a2a06);
}
.b-violet {
  background: linear-gradient(120deg, #1e1040, #45219b 60%, #1e1040);
}
.b-dark {
  background: linear-gradient(120deg, #14141c, #2b2b3d 60%, #14141c);
}
.b-teal {
  background: linear-gradient(120deg, #062a2a, #12605c 60%, #062a2a);
}
.b-indigo {
  background: linear-gradient(120deg, #131a45, #2b3a8f 60%, #131a45);
}
.b-slate {
  background: linear-gradient(120deg, #1b2030, #384259 60%, #1b2030);
}
.b-purple {
  background: linear-gradient(120deg, #200f3a, #4d2090 60%, #200f3a);
}

.banner-cap {
  width: 100%;
  padding: 12px;
  text-align: left;
  font-size: 14px;
  font-weight: 700;
  color: #e6ebff;
}

.notice {
  margin: 4px 0 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: #2d3470;
  font-size: 11px;
  line-height: 1.8;
  color: #b9c2ee;
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
  max-height: 84vh;
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

  .btn {
    margin-top: 12px;
    text-decoration: none;
  }
}

.note,
.ptxt {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.75;
  color: #cbd3f5;

  strong {
    color: #ffd479;
  }
}

.ladder {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 12px;
}

.rung {
  padding: 9px 4px;
  border-radius: 8px;
  background: #39418a;
  text-align: center;

  .rd {
    display: block;
    font-size: 10px;
    color: #b9c2ee;
  }

  .ra {
    font-size: 12px;
    font-weight: 700;
  }

  &.done {
    background: rgba(74, 222, 128, 0.22);
  }

  &.next {
    background: #4aa3f0;
    box-shadow: 0 0 0 2px #a9d6ff;
  }
}

.streakline {
  margin-bottom: 4px;
  font-size: 12px;
  color: #cbd3f5;

  strong {
    color: #ffd479;
    font-size: 15px;
  }
}

.in {
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #454d99;
  background: #232a5c;
  color: #fff;
  outline: none;
  font-size: 16px;
  letter-spacing: 2px;
  text-transform: uppercase;

  &:focus {
    border-color: #ffd479;
  }
}

.wheelbox {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}

.wheel-face {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: conic-gradient(
    #ffd479 0deg 60deg,
    #f07b7b 60deg 120deg,
    #8ce8c4 120deg 180deg,
    #a9b6ff 180deg 240deg,
    #c4a6ff 240deg 300deg,
    #ffb3b3 300deg 360deg
  );
  border: 4px solid #39418a;
  flex: 0 0 auto;

  &.spun {
    animation: pop 0.5s ease;
  }
}

@keyframes pop {
  0% {
    transform: rotate(0) scale(0.9);
  }
  100% {
    transform: rotate(720deg) scale(1);
  }
}

.prize {
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  font-size: 14px;
  font-weight: 800;

  &.idle {
    background: none;
    font-size: 30px;
  }
}

.spins strong {
  font-size: 22px;
  color: #ffd479;
}

/* --- first deposit: one reward, sized by the highest bracket reached ------ */
.fd-sheet {
  max-height: 70vh;
}

.fd-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px;
  margin-bottom: 14px;
  border-radius: 12px;
  background: rgba(255, 212, 121, 0.14);
  border: 1px solid #ffd479;

  &.done {
    opacity: 0.75;
  }
}

.fd-hero-l {
  font-size: 12px;
  line-height: 1.5;
  color: #cbd3f5;
}

.fd-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 44vh;
  overflow-y: auto;
  padding-right: 2px;
}

.fd-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  background: #39418a;
  border: 1px solid transparent;

  &.qualified {
    border-color: #ffd479;
    background: rgba(255, 212, 121, 0.16);
  }
  &.skipped {
    opacity: 0.55;
  }
}

.fd-title {
  font-size: 12px;
  font-weight: 700;
  color: #cbd3f5;
}

.fd-bonus {
  font-size: 12px;
  font-weight: 800;
  color: #ffd479;
  white-space: nowrap;
}

.fd-claim {
  margin-left: auto;
  flex: 0 0 auto;
  height: 28px;
  padding: 0 14px;
  border-radius: 999px;
  border: none;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  background: #232a5c;
  color: #6a74a8;

  &.active {
    background: #16b979;
    color: #fff;
  }
  &:disabled {
    cursor: not-allowed;
  }
}

.fd-btn {
  flex: 0 0 auto;
  height: 34px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid #ffd479;
  color: #ffd479;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;

  &.ready {
    background: #ffd479;
    color: #2d1e00;
  }
  &.done {
    border-color: #4b54a8;
    color: #8d97cf;
  }
  &:disabled {
    opacity: 0.7;
  }
}

.prizes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 4px;
}

.prow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 6px;
  background: #39418a;
  font-size: 12px;
}

.promo-hero {
  min-height: 96px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 12px;
}

.hrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(69, 77, 153, 0.6);
  font-weight: 700;
  font-size: 13px;

  &:last-child {
    border-bottom: 0;
  }
}

.hg {
  font-size: 13px;
}

.empty {
  padding: 22px 0;
  text-align: center;
  color: #8d97cf;
  font-size: 12px;
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
  max-width: 90%;
  text-align: center;
}
</style>
