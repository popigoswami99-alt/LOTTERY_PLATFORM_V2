import { defineStore } from 'pinia';
import { api, tokens } from '@/api/client';

export interface NotificationRow {
  id: string;
  kind: 'SYSTEM' | 'DEPOSIT' | 'WITHDRAWAL' | 'BONUS' | 'VIP';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

/** The in-app notification feed backing the navbar bell. */
export const useNotificationStore = defineStore('notifications', {
  state: () => ({
    unread: 0,
    items: [] as NotificationRow[],
    loaded: false,
  }),

  actions: {
    async refreshUnread() {
      if (!tokens.access) {
        this.unread = 0;
        return;
      }
      try {
        const { data } = await api.get('/notifications/unread-count');
        this.unread = data.data.unread;
      } catch {
        /* ignore — the badge is best-effort */
      }
    },

    async loadAll() {
      const { data } = await api.get('/notifications?take=40');
      this.items = data.data.items;
      this.unread = data.data.unread;
      this.loaded = true;
    },

    async markRead(id?: string) {
      const { data } = await api.post('/notifications/read', id ? { id } : {});
      this.unread = data.data.unread;
      this.items = this.items.map((n) =>
        !id || n.id === id ? { ...n, read: true } : n,
      );
    },

    reset() {
      this.unread = 0;
      this.items = [];
      this.loaded = false;
    },
  },
});
