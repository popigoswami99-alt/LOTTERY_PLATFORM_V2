<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { Swiper, SwiperSlide } from 'swiper/vue';
import { Autoplay, Pagination, EffectCreative, FreeMode } from 'swiper/modules';
import { GAMES, formatMinor } from '@lp/shared';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/client';
import { SLOTS } from '@/data/slots';
import SiteFooter from '@/components/SiteFooter.vue';

import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/effect-creative';
import 'swiper/css/free-mode';

const auth = useAuthStore();
const swiperModules = [Autoplay, Pagination, EffectCreative];
const freeModeModules = [FreeMode];

// ── toast ──────────────────────────────────────────────────────────────────
const toast = ref('');
let toastTimer: number | undefined;
function flash(m: string) {
  toast.value = m;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2600);
}
function tapSlot(name: string) {
  flash(`${name} launches through the game provider — coming soon.`);
}

// ── category tile data ─────────────────────────────────────────────────────
interface Tile { key: string; label: string; art: string; gradient: string; shadow: string; disabled?: boolean; }

const TILES: Tile[] = [
  { key: 'popular',  label: 'Popular',  art: '🏆',
    gradient: 'linear-gradient(140deg, #1336b0 0%, #2563eb 50%, #3b82f6 100%)',
    shadow: '0 8px 28px rgba(37,99,235,0.6)' },
  { key: 'lottery',  label: 'Lottery',  art: '🎱',
    gradient: 'linear-gradient(140deg, #5b21b6 0%, #7c3aed 50%, #a855f7 100%)',
    shadow: '0 8px 28px rgba(124,58,237,0.6)' },
  { key: 'casino',   label: 'Casino',   art: '🎭', disabled: true,
    gradient: 'linear-gradient(140deg, #9d174d 0%, #db2777 50%, #f472b6 100%)',
    shadow: '0 8px 28px rgba(219,39,119,0.5)' },
  { key: 'slots',    label: 'Slots',    art: '🎰', disabled: true,
    gradient: 'linear-gradient(140deg, #4c1d95 0%, #6d28d9 50%, #8b5cf6 100%)',
    shadow: '0 8px 28px rgba(109,40,217,0.5)' },
  { key: 'sports',   label: 'Sports',   art: '⚽', disabled: true,
    gradient: 'linear-gradient(140deg, #92400e 0%, #d97706 50%, #fbbf24 100%)',
    shadow: '0 8px 28px rgba(217,119,6,0.55)' },
  { key: 'rummy',    label: 'Rummy',    art: '🃏', disabled: true,
    gradient: 'linear-gradient(140deg, #7f1d1d 0%, #b91c1c 50%, #f87171 100%)',
    shadow: '0 8px 28px rgba(185,28,28,0.5)' },
  { key: 'fishing',  label: 'Fishing',  art: '🐠', disabled: true,
    gradient: 'linear-gradient(140deg, #0e4f62 0%, #0891b2 50%, #22d3ee 100%)',
    shadow: '0 8px 28px rgba(8,145,178,0.5)' },
  { key: 'original', label: 'Original', art: '🚀',
    gradient: 'linear-gradient(140deg, #7f1d1d 0%, #dc2626 50%, #fb923c 100%)',
    shadow: '0 8px 28px rgba(220,38,38,0.5)' },
];

// ── category state ─────────────────────────────────────────────────────────
const active = ref('popular');
const gamesSection = ref<HTMLElement | null>(null);

