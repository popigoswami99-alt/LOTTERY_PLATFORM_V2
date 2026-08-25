<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatMinor } from '@lp/shared';
import { api, apiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { useNotificationStore } from '@/stores/notifications';
import FloatingDock from '@/components/FloatingDock.vue';
import FirstDepositPopup from '@/components/FirstDepositPopup.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const notifs = useNotificationStore();

// Keep the bell badge current: on login, on every navigation, and on a poll.
watch(
  () => auth.isLoggedIn,
  (v) => (v ? notifs.refreshUnread() : notifs.reset()),
  { immediate: true },
);
router.afterEach(() => {
  if (auth.isLoggedIn) notifs.refreshUnread();
});
window.setInterval(() => auth.isLoggedIn && notifs.refreshUnread(), 30_000);

/** One place to rename the whole product. */
const BRAND = 'Skyway';

const wide = computed(() => route.meta.wide === true);
const showNav = computed(
  () => !wide.value && !['login', 'register'].includes(String(route.name)),
);

// The 480px cap lives on #app, outside this component's tree, so toggle it
// there rather than fighting it with nested overrides.
watchEffect(() => {
  const el = document.getElementById('app');
  if (el) el.classList.toggle('is-wide', wide.value);
});

const left = [
  { name: 'home', label: 'Home', icon: '🏠' },
  { name: 'activity', label: 'Activity', icon: '🎁' },
];
const right = [
  { name: 'promotion', label: 'Promotion', icon: '💵' },
  { name: 'account', label: 'Account', icon: '👤' },
];

/**
 * The raised centre button actually credits ₹500 of test balance through the
 * development deposit endpoint — so the label is true rather than decorative.
 * The server refuses it outside development.
 */
const BONUS = 50_000n; // ₹500
const claiming = ref(false);
const toast = ref('');

async function claim() {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }
  claiming.value = true;
  try {
    const { data } = await api.post('/wallet/dev/credit', { amount: BONUS.toString() });
    auth.setBalance(data.data.balance);
    flash(`₹${formatMinor(BONUS)} test balance added`);
  } catch (err) {
    flash(apiError(err));
  } finally {
    claiming.value = false;
  }
}

let toastTimer: number | undefined;
function flash(m: string) {
  toast.value = m;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2400);
}
</script>

<template>
  <div class="shell" :class="{ 'with-nav': showNav }">
    <!-- Fixed top navbar — glassmorphism dark with neon-pink brand -->
    <header v-if="showNav" class="topbar">
      <!-- ambient glow behind the bar -->
      <div class="topbar-glow" />

      <router-link :to="{ name: 'home' }" class="brand">
        <span class="brand-icon">◈</span>
        <span class="brand-text">{{ BRAND }}</span>
      </router-link>

      <div class="top-right">
        <router-link
          v-if="auth.isAdmin"
          :to="{ name: 'admin' }"
          class="admin-chip"
        >
          ◈ Admin
        </router-link>

        <router-link v-if="auth.isLoggedIn" :to="{ name: 'notifications' }" class="bell">
          <span class="bell-icon">🔔</span>
          <span v-if="notifs.unread > 0" class="badge">{{ notifs.unread > 99 ? '99+' : notifs.unread }}</span>
        </router-link>

        <router-link
          v-if="auth.isLoggedIn"
          :to="{ name: 'wallet' }"
          class="wallet-pill"
        >
          <span class="rupee">₹</span>
          <span class="amt mono">{{ formatMinor(auth.balance) }}</span>
          <span class="plus">+</span>
        </router-link>

        <template v-else>
          <router-link :to="{ name: 'login' }" class="auth-btn ghost">Log in</router-link>
          <router-link :to="{ name: 'register' }" class="auth-btn solid">Register</router-link>
        </template>
      </div>
    </header>

    <router-view />

    <FloatingDock v-if="showNav" />
    <FirstDepositPopup v-if="showNav" />

    <!-- Bottom navigation — glass panel -->
    <nav v-if="showNav" class="bottom-nav">
      <div class="nav-glass" />

      <router-link
        v-for="t in left"
        :key="t.name"
        :to="{ name: t.name }"
        class="nav-item"
        active-class="active"
      >
        <span class="ico">{{ t.icon }}</span>
        <span class="lbl">{{ t.label }}</span>
        <span class="active-bar" />
      </router-link>

      <button class="nav-center" :disabled="claiming" @click="claim">
        <span class="wheel">
          <span class="wheel-ring" />
          <span class="go">GO</span>
        </span>
        <span class="clbl">Get ₹{{ formatMinor(BONUS).replace('.00', '') }}</span>
      </button>

      <router-link
        v-for="t in right"
        :key="t.name"
        :to="{ name: t.name }"
        class="nav-item"
        active-class="active"
      >
        <span class="ico">{{ t.icon }}</span>
        <span class="lbl">{{ t.label }}</span>
        <span class="active-bar" />
      </router-link>
    </nav>

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped lang="scss">
.shell {
  min-height: 100vh;

  &.with-nav {
    padding-top: 58px;
    padding-bottom: calc(76px + var(--safe-bottom));
  }
}

/* ── top navbar ─────────────────────────────────────────────────────────── */
.topbar {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: var(--shell);
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: rgba(10, 6, 24, 0.82);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-bottom: 1px solid rgba(255,255,255,0.09);
  box-shadow: 0 4px 30px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.07) inset;
  z-index: 60;
  overflow: hidden;
}

