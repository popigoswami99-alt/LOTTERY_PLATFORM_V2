<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useNotificationStore } from '@/stores/notifications';
import { useAuthStore } from '@/stores/auth';

const notifs = useNotificationStore();
const auth = useAuthStore();
const router = useRouter();

const ICON: Record<string, string> = {
  SYSTEM: '🔔', DEPOSIT: '💰', WITHDRAWAL: '🏧', BONUS: '🎁', VIP: '👑',
};

function fmt(s: string) {
  return new Date(s).toLocaleString();
}

onMounted(async () => {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/notifications' } });
    return;
  }
  await notifs.loadAll();
  // Opening the feed clears the unread badge.
  if (notifs.unread > 0) await notifs.markRead();
});
</script>

<template>
  <div class="page">
    <header class="top">
      <router-link :to="{ name: 'home' }" class="back">‹</router-link>
      <strong>Notifications</strong>
      <button v-if="notifs.items.some((n) => !n.read)" class="mark" @click="notifs.markRead()">
        Mark all read
      </button>
      <span v-else class="spacer" />
    </header>

    <section class="list">
      <div v-for="n in notifs.items" :key="n.id" class="note" :class="{ unread: !n.read }">
        <span class="ic">{{ ICON[n.kind] ?? '🔔' }}</span>
        <div class="body">
          <div class="ttl">{{ n.title }}</div>
          <div class="msg">{{ n.body }}</div>
          <div class="time faint tiny">{{ fmt(n.createdAt) }}</div>
        </div>
        <span v-if="!n.read" class="dot" />
      </div>
      <p v-if="notifs.loaded && !notifs.items.length" class="empty">No notifications yet.</p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }

.top {
  display: flex; align-items: center; gap: 10px;
  strong { flex: 1; font-size: 17px; }
}
.back {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: var(--surface); box-shadow: var(--shadow-card);
  color: var(--text); font-size: 20px; text-decoration: none; line-height: 1;
}
.mark {
  height: 30px; padding: 0 12px; border-radius: 999px; background: var(--surface);
  color: var(--primary-deep); font-size: 12px; font-weight: 700; box-shadow: var(--shadow-card);
}
.spacer { width: 30px; }

.list { display: flex; flex-direction: column; gap: 8px; }
.note {
  display: flex; align-items: flex-start; gap: 12px; padding: 14px;
  background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow-card);
  position: relative;
  &.unread { border-left: 3px solid var(--primary); }
}
.ic {
  flex-shrink: 0; width: 36px; height: 36px; border-radius: 10px; background: var(--surface-2);
  display: flex; align-items: center; justify-content: center; font-size: 18px;
}
.body { flex: 1; min-width: 0; }
.ttl { font-size: 14px; font-weight: 800; }
.msg { font-size: 12px; color: var(--text-dim); margin-top: 2px; line-height: 1.5; }
.time { margin-top: 5px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--primary); flex-shrink: 0; margin-top: 4px; }
.tiny { font-size: 10px; }
.empty { padding: 30px 0; text-align: center; color: var(--text-faint); font-size: 13px; }
</style>