function selectCategory(key: string) {
  active.value = key;
  nextTick(() => gamesSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

// ── game card art map ──────────────────────────────────────────────────────
// Each game gets rich gradient + emoji artwork + color styling
interface CardArt {
  gradient: string;
  artEmoji: string;
  artEmoji2?: string;
  titleColor: string;
  rtp: number;
  provider?: string;
}

const CARD_ART: Record<string, CardArt> = {
  CRASH:       { gradient: 'linear-gradient(160deg,#200000 0%,#7a0000 40%,#c01010 100%)',   artEmoji: '✈️',  titleColor: '#ff6666', rtp: 96.07, provider: 'SKYWAY' },
  MINES:       { gradient: 'linear-gradient(160deg,#0c0800 0%,#2a1800 40%,#422800 100%)',   artEmoji: '💣',  artEmoji2: '⭐', titleColor: '#ffd700', rtp: 97.73, provider: 'JILI' },
  WHEEL:       { gradient: 'linear-gradient(160deg,#001018 0%,#003050 40%,#005080 100%)',   artEmoji: '🎡',  titleColor: '#60c8ff', rtp: 95.50 },
  PLINKO:      { gradient: 'linear-gradient(160deg,#100018 0%,#280050 40%,#440080 100%)',   artEmoji: '🔻',  titleColor: '#c084fc', rtp: 96.00 },
  HILO:        { gradient: 'linear-gradient(160deg,#001a10 0%,#003825 40%,#005a38 100%)',   artEmoji: '🃏',  titleColor: '#4ade80', rtp: 95.00 },
  KENO:        { gradient: 'linear-gradient(160deg,#080030 0%,#200070 40%,#3800a8 100%)',   artEmoji: '🌀',  titleColor: '#c084fc', rtp: 97.53 },
  DICE:        { gradient: 'linear-gradient(160deg,#001030 0%,#002060 40%,#003090 100%)',   artEmoji: '🎲',  titleColor: '#93c5fd', rtp: 98.00 },
  LIMBO:       { gradient: 'linear-gradient(160deg,#100020 0%,#280055 40%,#40008a 100%)',   artEmoji: '📈',  titleColor: '#f9a8d4', rtp: 97.00 },
  ANDARBAHAR:  { gradient: 'linear-gradient(160deg,#001a05 0%,#003a10 40%,#005a1c 100%)',   artEmoji: '🂱',  artEmoji2: '🂡', titleColor: '#4ade80', rtp: 97.00 },
  DRAGONTIGER: { gradient: 'linear-gradient(160deg,#1e0000 0%,#5a0000 40%,#900000 100%)',   artEmoji: '🐉',  artEmoji2: '🐯', titleColor: '#fb923c', rtp: 96.27 },
  MOTORACE:    { gradient: 'linear-gradient(160deg,#001020 0%,#002840 40%,#003a60 100%)',   artEmoji: '🏍️', titleColor: '#60a5fa', rtp: 96.50 },
  WINGO:       { gradient: 'linear-gradient(160deg,#001545 0%,#002870 40%,#003898 100%)',   artEmoji: '💰',  artEmoji2: '🎱', titleColor: '#fbbf24', rtp: 97.09 },
  K3:          { gradient: 'linear-gradient(160deg,#100a00 0%,#261400 40%,#382000 100%)',   artEmoji: '🎲',  titleColor: '#fb923c', rtp: 95.00 },
  '5D':        { gradient: 'linear-gradient(160deg,#001840 0%,#002860 40%,#003888 100%)',   artEmoji: '🔢',  titleColor: '#60a5fa', rtp: 95.00 },
  '4D':        { gradient: 'linear-gradient(160deg,#100030 0%,#200060 40%,#380095 100%)',   artEmoji: '🔢',  titleColor: '#c084fc', rtp: 95.00 },
  CHICKEN:     { gradient: 'linear-gradient(160deg,#1c1000 0%,#4a2a00 40%,#7a4000 100%)',   artEmoji: '🐔',  titleColor: '#fbbf24', rtp: 98.00 },
};

function cardArt(code: string): CardArt {
  return CARD_ART[code] ?? { gradient: 'linear-gradient(160deg,#1a1a4a,#2a2a8a)', artEmoji: '🎮', titleColor: '#fff', rtp: 95 };
}

// ── game route maps ────────────────────────────────────────────────────────
const ROUTE_BY_GAME: Record<string, string> = { WINGO: 'wingo', K3: 'k3', '5D': 'fived', '4D': 'fourd' };
const ART_BY_GAME:   Record<string, string> = { WINGO: '🎯',   K3: '🎲', '5D': '🔢',   '4D': '🔢'   };

const lotteryGames = computed(() =>
  Object.values(GAMES).map((g) => ({
    code:  g.gameCode,
    label: g.label,
    sub:   `${g.rooms.length} rooms · live`,
    route: ROUTE_BY_GAME[g.gameCode],
    art:   ART_BY_GAME[g.gameCode] ?? '🎯',
  })),
);

const originalGames = [
  { code: 'CRASH',       label: 'Aviator',     sub: 'Continuous rounds', route: 'crash',        art: '🚀' },
  { code: 'MINES',       label: 'Mines',        sub: '25 tiles',         route: 'mines',        art: '💣' },
  { code: 'WHEEL',       label: 'Wheel',        sub: '3 risk levels',    route: 'wheel',        art: '🎡' },
  { code: 'PLINKO',      label: 'Plinko',       sub: '3 risk levels',    route: 'plinko',       art: '🔻' },
  { code: 'HILO',        label: 'Hi-Lo',        sub: 'Compounds',        route: 'hilo',         art: '🃏' },
  { code: 'KENO',        label: 'Keno',         sub: 'Pick 10 of 40',    route: 'keno',         art: '🔢' },
  { code: 'DICE',        label: 'Dice',         sub: 'Over or under',    route: 'dice',         art: '🎲' },
  { code: 'LIMBO',       label: 'Limbo',        sub: 'Pick a multiplier',route: 'limbo',        art: '📈' },
  { code: 'CHICKEN',     label: 'Chicken Road 2.0', sub: 'Cross the road safely', route: 'chicken-road', art: '🐔' },
  { code: 'ANDARBAHAR',  label: 'Andar Bahar',  sub: 'Pick a side',      route: 'andar-bahar',  art: '🂱' },
  { code: 'DRAGONTIGER', label: 'Dragon Tiger', sub: 'High card wins',   route: 'dragon-tiger', art: '🐉' },
  { code: 'MOTORACE',    label: 'MotoRace',     sub: 'Pick the winner',  route: 'motorace',     art: '🏍️' },
];

const popularGames = computed(() => [
  originalGames[0],
  ...lotteryGames.value,
  originalGames[2],
  originalGames[8],
  originalGames[9],
]);

const shown = computed(() => {
  if (active.value === 'lottery')  return lotteryGames.value;
  if (active.value === 'original') return originalGames;
  if (active.value === 'popular')  return popularGames.value;
  return [];
});

const PENDING: Record<string, string> = {
  casino:  'Live dealer tables arrive through an aggregator integration.',
  slots:   'Slots are licensed third-party content. One aggregator contract brings the whole category.',
  sports:  'The sportsbook is licensed third-party content.',
  rummy:   'Rummy is licensed third-party content.',
  fishing: 'Fishing games are licensed third-party content.',
};

// ── announcements ──────────────────────────────────────────────────────────
const DEFAULT_ANNOUNCEMENT =
  'Welcome to Skyway Games! Every round is provably fair — the result is committed as a hash before betting opens so you can verify rather than trust it.';

interface Announcement { id: string; title: string; body: string; pinned: boolean }
const announcements = ref<Announcement[]>([]);
const showDetail = ref(false);

const marqueeText = computed(() =>
  announcements.value.length
    ? announcements.value.map((a) => a.title).join('   •   ')
    : DEFAULT_ANNOUNCEMENT,
);

async function loadAnnouncements() {
  try {
    const { data } = await api.get('/announcements');
    announcements.value = data.data;
  } catch { /* keep default */ }
}

// ── hero banners ───────────────────────────────────────────────────────────
const BANNERS = [
  {
    headline: 'FIRST DEPOSIT',
    amountLabel: 'UP TO ₹10,000',
    subLabel: 'BONUS',
    caption: 'COMPLETE DAILY/WEEKLY TASK',
    route: 'wallet',
    emoji1: '💰', emoji2: '🪙', emoji3: '💵',
    gradient: 'linear-gradient(145deg, #0d1460 0%, #142280 40%, #0d1870 70%, #0a1050 100%)',
    accent: '#f59e0b',
    glow: 'rgba(245,158,11,0.4)',
  },
  {
    headline: 'FLY HIGH',
    amountLabel: 'WIN BIG',
    subLabel: '',
    caption: 'CONTINUOUS ROUNDS',
    route: 'crash',
    emoji1: '✈️', emoji2: '💸', emoji3: '🔥',
    gradient: 'linear-gradient(145deg, #1a0a30 0%, #3d0a2a 45%, #8a1240 100%)',
    accent: '#ff3b5c',
    glow: 'rgba(255,59,92,0.45)',
  },
  {
    headline: 'CLEAR THE BOARD',
    amountLabel: 'CASH OUT',
    subLabel: 'ANY TIME',
    caption: 'PICK YOUR TILES WISELY',
    route: 'mines',
    emoji1: '💎', emoji2: '💣', emoji3: '✨',
    gradient: 'linear-gradient(145deg, #060d2a 0%, #10205a 45%, #1840a0 100%)',
    accent: '#60a5fa',
    glow: 'rgba(96,165,250,0.4)',
  },
];

// ── avatar + winner data ───────────────────────────────────────────────────
const AVATAR_POOL = [
  { bg: 'linear-gradient(135deg,#667eea,#764ba2)', emoji: '🧑‍🦱', gameGrad: 'linear-gradient(135deg,#1a3a7a,#2a5abf)', gameEmoji: '🎰' },
  { bg: 'linear-gradient(135deg,#f093fb,#f5576c)', emoji: '👩',   gameGrad: 'linear-gradient(135deg,#7a1a3a,#bf2a5a)', gameEmoji: '✈️' },
  { bg: 'linear-gradient(135deg,#4facfe,#00f2fe)', emoji: '👨‍🦲', gameGrad: 'linear-gradient(135deg,#1a4a7a,#2a7abf)', gameEmoji: '💣' },
  { bg: 'linear-gradient(135deg,#43e97b,#38f9d7)', emoji: '🧓',   gameGrad: 'linear-gradient(135deg,#0a5a2a,#0a8a3a)', gameEmoji: '🎲' },
  { bg: 'linear-gradient(135deg,#fa709a,#fee140)', emoji: '👧',   gameGrad: 'linear-gradient(135deg,#5a1a7a,#8a2abf)', gameEmoji: '🌀' },
  { bg: 'linear-gradient(135deg,#a18cd1,#fbc2eb)', emoji: '👦',   gameGrad: 'linear-gradient(135deg,#2a1a5a,#4a2a8a)', gameEmoji: '🃏' },
  { bg: 'linear-gradient(135deg,#ffecd2,#fcb69f)', emoji: '🧑',   gameGrad: 'linear-gradient(135deg,#4a1a0a,#8a3a1a)', gameEmoji: '🎱' },
  { bg: 'linear-gradient(135deg,#a1c4fd,#c2e9fb)', emoji: '👩‍🦰', gameGrad: 'linear-gradient(135deg,#1a2a7a,#2a4abf)', gameEmoji: '🚀' },
];

function maskName(a: string, b: string) { return `Mem***${a}${b}`; }
const L    = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const rand = (n: number) => Math.floor(Math.random() * n);

const winners = Array.from({ length: 8 }, (_, i) => {
  const av = AVATAR_POOL[i % AVATAR_POOL.length];
  return {
    name:       maskName(L[rand(L.length)], L[rand(L.length)] + L[rand(L.length)]),
    amount:     (rand(9000) + 100) * 100,
    game:       ['Win Go', 'Aviator', 'K3', 'Mines', 'Dragon Tiger'][rand(5)],
    avatarBg:   av.bg,
    avatarEmoji:av.emoji,
    gameGrad:   av.gameGrad,
    gameEmoji:  av.gameEmoji,
  };
});

const leaders = Array.from({ length: 8 }, (_, i) => {
  const av = AVATAR_POOL[i % AVATAR_POOL.length];
  return {
    rank:        i + 1,
    name:        maskName(L[rand(L.length)], L[rand(L.length)] + L[rand(L.length)]),
    amount:      Math.round((240000 - i * 22000 + rand(9000)) * 100),
    avatarBg:    av.bg,
    avatarEmoji: av.emoji,
  };
}).sort((a, b) => b.amount - a.amount);

const RANK_TONE = ['r-gold', 'r-silver', 'r-bronze'];

// ── "Add to Desktop" dismissible pill ─────────────────────────────────────
const showAddToDesktop = ref(true);

onMounted(() => { loadAnnouncements(); });
onUnmounted(() => { window.clearTimeout(toastTimer); });
</script>

<template>
  <div class="page">

    <!-- ── 1. Hero Swiper Carousel ─────────────────────────────────────── -->
    <section class="hero">
      <Swiper
        class="hero-swiper"
        :modules="swiperModules"
        :autoplay="{ delay: 4500, disableOnInteraction: false }"
        :loop="true"
        :pagination="{ clickable: true }"
        :effect="'creative'"
        :creative-effect="{
          prev: { shadow: true, translate: [0, 0, -400] },
          next: { translate: ['100%', 0, 0] },
        }"
      >
        <SwiperSlide v-for="b in BANNERS" :key="b.route">
          <router-link class="banner" :to="{ name: b.route }" :style="{ background: b.gradient }">
            <!-- Background glow orb -->
            <div class="banner-glow" :style="{ background: `radial-gradient(ellipse 55% 70% at 72% 50%, ${b.glow} 0%, transparent 70%)` }" />
            <!-- Diagonal gloss streak (SS1 visual) -->
            <div class="banner-gloss" />
            <!-- Wavy bottom line accent -->
            <div class="banner-wave" />

            <!-- Text content -->
            <div class="banner-content">
              <span class="banner-brand">⬡ SKYWAY</span>
              <span class="banner-headline">{{ b.headline }}</span>
              <span class="banner-amount" :style="{ color: b.accent, textShadow: `0 0 24px ${b.glow}, 0 4px 12px rgba(0,0,0,0.5)` }">
                {{ b.amountLabel }}
              </span>
              <span v-if="b.subLabel" class="banner-sublabel" :style="{ color: b.accent }">{{ b.subLabel }}</span>
              <span class="banner-tag">{{ b.caption }}</span>
            </div>

            <!-- 3D floating art cluster -->
            <div class="banner-art">
              <span class="art-e1" :style="{ filter: `drop-shadow(0 8px 24px ${b.glow})` }">{{ b.emoji1 }}</span>
              <span class="art-e2">{{ b.emoji2 }}</span>
              <span class="art-e3">{{ b.emoji3 }}</span>
            </div>
          </router-link>
        </SwiperSlide>
      </Swiper>
    </section>

    <!-- ── 2. Announcement bar ─────────────────────────────────────────── -->
    <section class="announce">
      <div class="speaker-wrap">
        <span class="speaker-icon">🔊</span>
      </div>
      <div class="marquee">
        <p>{{ marqueeText }}</p>
      </div>
      <button class="detail-btn" @click="showDetail = !showDetail">
        <span>💧</span> Detail
      </button>
    </section>
    <transition name="fade">
      <div v-if="showDetail" class="announce-full">
        <template v-if="announcements.length">
          <div v-for="a in announcements" :key="a.id" class="ann-item">
            <strong>{{ a.pinned ? '📌 ' : '' }}{{ a.title }}</strong>
            <p>{{ a.body }}</p>
          </div>
        </template>
        <p v-else>{{ DEFAULT_ANNOUNCEMENT }}</p>
      </div>
    </transition>

    <!-- ── 3. Category Tiles (matches SS1 layout exactly) ─────────────── -->
    <section class="cat-section">
      <!-- Row 1: Popular + Lottery — 2 equal half-width tiles (tall) -->
      <div class="cat-row-2">
        <button
          v-for="t in TILES.slice(0, 2)"
          :key="t.key"
          class="cat-tile cat-half"
          :class="{ on: active === t.key }"
          :style="{ background: t.gradient, boxShadow: t.shadow }"
          @click="selectCategory(t.key)"
        >
          <div class="cat-shine" />
          <!-- 3D emoji art block -->
          <div class="cat-art-block">
            <span class="cat-art-main">{{ t.art }}</span>
          </div>
          <!-- Label overlay at bottom-right -->
          <div class="cat-label-overlay">
            <span class="cat-label">{{ t.label }}</span>
          </div>
          <span v-if="active === t.key" class="cat-pip" />
        </button>
      </div>

      <!-- Row 2: Casino + Slots + Sports — 3 equal third tiles (shorter) -->
      <div class="cat-row-3">
        <button
          v-for="t in TILES.slice(2, 5)"
          :key="t.key"
          class="cat-tile cat-third"
          :class="{ on: active === t.key, 'cat-disabled': t.disabled }"
          :style="{ background: t.gradient, boxShadow: t.disabled ? 'none' : t.shadow }"
          :disabled="t.disabled"
          @click="!t.disabled && selectCategory(t.key)"
        >
          <div class="cat-shine" />
          <span class="cat-art-sm">{{ t.art }}</span>
          <span class="cat-label cat-label-sm">{{ t.label }}</span>
          <span v-if="active === t.key && !t.disabled" class="cat-pip" />
          <!-- Under Development overlay -->
          <div v-if="t.disabled" class="cat-dev-overlay">
            <span class="cat-dev-badge">🚧 Under Development</span>
          </div>
        </button>
      </div>

      <!-- Row 3: Rummy + Fishing + Original -->
      <div class="cat-row-3">
        <button
          v-for="t in TILES.slice(5, 8)"
          :key="t.key"
          class="cat-tile cat-third"
          :class="{ on: active === t.key, 'cat-disabled': t.disabled }"
          :style="{ background: t.gradient, boxShadow: t.disabled ? 'none' : t.shadow }"
          :disabled="t.disabled"
          @click="!t.disabled && selectCategory(t.key)"
        >
          <div class="cat-shine" />
          <span class="cat-art-sm">{{ t.art }}</span>
          <span class="cat-label cat-label-sm">{{ t.label }}</span>
          <span v-if="active === t.key && !t.disabled" class="cat-pip" />
          <!-- Under Development overlay -->
          <div v-if="t.disabled" class="cat-dev-overlay">
            <span class="cat-dev-badge">🚧 Under Development</span>
          </div>
        </button>
      </div>
    </section>

    <!-- ── 4. Games anchor with tab chips + art card grid ─────────────── -->
    <div ref="gamesSection" class="games-anchor">

      <!-- Horizontal tab chips (matches SS2 top bar) -->
      <div class="tab-bar-wrap">
        <Swiper
          class="tab-swiper"
          :modules="freeModeModules"
          :free-mode="true"
          :slides-per-view="'auto'"
          :space-between="8"
        >
          <SwiperSlide v-for="t in TILES" :key="t.key" class="tab-slide">
            <button
              class="tab-chip"
              :class="{ active: active === t.key, 'tab-chip-disabled': t.disabled }"
              :disabled="t.disabled"
              @click="!t.disabled && selectCategory(t.key)"
            >
              <span class="tab-icon">{{ t.art }}</span>
              <span class="tab-lbl">{{ t.label }}</span>
            </button>
          </SwiperSlide>
        </Swiper>
      </div>

      <!-- Slots catalogue -->
      <section v-if="active === 'slots'" class="games-content">
        <div class="rec-header">
          <span class="rec-title">🔥 Slot Games</span>
          <span class="faint tiny">{{ SLOTS.length }} available</span>
        </div>
        <div class="art-grid">
          <button v-for="s in SLOTS" :key="s.name" class="art-card" @click="tapSlot(s.name)">
            <div class="art-card-bg" style="background: linear-gradient(160deg,#1a0040,#3a00a0,#5000c8)">
              <div class="art-card-orb" style="background: radial-gradient(circle, rgba(168,85,247,0.3) 0%, transparent 70%)" />
              <div class="art-card-emoji-wrap">
                <span class="art-card-emoji">{{ s.art }}</span>
              </div>
              <span class="art-provider-badge">Soon</span>
            </div>
            <div class="art-card-title-strip">
              <span class="art-card-name">{{ s.name }}</span>
            </div>
            <div class="art-rtp-strip">
              <span class="rtp-key">RTP</span>
              <span class="rtp-pct">{{ s.rtp }}%</span>
            </div>
          </button>
        </div>
      </section>

      <!-- Games from popular / lottery / original categories -->
      <section v-else-if="shown.length" class="games-content">
        <!-- "Platform recommendation" header (matches SS2) -->
        <div class="rec-header">
          <span class="rec-title">🔥 Platform recommendation</span>
          <button class="all-btn">All {{ shown.length }} ›</button>
        </div>

        <!-- 3-column art card grid (matches SS2) -->
        <div class="art-grid">
          <router-link
            v-for="g in shown"
            :key="g.code + g.label"
            class="art-card"
            :to="{ name: g.route }"
          >
            <!-- Rich gradient background with 3D art -->
            <div class="art-card-bg" :style="{ background: cardArt(g.code).gradient }">
              <!-- ambient glow orb -->
              <div class="art-card-orb" :style="{ background: `radial-gradient(circle, ${cardArt(g.code).titleColor}30 0%, transparent 70%)` }" />
              <!-- decorative ring (like the Vortex concentric circles) -->
              <div class="art-ring-1" :style="{ borderColor: `${cardArt(g.code).titleColor}30` }" />
              <div class="art-ring-2" :style="{ borderColor: `${cardArt(g.code).titleColor}18` }" />
              <!-- emoji artwork cluster -->
              <div class="art-card-emoji-wrap">
                <span class="art-card-emoji">{{ cardArt(g.code).artEmoji }}</span>
                <span v-if="cardArt(g.code).artEmoji2" class="art-card-emoji-2">{{ cardArt(g.code).artEmoji2 }}</span>
              </div>
              <!-- provider tag top-right (JILI, etc.) -->
              <span v-if="cardArt(g.code).provider" class="art-provider-badge">{{ cardArt(g.code).provider }}</span>
            </div>
            <!-- Game title strip (below artwork) -->
            <div class="art-card-title-strip">
              <span class="art-card-name" :style="{ color: cardArt(g.code).titleColor }">{{ g.label }}</span>
            </div>
            <!-- RTP blue strip at bottom (matches SS2) -->
            <div class="art-rtp-strip">
              <span class="rtp-key">RTP</span>
              <span class="rtp-pct">{{ cardArt(g.code).rtp }}%</span>
            </div>
          </router-link>
        </div>
      </section>

      <!-- Pending category notice -->
      <section v-else class="pending-panel">
        <div class="pending-icon-wrap">
          <span>{{ TILES.find(t => t.key === active)?.art }}</span>
        </div>
        <strong>{{ TILES.find((t) => t.key === active)?.label }}</strong>
        <p class="faint">{{ PENDING[active] }}</p>
      </section>
    </div>

    <!-- ── 5. Winning information (matches SS3 list layout) ───────────── -->
    <section class="win-section">
      <div class="sec-accent-head">
        <span class="accent-pipe" />
        <strong>Winning information</strong>
      </div>
      <div class="win-list">
        <div v-for="(w, i) in winners" :key="i" class="win-row">
          <!-- Circular avatar (cartoon style) -->
          <div class="win-avatar" :style="{ background: w.avatarBg }">
            <span class="win-av-emoji">{{ w.avatarEmoji }}</span>
          </div>
          <!-- Name -->
          <span class="win-name">{{ w.name }}</span>
          <!-- Game thumbnail square -->
          <div class="win-thumb" :style="{ background: w.gameGrad }">
            <span class="win-thumb-emoji">{{ w.gameEmoji }}</span>
          </div>
          <!-- Amount column -->
          <div class="win-amount-col">
            <span class="win-receive">Receive ₹{{ formatMinor(w.amount) }}</span>
            <span class="win-sub">Winning amount</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 6. Today's earnings leaderboard (matches SS3 bottom) ──────── -->
    <section class="leaders-section">
      <div class="sec-accent-head">
        <span class="accent-pipe" />
        <strong>Today's earnings</strong>
      </div>
      <div class="board">
        <div v-for="(m, i) in leaders" :key="i" class="lead-row">
          <span class="rank-badge" :class="RANK_TONE[i] ?? 'r-plain'">{{ m.rank }}</span>
          <div class="lead-avatar" :style="{ background: m.avatarBg }">
            <span>{{ m.avatarEmoji }}</span>
          </div>
          <span class="lead-name">{{ m.name }}</span>
          <span class="lead-amt mono">₹{{ formatMinor(m.amount) }}</span>
        </div>
      </div>
    </section>

    <!-- Balance strip (logged-in only) -->
    <section v-if="auth.isLoggedIn" class="balance">
      <span class="dim tiny">Wallet balance</span>
      <strong class="mono">₹{{ formatMinor(auth.balance) }}</strong>
      <router-link class="dep-btn" :to="{ name: 'wallet' }">Deposit</router-link>
    </section>

    <SiteFooter />

    <!-- ── "Add to Desktop" floating pill (SS1 middle overlay) ──────────── -->
    <transition name="slide-up">
      <div v-if="showAddToDesktop" class="add-to-desktop">
        <span class="atd-logo">⬡</span>
        <span class="atd-text">Add to Desktop</span>
        <button class="atd-close" @click="showAddToDesktop = false">✕</button>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="toast" class="lobby-toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped lang="scss">
/* ── page ────────────────────────────────────────────────────────────────── */
.page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 10px 0;
}

