import { defineStore } from 'pinia';
import { api, tokens } from '@/api/client';

export interface Me {
  id: string;
  nickname: string;
  phone: string | null;
  email: string | null;
  inviteCode: string;
  role?: 'USER' | 'ADMIN';
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as Me | null,
    balance: '0',
    ready: false,
  }),

  getters: {
    isLoggedIn: (s) => s.user !== null,
    isAdmin: (s) => s.user?.role === 'ADMIN',
  },

  actions: {
    async bootstrap() {
      if (!tokens.access) {
        this.ready = true;
        return;
      }
      try {
        const { data } = await api.get('/auth/me');
        this.user = data.data.user;
        this.balance = data.data.balance;
      } catch {
        tokens.clear();
        this.user = null;
      } finally {
        this.ready = true;
      }
    },

    async login(identifier: string, password: string) {
      const { data } = await api.post('/auth/login', { identifier, password });
      tokens.set(data.data.accessToken, data.data.refreshToken);
      this.user = data.data.user;
      await this.refreshBalance();
    },

    async register(payload: {
      phone: string;
      password: string;
      nickname?: string;
      inviteCode?: string;
    }) {
      const { data } = await api.post('/auth/register', payload);
      tokens.set(data.data.accessToken, data.data.refreshToken);
      this.user = data.data.user;
      await this.refreshBalance();
    },

    async refreshBalance() {
      if (!tokens.access) return;
      const { data } = await api.get('/wallet/balance');
      this.balance = data.data.balance;
    },

    setBalance(balance: string) {
      this.balance = balance;
    },

    async logout() {
      try {
        if (tokens.refresh) await api.post('/auth/logout', { refreshToken: tokens.refresh });
      } catch {
        /* logging out locally is what matters */
      }
      tokens.clear();
      this.user = null;
      this.balance = '0';
    },
  },
});