/* ambient neon glow behind brand */
.topbar-glow {
  position: absolute;
  left: -20px;
  top: -30px;
  width: 160px;
  height: 100px;
  background: radial-gradient(ellipse, rgba(236,72,153,0.35) 0%, transparent 70%);
  pointer-events: none;
  animation: pulse-glow 3s ease-in-out infinite alternate;
}

@keyframes pulse-glow {
  from { opacity: 0.6; transform: scale(1); }
  to   { opacity: 1;   transform: scale(1.15); }
}

.brand {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #fff;
  font-family: 'Outfit', sans-serif;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0.5px;
  text-decoration: none;
  position: relative;
  z-index: 1;

  .brand-icon {
    font-size: 18px;
    background: linear-gradient(135deg, #f472b6, #ec4899);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 8px rgba(236,72,153,0.8));
  }

  .brand-text {
    background: linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.75) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
}

.top-right {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.admin-chip {
  height: 28px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.25);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  text-decoration: none;
  backdrop-filter: blur(8px);
}

.bell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.14);
  text-decoration: none;
  backdrop-filter: blur(8px);
  transition: background 0.2s ease, box-shadow 0.2s ease;

  &:hover { background: rgba(255,255,255,0.15); box-shadow: var(--glow-pink); }

  .bell-icon { font-size: 16px; }

  .badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: linear-gradient(135deg, #f472b6, #ec4899);
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    line-height: 1;
    box-shadow: 0 0 8px rgba(236,72,153,0.6);
  }
}

.wallet-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 6px 0 10px;
  border-radius: 999px;
  background: rgba(236,72,153,0.18);
  border: 1px solid rgba(236,72,153,0.35);
  color: #fff;
  text-decoration: none;
  backdrop-filter: blur(8px);
  transition: box-shadow 0.2s ease;

  &:hover { box-shadow: var(--glow-pink); }

  .rupee { font-size: 12px; opacity: 0.9; }
  .amt   { font-size: 14px; font-weight: 700; }
  .plus  {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
    color: #fff;
    font-size: 14px;
    font-weight: 800;
    box-shadow: 0 2px 8px rgba(236,72,153,0.5);
  }
}

.auth-btn {
  height: 32px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.1s ease, box-shadow 0.2s ease;

  &:active { transform: scale(0.95); }

  &.ghost {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.2);
    color: #fff;
    backdrop-filter: blur(8px);
  }

  &.solid {
    background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
    color: #fff;
    border: 1px solid rgba(255,255,255,0.2);
    box-shadow: var(--shadow-btn);
    &:hover { box-shadow: var(--glow-pink); }
  }
}

/* ── bottom navigation ───────────────────────────────────────────────────── */
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: var(--shell);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: end;
  padding-bottom: var(--safe-bottom);
  z-index: 50;
  /* overflow must stay visible so the raised GO wheel can protrude above the bar */
  overflow: visible;
}

/* glass panel behind nav */
.nav-glass {
  position: absolute;
  inset: 0;
  background: rgba(10,6,24,0.88);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border-top: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 -8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset;
}

.nav-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 10px 0 10px;
  text-decoration: none;
  color: var(--text-faint);
  transition: color 0.2s ease;
  z-index: 1;

  .ico {
    font-size: 20px;
    line-height: 1;
    transition: filter 0.2s ease, transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
    filter: grayscale(1) opacity(0.5);
  }

  .lbl {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.2px;
  }

  .active-bar {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%) scaleX(0);
    width: 24px;
    height: 3px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent-from), var(--accent-to));
    box-shadow: var(--glow-pink);
    transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
  }

  &.active {
    color: #fff;

    .ico {
      filter: none;
      transform: translateY(-2px) scale(1.12);
    }
    .active-bar {
      transform: translateX(-50%) scaleX(1);
    }
  }
}

/* Raised centre GO button */
.nav-center {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding-bottom: 8px;
  color: #fff;
  z-index: 1;

  &:disabled { opacity: 0.5; }
}

.wheel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  margin-top: -28px;
  border-radius: 50%;
  background: conic-gradient(
    #f472b6 0deg 45deg,
    #be185d 45deg 90deg,
    #f472b6 90deg 135deg,
    #be185d 135deg 180deg,
    #f472b6 180deg 225deg,
    #be185d 225deg 270deg,
    #f472b6 270deg 315deg,
    #be185d 315deg 360deg
  );
  border: 3px solid rgba(10,6,24,0.9);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.15),
    var(--glow-pink),
    0 12px 30px rgba(0,0,0,0.6);
  animation: wheel-spin 8s linear infinite;
}

.wheel-ring {
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  border: 2px solid rgba(236,72,153,0.3);
  animation: ring-pulse 2s ease-in-out infinite;
}

@keyframes wheel-spin  { to { transform: rotate(360deg); } }
@keyframes ring-pulse  {
  0%,100% { transform: scale(1);    opacity: 0.5; }
  50%      { transform: scale(1.15); opacity: 1;   }
}

.go {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #fff;
  color: #be185d;
  font-size: 10px;
  font-weight: 900;
  font-family: 'Outfit', sans-serif;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.clbl {
  padding: 2px 10px;
  border-radius: 4px;
  background: rgba(236,72,153,0.25);
  border: 1px solid rgba(236,72,153,0.4);
  color: #f9a8d4;
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
  letter-spacing: 0.3px;
}

/* ── toast ────────────────────────────────────────────────────────────────── */
.toast {
  position: fixed;
  left: 50%;
  bottom: 96px;
  transform: translateX(-50%);
  background: rgba(10,6,24,0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.12);
  color: var(--text);
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 13px;
  z-index: 200;
  max-width: 90%;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
</style>