/* ── hero carousel ───────────────────────────────────────────────────────── */
.hero {
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6), 0 2px 0 rgba(255,255,255,0.05) inset;
}
.hero-swiper { width: 100%; border-radius: 18px; }

.banner {
  display: flex;
  align-items: stretch;
  min-height: 185px;
  text-decoration: none;
  color: #fff;
  position: relative;
  overflow: hidden;
}

/* radial glow behind emoji art */
.banner-glow {
  position: absolute; inset: 0; pointer-events: none;
}

/* diagonal glass gloss — matches the blue shimmer in SS1 */
.banner-gloss {
  position: absolute;
  top: -60%; left: -30%;
  width: 65%; height: 220%;
  background: linear-gradient(110deg, rgba(255,255,255,0.14) 0%, transparent 55%);
  transform: skewX(-12deg);
  pointer-events: none;
}

/* subtle wave / sweep at bottom */
.banner-wave {
  position: absolute;
  bottom: -2px; left: 0; right: 0; height: 30px;
  background: linear-gradient(0deg, rgba(0,0,0,0.2) 0%, transparent 100%);
  pointer-events: none;
}

.banner-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  flex: 1;
  padding: 18px 0 18px 16px;
  max-width: 58%;
}

.banner-brand {
  font-family: 'Outfit', sans-serif;
  font-size: 10px; font-weight: 800;
  letter-spacing: 3px; opacity: 0.65;
  text-transform: uppercase; margin-bottom: 4px;
}

