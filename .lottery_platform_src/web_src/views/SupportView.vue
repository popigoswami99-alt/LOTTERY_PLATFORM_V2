<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, apiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

/**
 * Customer service. A player opens a ticket, an operator answers it from the
 * back-office, and the reply arrives in notifications. Quick-contact links and
 * an FAQ sit above the form for the common cases.
 */

const auth = useAuthStore();
const router = useRouter();

interface Ticket {
  id: string; subject: string; message: string; status: string;
  reply: string | null; createdAt: string; repliedAt: string | null;
}

const tickets = ref<Ticket[]>([]);
const subject = ref('');
const message = ref('');
const busy = ref(false);
const toast = ref('');

const CONTACTS = [
  { icon: '💬', label: 'Live chat (Telegram)', hint: '@SkywaySupport' },
  { icon: '📧', label: 'Email', hint: 'support@skyway.example' },
  { icon: '🕘', label: 'Hours', hint: '24 / 7' },
];

const FAQ = [
  { q: 'How long do withdrawals take?', a: 'Withdrawals are reviewed and usually paid within a few minutes to a few hours.' },
  { q: 'Why is my deposit still pending?', a: 'Approve the payment request on your JazzCash / Easypaisa app with your MPIN. If declined, try again.' },
  { q: 'How do VIP rewards work?', a: 'Your VIP level rises with total turnover. Each tier crossed pays a one-off reward you claim on the VIP page.' },
];
const openFaq = ref<number | null>(null);

async function load() {
  const { data } = await api.get('/support/tickets?take=20');
  tickets.value = data.data;
}

async function submit() {
  if (subject.value.trim().length < 3) return flash('Enter a subject');
  if (message.value.trim().length < 5) return flash('Describe your issue');
  busy.value = true;
  try {
    await api.post('/support/tickets', { subject: subject.value, message: message.value });
    subject.value = '';
    message.value = '';
    await load();
    flash('Ticket submitted — we will reply in your notifications');
  } catch (e) {
    flash(apiError(e));
  } finally {
    busy.value = false;
  }
}

let toastTimer: number | undefined;
function flash(m: string) {
  toast.value = m;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = ''), 2800);
}
function fmt(s: string) { return new Date(s).toLocaleString(); }

onMounted(() => {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/support' } });
    return;
  }
  load();
});
</script>

<template>
  <div class="page">
    <header class="top">
      <router-link :to="{ name: 'home' }" class="back">‹</router-link>
      <strong>Customer service</strong>
      <span class="spacer" />
    </header>

    <!-- Quick contacts -->
    <section class="contacts">
      <div v-for="c in CONTACTS" :key="c.label" class="contact">
        <span class="ic">{{ c.icon }}</span>
        <div>
          <div class="c-label">{{ c.label }}</div>
          <div class="c-hint">{{ c.hint }}</div>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section class="card">
      <strong class="hd">Frequently asked</strong>
      <div v-for="(f, i) in FAQ" :key="i" class="faq" @click="openFaq = openFaq === i ? null : i">
        <div class="q">
          <span>{{ f.q }}</span>
          <span class="chev">{{ openFaq === i ? '−' : '+' }}</span>
        </div>
        <p v-if="openFaq === i" class="a">{{ f.a }}</p>
      </div>
    </section>

    <!-- New ticket -->
    <section class="card">
      <strong class="hd">Open a ticket</strong>
      <input v-model="subject" class="in" placeholder="Subject" maxlength="120" />
      <textarea v-model="message" class="in area" placeholder="Describe your issue…" maxlength="4000" rows="4" />
      <button class="btn btn-primary" :disabled="busy" @click="submit">
        {{ busy ? 'Submitting…' : 'Submit ticket' }}
      </button>
    </section>

    <!-- My tickets -->
    <section v-if="tickets.length" class="card">
      <strong class="hd">Your tickets</strong>
      <div v-for="t in tickets" :key="t.id" class="ticket">
        <div class="t-head">
          <span class="t-subj">{{ t.subject }}</span>
          <span class="pill" :class="t.status.toLowerCase()">{{ t.status }}</span>
        </div>
        <p class="t-msg">{{ t.message }}</p>
        <div v-if="t.reply" class="t-reply">
          <span class="r-tag">Support</span>{{ t.reply }}
        </div>
        <div class="t-time faint tiny">{{ fmt(t.createdAt) }}</div>
      </div>
    </section>

    <transition name="fade"><div v-if="toast" class="toast">{{ toast }}</div></transition>
  </div>
</template>

<style scoped lang="scss">
.page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.top { display: flex; align-items: center; gap: 10px; strong { flex: 1; font-size: 17px; } }
.back {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: var(--surface); box-shadow: var(--shadow-card); color: var(--text); font-size: 20px; text-decoration: none; line-height: 1;
}
.spacer { width: 30px; }

.contacts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.contact {
  display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;
  padding: 12px 6px; background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow-card);
  .ic { font-size: 20px; }
  .c-label { font-size: 11px; font-weight: 700; }
  .c-hint { font-size: 10px; color: var(--text-dim); }
}

.card { background: var(--surface); border-radius: var(--radius); padding: 14px; box-shadow: var(--shadow-card); }
.hd { display: block; margin-bottom: 10px; font-size: 14px; }

.faq { border-bottom: 1px solid var(--line); padding: 10px 0; cursor: pointer; &:last-child { border: 0; } }
.q { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; }
.chev { color: var(--primary); font-size: 18px; }
.a { margin: 8px 0 0; font-size: 12px; color: var(--text-dim); line-height: 1.6; }

.in {
  width: 100%; margin-bottom: 10px; padding: 11px 12px; border-radius: var(--radius-sm);
  border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: inherit; outline: none;
  &:focus { border-color: var(--primary); }
}
.area { resize: vertical; }

.ticket { border-bottom: 1px solid var(--line); padding: 12px 0; &:last-child { border: 0; } }
.t-head { display: flex; justify-content: space-between; align-items: center; }
.t-subj { font-weight: 800; font-size: 13px; }
.t-msg { margin: 6px 0; font-size: 12px; color: var(--text-dim); line-height: 1.5; }
.t-reply {
  margin: 8px 0 4px; padding: 10px 12px; border-radius: 10px; background: var(--surface-2);
  font-size: 12px; line-height: 1.5;
}
.r-tag {
  display: inline-block; margin-right: 6px; padding: 1px 7px; border-radius: 999px;
  background: var(--primary); color: #fff; font-size: 10px; font-weight: 800;
}
.pill {
  font-size: 10px; font-weight: 800; padding: 2px 9px; border-radius: 999px;
  &.open { background: #fff3d6; color: #b3820b; }
  &.answered { background: #e7f8f0; color: #0c7a52; }
  &.closed { background: var(--surface-3); color: var(--text-dim); }
}
.tiny { font-size: 10px; }
.toast {
  position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%);
  background: rgba(40, 16, 28, 0.95); color: #fff; padding: 9px 16px; border-radius: 999px; font-size: 13px; z-index: 200; max-width: 90%; text-align: center;
}
</style>
