import { defineStore } from 'pinia';
import { api } from '@/api/client';
import { useAuthStore } from './auth';

export interface Vip {
  level: number;
  turnover: string;
  nextLevel: number | null;
  nextAt: string | null;
  progress: number;
}

export interface Profile {
  uid: string;
  nickname: string;
  phone: string | null;
  email: string | null;
  inviteCode: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  memberSince: string;
  balance: string;
  safeBalance: string;
  referrals: number;
  vip: Vip;
}

export interface GameHistoryRow {
  id: string;
  kind: 'lottery' | 'instant' | 'crash';
  gameCode: string;
  label: string;
  detail: string;
  stake: string;
  payout: string;
  status: string;
  multiplier: string | null;
  createdAt: string;
}

export interface MoneyRow {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  memo: string | null;
  createdAt: string;
}

export interface Stats {
  bets: number;
  wins: number;
  losses: number;
  winRate: number;
  staked: string;
  won: string;
  net: string;
  byGame: Array<{
    gameCode: string;
    label: string;
    bets: number;
    staked: string;
    won: string;
  }>;
}

export interface SafeState {
  safeBalance: string;
  cashBalance: string;
  dailyRateBps: number;
  accrualIntervalMs: number;
}

export const useProfileStore = defineStore('profile', {
  state: () => ({
    profile: null as Profile | null,
    stats: null as Stats | null,
    gameHistory: [] as GameHistoryRow[],
    moneyHistory: [] as MoneyRow[],
    safe: null as SafeState | null,
    loading: false,
  }),

  actions: {
    async load() {
      this.loading = true;
      try {
        const { data } = await api.get('/me/profile');
        this.profile = data.data;
        // Keep the shared balance in step with what the profile just read.
        useAuthStore().setBalance(data.data.balance);
      } finally {
        this.loading = false;
      }
    },

    async loadStats() {
      const { data } = await api.get('/me/stats');
      this.stats = data.data;
    },

    async loadGameHistory(take = 40) {
      const { data } = await api.get(`/me/game-history?take=${take}`);
      this.gameHistory = data.data;
    },

    async loadMoneyHistory(filter: 'all' | 'deposit' | 'withdraw' = 'all') {
      const { data } = await api.get(`/me/money-history?filter=${filter}&take=50`);
      this.moneyHistory = data.data;
    },

    async loadSafe() {
      const { data } = await api.get('/me/safe');
      this.safe = data.data;
    },

    async safeDeposit(amount: string) {
      const { data } = await api.post('/me/safe/deposit', { amount });
      this.applySafe(data.data);
    },

    async safeWithdraw(amount: string) {
      const { data } = await api.post('/me/safe/withdraw', { amount });
      this.applySafe(data.data);
    },

    applySafe(d: { cashBalance: string; safeBalance: string }) {
      if (this.safe) {
        this.safe.cashBalance = d.cashBalance;
        this.safe.safeBalance = d.safeBalance;
      }
      if (this.profile) {
        this.profile.balance = d.cashBalance;
        this.profile.safeBalance = d.safeBalance;
      }
      useAuthStore().setBalance(d.cashBalance);
    },

    reset() {
      this.profile = null;
      this.stats = null;
      this.gameHistory = [];
      this.moneyHistory = [];
      this.safe = null;
    },
  },
});