.banner-headline {
  font-family: 'Outfit', sans-serif;
  font-size: 15px; font-weight: 700;
  letter-spacing: 0.3px; line-height: 1.2;
}

/* The big bold amount / "WIN BIG" text — matches SS1 yellow "₹10,000" */
.banner-amount {
  font-family: 'Outfit', sans-serif;
  font-size: 28px; font-weight: 900;
  line-height: 1; letter-spacing: -0.5px;
}

/* "BONUS" secondary line in bold italic — SS1 */
.banner-sublabel {
  font-family: 'Outfit', sans-serif;
  font-size: 24px; font-weight: 900;
  font-style: italic; letter-spacing: 1px;
  text-shadow: 0 3px 16px currentColor;
}

/* Small tag pill at bottom */
.banner-tag {
  margin-top: 8px;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 5px;
  background: rgba(255,255,255,0.14);
  border: 1px solid rgba(255,255,255,0.22);
  backdrop-filter: blur(6px);
  font-size: 9px; font-weight: 700;
  letter-spacing: 1.5px; text-transform: uppercase;
}

/* Right-side floating emoji art cluster — mimics 3D coins/phone in SS1 */
.banner-art {
  position: absolute;
  right: 6px; top: 0; bottom: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 44%;
  pointer-events: none;
}

