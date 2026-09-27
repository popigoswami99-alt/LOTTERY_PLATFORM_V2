import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';
import {
  ROOM_BY_KEY,
  SOCKET_EVENTS,
  coloursOf,
  rulesForRoom,
  type ResultPayload,
  type ResultSummary,
  type TickPayload,
} from '@lp/shared';
import { api, tokens } from '@/api/client';
import { useAuthStore } from './auth';

export interface ResultRow {
  periodNo: string;
  result: unknown;
  resultNumber: number | null;
  summary: ResultSummary;
  serverSeed: string;
  serverSeedHash: string;
}

export interface MyBet {
  id: string;
  periodNo: string;
  betType: string;
  selection: string;
  stake: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'REFUNDED';
  payout: string;
  odds: string;
  resultNumber: number | null;
  summary: ResultSummary | null;
  createdAt: string;
}

let socket: Socket | null = null;
let ticker: number | null = null;

/**
 * One store drives every game room. Which game is being played is just the
 * room key — the rules module for that room supplies odds, validation and
 * result formatting, so no game-specific branching lives here.
 */
export const useGameStore = defineStore('game', {
  state: () => ({
    roomKey: 'WINGO_1M',
    periodNo: '',
    serverSeedHash: '',
    status: 'OPEN' as 'OPEN' | 'LOCKED',

    /** Server clock minus local clock. Every countdown is derived through this
     *  so a device with a wrong clock still locks at the right moment. */
    clockOffsetMs: 0,
    endMs: 0,
    lockMs: 0,
    remainingMs: 0,

    results: [] as ResultRow[],
    myBets: [] as MyBet[],

    lastResult: null as ResultPayload | null,
    connected: false,
  }),

  getters: {
    room: (state) => ROOM_BY_KEY[state.roomKey],
    rules: (state) => rulesForRoom(state.roomKey),
    gameCode: (state) => ROOM_BY_KEY[state.roomKey]?.gameCode ?? '',

    /** Countdown split into digits, the way this game is always displayed. */
    countdown(state) {
      const total = Math.max(0, Math.ceil(state.remainingMs / 1000));
      const mm = String(Math.floor(total / 60)).padStart(2, '0');
      const ss = String(total % 60).padStart(2, '0');
      return { mm, ss, digits: [mm[0], mm[1], ss[0], ss[1]], totalSec: total };
    },

    isLocked: (state) => state.status === 'LOCKED',
  },

  actions: {
    connect() {
      if (socket) {
        socket.auth = { token: tokens.access };
        if (!socket.connected) socket.connect();
      } else {
        socket = io({ auth: { token: tokens.access }, transports: ['websocket', 'polling'] });

        socket.on('connect', () => {
          this.connected = true;
          socket!.emit(SOCKET_EVENTS.JOIN_ROOM, this.roomKey);
        });
        socket.on('disconnect', () => {
          this.connected = false;
        });

        socket.on(SOCKET_EVENTS.TICK, (t: TickPayload) => {
          if (t.roomKey !== this.roomKey) return;
          this.clockOffsetMs = t.serverNowMs - Date.now();
          this.periodNo = t.periodNo;
          this.serverSeedHash = t.serverSeedHash;
          this.status = t.status;
          this.endMs = t.endMs;
          this.lockMs = t.lockMs;
          this.remainingMs = t.remainingMs;
        });

        socket.on(SOCKET_EVENTS.RESULT, (r: ResultPayload) => {
          if (r.roomKey !== this.roomKey) return;
          this.lastResult = r;
          const rules = rulesForRoom(this.roomKey);
          this.results.unshift({
            periodNo: r.periodNo,
            result: r.result,
            resultNumber: r.resultNumber,
            summary: rules
              ? rules.describe(r.result)
              : { primary: String(r.resultNumber ?? '?'), tags: [] },
            serverSeed: r.serverSeed,
            serverSeedHash: '',
          });
          this.results = this.results.slice(0, 30);
          void this.loadMyBets();
        });

        socket.on(SOCKET_EVENTS.BALANCE, (p: { balance: string }) => {
          useAuthStore().setBalance(p.balance);
        });
      }

      this.startLocalTicker();
    },

    /**
     * Interpolates the countdown between server ticks so it moves smoothly at
     * 10fps instead of jumping once a second.
     */
    startLocalTicker() {
      if (ticker !== null) return;
      ticker = window.setInterval(() => {
        if (!this.endMs) return;
        const serverNow = Date.now() + this.clockOffsetMs;
        this.remainingMs = Math.max(0, this.endMs - serverNow);
        if (serverNow >= this.lockMs && this.status === 'OPEN') this.status = 'LOCKED';
      }, 100);
    },

    /**
     * Clears this session's cached view of the room. Server-side period
     * history is untouched — it is shared and auditable.
     */
    reset() {
      this.periodNo = '';
      this.serverSeedHash = '';
      this.status = 'OPEN';
      this.endMs = 0;
      this.lockMs = 0;
      this.remainingMs = 0;
      this.results = [];
      this.myBets = [];
      this.lastResult = null;
    },

    disconnect() {
      socket?.disconnect();
      socket = null;
      if (ticker !== null) window.clearInterval(ticker);
      ticker = null;
      this.connected = false;
      this.reset();
    },

    async switchRoom(roomKey: string) {
      if (roomKey === this.roomKey) return;
      socket?.emit(SOCKET_EVENTS.LEAVE_ROOM, this.roomKey);
      this.roomKey = roomKey;
      this.results = [];
      this.myBets = [];
      this.lastResult = null;
      socket?.emit(SOCKET_EVENTS.JOIN_ROOM, roomKey);
      await this.loadAll();
    },

    async loadState() {
      const { data } = await api.get(`/rooms/${this.roomKey}/state`);
      const d = data.data;
      this.clockOffsetMs = d.serverNowMs - Date.now();
      this.periodNo = d.periodNo;
      this.serverSeedHash = d.serverSeedHash;
      this.status = d.status;
      this.endMs = d.endMs;
      this.lockMs = d.lockMs;
      this.remainingMs = d.remainingMs;
    },

    async loadResults() {
      const { data } = await api.get(`/rooms/${this.roomKey}/results?take=20`);
      this.results = data.data;
    },

    async loadMyBets() {
      if (!useAuthStore().isLoggedIn) {
        this.myBets = [];
        return;
      }
      const { data } = await api.get(`/rooms/${this.roomKey}/my-bets?take=30`);
      this.myBets = data.data;
    },

    async loadAll() {
      await Promise.all([this.loadState(), this.loadResults(), this.loadMyBets()]);
    },

    async placeBet(payload: {
      betType: string;
      selection: string;
      unitAmount: string;
      multiplier: number;
    }) {
      const { data } = await api.post(`/rooms/${this.roomKey}/bet`, payload);
      useAuthStore().setBalance(data.data.balance);
      await this.loadMyBets();
      return data.data;
    },

    /** Helper for WinGo result balls: 0 and 5 render as split two-tone circles. */
    ballClass(n: number): string {
      const c = coloursOf(n);
      return c.length === 2 ? `ball-violet-${c[1]}` : `ball-${c[0]}`;
    },
  },
});
