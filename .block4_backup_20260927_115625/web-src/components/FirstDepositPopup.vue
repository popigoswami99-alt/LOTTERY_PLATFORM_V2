<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { GAME_TZ_OFFSET_MIN, formatMinor } from '@lp/shared';
import { api, apiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

/**
 * The "Extra first deposit bonus" reminder. Pops up automatically once per
 * game-day (same IST midnight boundary every other daily reset in this app
 * uses — check-in, self-rebate) unless the player ticks "No more reminders
 * today" or has already claimed the bonus, in which case it never shows again.
 *
 * Mounted globally in App.vue, which mounts BEFORE the router guard's async
 * auth.bootstrap() resolves — a one-shot onMounted check would race that and
 * see isLoggedIn=false forever. Watching isLoggedIn instead (immediate: true,
 * same pattern App.vue already uses for the notification bell) fires once at
 * mount if already logged in, or the moment bootstrap finishes if not.
 */

const auth = useAuthStore();
const router = useRouter();

interface Tier {
  threshold: string;
  bonus: string;
  qualified: boolean;
  skipped: boolean;
}
interface FirstDepositState {
  firstDepositAmount: string | null;
  qualifiedBonus: string | null;
  claimed: boolean;
  tiers: Tier[];
}

const show = ref(false);
const dontShowToday = ref(false);
const busy = ref(false);
const errMsg = ref('');
const state = ref<FirstDepositState | null>(null);

/** YYYY-MM-DD in the game timezone (IST) — the same day boundary the backend
 *  uses for check-in / rebate, so "today" here means the same thing it does
 *  everywhere else in this app. */
function gameDateKey(): string {
  const local = new Date(Date.now() + GAME_TZ_OFFSET_MIN * 60_000);
  return local.toISOString().slice(0, 10);
}

function dismissKey(): string {
  return `skyway.fdpopup.dismissed.${auth.user?.id}.${gameDateKey()}`;
}

async function maybeShow() {
  if (!auth.isLoggedIn || !auth.user) return;
  if (localStorage.getItem(dismissKey())) return;
  try {
    const { data } = await api.get('/activity/first-deposit');
    if (!data.data.claimed) {
      state.value = data.data;
      show.value = true;
    }
  } catch {
    /* a promo reminder failing silently is fine — nothing critical depends on it */
  }
}

function close() {
  if (dontShowToday.value) localStorage.setItem(dismissKey(), '1');
  show.value = false;
}

async function claim() {
  busy.value = true;
  errMsg.value = '';
  try {
    await api.post('/activity/first-deposit', {});
    await auth.refreshBalance();
    close();
  } catch (e) {
    errMsg.value = apiError(e);
  } finally {
    busy.value = false;
  }
}

function goDeposit() {
  close();
  router.push({ name: 'wallet' });
}

function goActivity() {
  close();
  router.push({ name: 'activity' });
}

watch(() => auth.isLoggedIn, (v) => { if (v) maybeShow(); }, { immediate: true });
</script>

<template>
  <!-- No transition wrapper: a shared `fade` transition can wedge on a
       missed transitionend, leaving the scrim stuck at opacity 0 forever
       (same failure class already fixed in BetSheet / wallet modal /
       App.vue's router-view). Toggle visibility directly instead. -->
  <div v-if="show && state" class="fp-scrim" @click.self="close">
    <div class="fp-card">
      <header class="fp-head">
        <strong>Extra first deposit bonus</strong>
        <button class="fp-x" @click="close">✕</button>
        </header>
        <p class="fp-sub">Each account can only receive rewards once.</p>

        <div v-if="state.firstDepositAmount === null" class="fp-nudge">
          Make your first deposit to unlock a bonus below.
        </div>
        <p v-if="errMsg" class="fp-err">{{ errMsg }}</p>

        <div class="fp-list">
          <div
            v-for="t in state.tiers"
            :key="t.threshold"
            class="fp-row"
            :class="{ qualified: t.qualified }"
          >
            <span class="fp-title">₹{{ formatMinor(t.threshold) }}</span>
            <span class="fp-bonus">+₹{{ formatMinor(t.bonus) }}</span>
            <button
              class="fp-claim"
              :class="{ active: t.qualified && !state.claimed }"
              :disabled="!t.qualified || state.claimed || busy"
              @click="claim"
            >
              Claim
            </button>
          </div>
        </div>

        <footer class="fp-foot">
          <label class="fp-check">
            <input v-model="dontShowToday" type="checkbox" />
            <span>No more reminders today</span>
          </label>
          <button v-if="state.firstDepositAmount === null" class="fp-cta" @click="goDeposit">
            Deposit
          </button>
          <button v-else class="fp-cta" @click="goActivity">Activity</button>
        </footer>
      </div>
    </div>
</template>

<style scoped lang="scss">
.fp-scrim {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.fp-card {
  width: 100%;
  max-width: 340px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-radius: 18px;
  padding: 18px;
  box-shadow: var(--shadow-pop);
}

.fp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  strong {
    font-size: 16px;
    color: var(--text);
  }
}

.fp-x {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text-dim);
  font-size: 12px;
  flex: 0 0 auto;
}

.fp-sub {
  margin: 6px 0 12px;
  font-size: 11px;
  color: var(--text-dim);
}

.fp-nudge {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary) 10%, var(--surface-2));
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.5;
}

.fp-err {
  margin: 0 0 10px;
  font-size: 11px;
  color: var(--red);
}

.fp-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  padding-right: 2px;
}

.fp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid transparent;

  &.qualified {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, var(--surface-2));
  }
}

.fp-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
}

.fp-bonus {
  font-size: 12px;
  font-weight: 800;
  color: var(--primary-deep);
  white-space: nowrap;
}

.fp-claim {
  margin-left: auto;
  flex: 0 0 auto;
  height: 26px;
  padding: 0 12px;
  border-radius: 999px;
  border: none;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  background: var(--surface-3);
  color: var(--text-faint);

  &.active {
    background: #16b979;
    color: #fff;
  }
  &:disabled {
    cursor: not-allowed;
  }
}

.fp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.fp-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-dim);

  input {
    accent-color: var(--primary);
  }
}

.fp-cta {
  flex: 0 0 auto;
  height: 34px;
  padding: 0 18px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
</style>