.art-e1 {
  font-size: 70px; line-height: 1;
  display: block;
  animation: art-float-a 4s ease-in-out infinite;
  transform-origin: center bottom;
}
.art-e2 {
  font-size: 38px;
  display: block;
  position: absolute;
  right: 4px; bottom: 28px;
  filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5));
  animation: art-float-b 3.2s ease-in-out infinite;
}
.art-e3 {
  font-size: 26px;
  display: block;
  position: absolute;
  left: 8px; top: 26px;
  filter: drop-shadow(0 3px 8px rgba(0,0,0,0.4));
  animation: art-float-c 3.8s ease-in-out infinite;
}

@keyframes art-float-a {
  0%,100% { transform: perspective(300px) rotateY(-15deg) rotateX(5deg) translateY(0); }
  50%     { transform: perspective(300px) rotateY(-15deg) rotateX(5deg) translateY(-12px); }
}
@keyframes art-float-b {
  0%,100% { transform: rotate(8deg)  translateY(0); }
  50%     { transform: rotate(-5deg) translateY(-8px); }
}
@keyframes art-float-c {
  0%,100% { transform: rotate(-8deg) translateY(0); }
  50%     { transform: rotate(5deg)  translateY(-6px); }
}

/* ── announcement bar ────────────────────────────────────────────────────── */
.announce {
  display: flex; align-items: center; gap: 8px;
  height: 46px; padding: 0 8px 0 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  backdrop-filter: blur(14px);
}
.speaker-wrap {
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  display: flex; align-items: center; justify-content: center;
  flex: 0 0 auto;
}
.speaker-icon { font-size: 15px; }
.marquee { flex: 1; overflow: hidden;
  p { margin: 0; font-size: 12px; color: var(--text-dim); white-space: nowrap;
      animation: slide 28s linear infinite; }
}
@keyframes slide { from { transform: translateX(30%); } to { transform: translateX(-100%); } }
.detail-btn {
  display: flex; align-items: center; gap: 5px;
  height: 32px; padding: 0 14px; border-radius: 999px;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  color: #fff; font-size: 11px; font-weight: 700; flex: 0 0 auto;
  box-shadow: 0 4px 14px rgba(236,72,153,0.4);
  border: 1px solid rgba(255,255,255,0.2);
}
.announce-full {
  margin: -4px 4px 0; padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  font-size: 11px; line-height: 1.7; color: var(--text-dim);
}
.ann-item {
  padding: 6px 0;
  & + .ann-item { border-top: 1px solid var(--line); }
  strong { display: block; color: var(--text); font-size: 12px; }
  p { margin: 3px 0 0; }
}

/* ── category tiles ──────────────────────────────────────────────────────── */
/* Matches SS1 grid: [Popular | Lottery] / [Casino | Slots | Sports] / [Rummy | Fishing | Original] */
.cat-section { display: flex; flex-direction: column; gap: 8px; }

.cat-row-2 { display: flex; gap: 8px; }
.cat-row-3 { display: flex; gap: 8px; }

.cat-tile {
  position: relative; overflow: hidden;
  border-radius: 14px;
  border: 1.5px solid rgba(255,255,255,0);
  cursor: pointer;
  transition:
    transform    0.18s cubic-bezier(0.34,1.56,0.64,1),
    border-color 0.2s ease,
    box-shadow   0.2s ease;

  &:active  { transform: scale(0.93) rotateX(6deg); }
  &.on      { border-color: rgba(255,255,255,0.45); }
}

/* SS1 style: 50/50 split tiles — tall, with big art on left, label on right */
.cat-half {
  flex: 1;
  height: 96px;
  display: flex;
  align-items: center;
}

/* SS1 style: 3-per-row shorter tiles */
.cat-third {
  flex: 1;
  height: 82px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 8px 10px 8px;
  gap: 2px;
}

/* Gloss shine overlay — the white diagonal glint visible in SS1 tiles */
.cat-shine {
  position: absolute; inset: 0;
  background: linear-gradient(140deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 40%, transparent 70%);
  pointer-events: none; border-radius: inherit;
}

/* Big art emoji block for half-width tiles */
.cat-art-block {
  width: 92px; height: 100%;
  display: flex; align-items: center; justify-content: center;
  flex: 0 0 92px;
  position: relative; z-index: 1;
}

.cat-art-main {
  font-size: 56px; line-height: 1; display: block;
  filter: drop-shadow(4px 8px 18px rgba(0,0,0,0.55));
  transform: perspective(220px) rotateY(14deg) rotateX(-6deg);
  animation: tile-float 5s ease-in-out infinite;
}

@keyframes tile-float {
  0%,100% { transform: perspective(220px) rotateY(14deg) rotateX(-6deg) translateY(0); }
  50%     { transform: perspective(220px) rotateY(14deg) rotateX(-6deg) translateY(-7px); }
}

/* Label positioned at bottom-right of the tile (SS1 style) */
.cat-label-overlay {
  position: absolute; right: 10px; bottom: 10px; z-index: 1;
}
.cat-label {
  font-family: 'Outfit', sans-serif;
  font-size: 15px; font-weight: 800;
  color: #fff;
  text-shadow: 0 2px 10px rgba(0,0,0,0.6);
}

/* Smaller art + label for third-row tiles */
.cat-art-sm {
  position: absolute; left: 8px; top: 50%;
  transform: translateY(-50%) perspective(180px) rotateY(10deg) rotateX(-4deg);
  font-size: 38px; line-height: 1;
  filter: drop-shadow(3px 6px 12px rgba(0,0,0,0.5));
  animation: tile-float-sm 5s ease-in-out infinite;
}

@keyframes tile-float-sm {
  0%,100% { transform: translateY(-50%) perspective(180px) rotateY(10deg) rotateX(-4deg) translateY(-50%); }
  50%     { transform: translateY(-50%) perspective(180px) rotateY(10deg) rotateX(-4deg) translateY(calc(-50% - 5px)); }
}

.cat-label-sm { font-size: 13px; }

/* Active indicator pip */
.cat-pip {
  position: absolute; bottom: 5px; left: 50%;
  transform: translateX(-50%);
  width: 18px; height: 3px; border-radius: 999px;
  background: rgba(255,255,255,0.85);
  box-shadow: 0 0 10px rgba(255,255,255,0.7);
}

/* ── Disabled tile state ────────────────────────────────────────────────────
   Tiles that are "Under Development": dimmed, no hover, no cursor         */
.cat-disabled {
  cursor: not-allowed !important;
  opacity: 0.6;
  filter: saturate(0.5);
  /* kill the 3D shadow so it doesn't glow like it's live */
  box-shadow: none !important;
  &:active { transform: none !important; }
}

/* Full-tile overlay that carries the badge */
.cat-dev-overlay {
  position: absolute; inset: 0;
  display: flex; align-items: flex-end; justify-content: center;
  padding-bottom: 7px;
  background: rgba(0,0,0,0.38);
  border-radius: inherit;
  z-index: 5;
  pointer-events: none;
}

/* The small pill text badge */
.cat-dev-badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(0,0,0,0.72);
  border: 1px solid rgba(255,255,255,0.18);
  backdrop-filter: blur(6px);
  font-size: 9px; font-weight: 700;
  color: rgba(255,255,255,0.8);
  letter-spacing: 0.3px;
  white-space: nowrap;
}

/* Greyed-out tab chips for disabled categories */
.tab-chip-disabled {
  opacity: 0.45;
  filter: saturate(0.3);
  cursor: not-allowed !important;
  pointer-events: none;
}

/* ── games section ───────────────────────────────────────────────────────── */
.games-anchor { scroll-margin-top: 70px; }
.games-content { display: flex; flex-direction: column; gap: 10px; }

/* ── tab chip bar (matches SS2 top row) ──────────────────────────────────── */
.tab-bar-wrap { overflow: hidden; }
.tab-swiper   { width: 100%; }
.tab-slide    { width: auto !important; }

.tab-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.06);
  backdrop-filter: blur(10px);
  color: var(--text-faint);
  white-space: nowrap;
  transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
  min-width: 66px;
  cursor: pointer;

  .tab-icon { font-size: 22px; line-height: 1; filter: grayscale(0.5); transition: filter 0.2s ease; }
  .tab-lbl  { font-size: 11px; font-weight: 600; }

  /* Active = blue pill matching SS2 active chip */
  &.active {
    background: linear-gradient(135deg, #1e40af, #2563eb, #3b82f6);
    border-color: rgba(96,165,250,0.5);
    color: #fff;
    box-shadow: 0 6px 20px rgba(37,99,235,0.5), 0 0 0 1px rgba(255,255,255,0.1) inset;
    transform: translateY(-2px);
    .tab-icon { filter: none; }
  }
}

/* ── "Platform recommendation" header (SS2) ─────────────────────────────── */
.rec-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 4px;
}
.rec-title {
  font-family: 'Outfit', sans-serif;
  font-size: 15px; font-weight: 800; color: #fff;
}
.all-btn {
  display: flex; align-items: center; gap: 2px;
  font-size: 11px; font-weight: 600; color: #60a5fa;
  background: rgba(96,165,250,0.12);
  border: 1px solid rgba(96,165,250,0.28);
  padding: 4px 12px; border-radius: 999px;
  transition: background 0.2s ease;
  &:active { background: rgba(96,165,250,0.22); }
}

/* ── 3-column art card grid (matches SS2 game cards) ─────────────────────── */
.art-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.art-card {
  position: relative;
  display: flex; flex-direction: column;
  border-radius: 14px; overflow: hidden;
  border: 1px solid rgba(255,255,255,0.1);
  text-decoration: none; color: #fff;
  transition:
    transform  0.16s cubic-bezier(0.34,1.56,0.64,1),
    box-shadow 0.2s ease;
  cursor: pointer;

  &:active { transform: scale(0.93) translateY(2px); }
  &:hover  { transform: translateY(-3px); box-shadow: 0 12px 36px rgba(0,0,0,0.55); }
}

/* Full-bleed gradient background (the rich illustration area) */
.art-card-bg {
  position: relative;
  height: 118px; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}

/* Ambient glow orb in centre */
.art-card-orb {
  position: absolute; inset: 0; pointer-events: none;
}

/* Concentric ring decorations (Vortex-style circles in SS2) */
.art-ring-1, .art-ring-2 {
  position: absolute;
  border-radius: 50%; border: 2px solid;
  top: 50%; left: 50%; transform: translate(-50%, -50%);
  pointer-events: none;
}
.art-ring-1 { width: 88px; height: 88px; }
.art-ring-2 { width: 116px; height: 116px; }

/* Emoji artwork cluster */
.art-card-emoji-wrap {
  position: relative; z-index: 2;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.art-card-emoji {
  font-size: 46px; line-height: 1; display: block;
  filter: drop-shadow(0 4px 18px rgba(0,0,0,0.65));
  animation: card-float 4s ease-in-out infinite;
  transform: perspective(200px) rotateX(-5deg);
}
.art-card-emoji-2 {
  font-size: 22px;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5));
  animation: card-float 4s ease-in-out infinite reverse;
}
@keyframes card-float {
  0%,100% { transform: perspective(200px) rotateX(-5deg) translateY(0) rotate(-2deg); }
  50%     { transform: perspective(200px) rotateX(-5deg) translateY(-8px) rotate(2deg); }
}

/* Provider badge top-right (JILI, SKYWAY) */
.art-provider-badge {
  position: absolute; top: 6px; right: 7px;
  font-family: 'Outfit', sans-serif;
  font-size: 8px; font-weight: 900;
  color: #ffd700;
  text-shadow: 0 1px 4px rgba(0,0,0,0.8);
  letter-spacing: 0.5px;
}

/* Game title strip between bg and RTP */
.art-card-title-strip {
  padding: 5px 8px 3px;
  background: rgba(0,0,0,0.3);
}
.art-card-name {
  font-family: 'Outfit', sans-serif;
  font-size: 11px; font-weight: 900;
  text-transform: uppercase; letter-spacing: 0.5px;
  text-shadow: 0 1px 6px rgba(0,0,0,0.7);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  display: block;
}

/* Blue RTP strip at card bottom (SS2 signature element) */
.art-rtp-strip {
  display: flex; align-items: center; justify-content: center;
  gap: 5px; padding: 4px 6px;
  background: rgba(30,64,175,0.85);
  border-top: 1px solid rgba(96,165,250,0.25);

  .rtp-key { font-size: 9px; color: rgba(255,255,255,0.65); font-weight: 600; }
  .rtp-pct { font-size: 10px; font-weight: 800; color: #fff; font-family: var(--font-num); }
}

/* Pending category */
.pending-panel {
  padding: 28px 16px; border-radius: var(--radius);
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(14px);
  text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.pending-icon-wrap { font-size: 36px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4)); }
.pending-panel p { margin: 0; font-size: 12px; line-height: 1.7; }

/* ── section heading with left border (SS3 "Winning information" style) ─── */
.sec-accent-head {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 12px;
}
.accent-pipe {
  width: 4px; height: 22px; border-radius: 3px; flex: 0 0 4px;
  background: linear-gradient(180deg, var(--accent-from), var(--accent-to));
  box-shadow: 0 0 10px rgba(236,72,153,0.5);
}
.sec-accent-head strong {
  font-family: 'Outfit', sans-serif;
  font-size: 17px; font-weight: 800; color: #fff;
}

/* ── Winning information list (SS3 row layout) ────────────────────────────── */
.win-section { display: flex; flex-direction: column; }

.win-list {
  border-radius: var(--radius);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(16px);
  overflow: hidden;
}

.win-row {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  & + .win-row { border-top: 1px solid rgba(255,255,255,0.06); }
}

/* Circular avatar — SS3 shows cartoon face photos */
.win-avatar {
  width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex: 0 0 48px;
  border: 2px solid rgba(255,255,255,0.2);
  box-shadow: 0 4px 14px rgba(0,0,0,0.35);
  overflow: hidden;
}
.win-av-emoji { font-size: 28px; line-height: 1; }

.win-name {
  font-size: 13px; font-weight: 700; color: var(--text);
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Game thumbnail square (SS3 blue square with game art) */
.win-thumb {
  width: 56px; height: 56px; border-radius: 12px; flex: 0 0 56px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 4px 14px rgba(0,0,0,0.4);
}
.win-thumb-emoji { font-size: 28px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5)); }

/* Amount + label column (right side of SS3 rows) */
.win-amount-col { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.win-receive    { font-family: var(--font-num); font-size: 14px; font-weight: 800; color: #fff; }
.win-sub        { font-size: 10px; color: var(--text-faint); }

/* ── Leaderboard ─────────────────────────────────────────────────────────── */
.leaders-section { display: flex; flex-direction: column; }

.board {
  border-radius: var(--radius);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(16px);
  overflow: hidden;
}

.lead-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  & + .lead-row { border-top: 1px solid rgba(255,255,255,0.05); }
}

.rank-badge {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 7px;
  font-size: 11px; font-weight: 800; color: #fff; flex: 0 0 24px;
}
.r-gold   { background: linear-gradient(135deg,#fde68a,#f59e0b); box-shadow: 0 2px 8px rgba(245,158,11,0.55); }
.r-silver { background: linear-gradient(135deg,#e2e8f0,#94a3b8); box-shadow: 0 2px 8px rgba(148,163,184,0.4); }
.r-bronze { background: linear-gradient(135deg,#fcd9b0,#c2855c); box-shadow: 0 2px 8px rgba(194,133,92,0.45); }
.r-plain  { background: rgba(255,255,255,0.1); color: var(--text-dim); }

.lead-avatar {
  width: 32px; height: 32px; border-radius: 50%; flex: 0 0 32px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; border: 1px solid rgba(255,255,255,0.15);
}
.lead-name { font-size: 13px; font-weight: 700; flex: 1; }
.lead-amt  {
  font-size: 14px; font-weight: 800;
  color: var(--primary);
  text-shadow: 0 0 12px rgba(236,72,153,0.4);
}

/* ── balance strip ───────────────────────────────────────────────────────── */
.balance {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-radius: var(--radius);
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.1);
  backdrop-filter: blur(16px);
  position: relative; overflow: hidden;

  &::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%);
    pointer-events: none;
  }
  .dim    { color: rgba(255,255,255,0.65); }
  strong  { font-size: 18px; font-weight: 800; margin-right: auto; }
}
.dep-btn {
  padding: 8px 18px; border-radius: 999px;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  color: #fff; font-size: 12px; font-weight: 700;
  text-decoration: none; box-shadow: var(--shadow-btn);
  border: 1px solid rgba(255,255,255,0.2);
}

/* ── "Add to Desktop" floating pill (SS1 centre overlay) ─────────────────── */
/* Teal pill floating in middle of screen */
.add-to-desktop {
  position: fixed; left: 50%;
  bottom: 88px;                    /* sits above bottom nav */
  transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  padding: 13px 22px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(14,116,144,0.94), rgba(8,145,178,0.94));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(103,232,249,0.4);
  box-shadow:
    0 8px 32px rgba(8,145,178,0.55),
    0 0 0 1px rgba(255,255,255,0.08) inset;
  z-index: 100; white-space: nowrap;
}
.atd-logo {
  font-size: 22px;
  filter: drop-shadow(0 0 8px rgba(103,232,249,0.6));
  background: linear-gradient(135deg, #f472b6, #ec4899);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.atd-text {
  font-family: 'Outfit', sans-serif;
  font-size: 15px; font-weight: 800; color: #fff;
  letter-spacing: 0.3px;
}
.atd-close {
  font-size: 11px; color: rgba(255,255,255,0.55);
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  margin-left: 2px;
  transition: background 0.15s ease;
  &:active { background: rgba(255,255,255,0.25); }
}

/* ── lobby toast ─────────────────────────────────────────────────────────── */
.lobby-toast {
  position: fixed; left: 50%; bottom: 96px;
  transform: translateX(-50%);
  background: rgba(10,6,24,0.95); backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.12);
  color: #fff; padding: 10px 18px; border-radius: 999px;
  font-size: 13px; z-index: 200; max-width: 90%; text-align: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.tiny { font-size: 10px; }
</style>
