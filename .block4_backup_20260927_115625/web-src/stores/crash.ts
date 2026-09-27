import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';
import {
  CRASH_EVENTS,
  SOCKET_EVENTS,
  X100,
  multiplierAtX100,
  type CrashCashoutPayload,
  type CrashPhase,
  type CrashStatePayload,
} from '@lp/shared';
import { api, tokens } from '@/api/client';
import { useAuthStore } from './auth';

const CRASH_CHANNEL = 'CRASH';

export interface CrashHistoryRow {
  roundNo: string;
  crashPointX100: number;
  serverSeed: string;
  serverSeedHash: string;
}

export interface MyCrashBet {
  id: string;
  slot: number;
  roundNo: string;
  crashPointX100: number;
  stake: string;
  autoCashoutX100: number | null;
  cashedOutX100: number | null;
  status: 'PENDING' | 'WON' | 'LOST' | 'REFUNDED';
  payout: string;
  maxPayout: string;
}

export interface MyBetOnRound {
  id: string;
  slot: number;
  stake: string;
  autoCashoutX100: number | null;
  cashedOutX100: number | null;
  status: string;
  payout: string;
}

/** A row in the live "All Bets" list. */
export interface RoundBetRow {
  id: string;
  name: string;
  stake: string;
  cashedOutX100: number | null;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'REFUNDED';
}

let socket: Socket | null = null;
let raf: number | null = null;
let lastRoundBetsAt = 0;

export const useCrashStore = defineStore('crash', {
  state: () => ({
    roundNo: '',
    phase: 'WAITING' as CrashPhase,
    serverSeedHash: '',
    serverSeed: null as string | null,
    crashPointX100: null as number | null,

    clockOffsetMs: 0,
    startedAtMs: null as number | null,
    waitingEndsAtMs: null as number | null,

    /** Locally interpolated so the number climbs smoothly between ticks. */
    multiplierX100: X100,

    /** Both bet panels, keyed by slot. */
    slots: {} as Record<number, MyBetOnRound | undefined>,
    history: [] as CrashHistoryRow[],
    myBets: [] as MyCrashBet[],
    liveCashouts: [] as CrashCashoutPayload[],
    /** Everyone's bets on the current round. */
    roundBets: [] as RoundBetRow[],

    connected: false,
    /** Round-trip time to the API, shown in the header. */
    pingMs: 0,
  }),

  getters: {
    isWaiting: (s) => s.phase === 'WAITING',
    isRunning: (s) => s.phase === 'RUNNING',
    isCrashed: (s) => s.phase === 'CRASHED',

    /** Seconds left in the betting window. */
    waitSecondsLeft(s): number {
      if (!s.waitingEndsAtMs) return 0;
      const serverNow = Date.now() + s.clockOffsetMs;
      return Math.max(0, Math.ceil((s.waitingEndsAtMs - serverNow) / 1000));
    },

    /** True when that panel holds an un-cashed bet on the running round. */
    canCashOut: (s) => (slot: number) => {
      const b = s.slots[slot];
      return s.phase === 'RUNNING' && !!b && b.cashedOutX100 === null && b.status === 'PENDING';
    },

    hasBet: (s) => (slot: number) => !!s.slots[slot],
  },

  actions: {
    applyState(p: CrashStatePayload) {
      this.clockOffsetMs = p.serverNowMs - Date.now();
      this.roundNo = p.roundNo;
      this.phase = p.phase;
      this.serverSeedHash = p.serverSeedHash;
      this.serverSeed = p.serverSeed;
      this.crashPointX100 = p.crashPointX100;
      this.startedAtMs = p.startedAtMs;
      this.waitingEndsAtMs = p.waitingEndsAtMs;
      this.multiplierX100 = p.multiplierX100;
    },

    connect() {
      if (socket) {
        socket.auth = { token: tokens.access };
        if (!socket.connected) socket.connect();
      } else {
        socket = io({ auth: { token: tokens.access }, transports: ['websocket', 'polling'] });

        socket.on('connect', () => {
          this.connected = true;
          socket!.emit(SOCKET_EVENTS.JOIN_ROOM, CRASH_CHANNEL);
        });
        socket.on('disconnect', () => {
          this.connected = false;
        });

        socket.on(CRASH_EVENTS.STATE, (p: CrashStatePayload) => {
          const roundChanged = p.roundNo !== this.roundNo;
          this.applyState(p);
          if (roundChanged) {
            // New round: clear last round's bets and cash-out feed.
            this.slots = {};
            this.liveCashouts = [];
            this.roundBets = [];
            void this.loadHistory();
            void this.loadMyBets();
          }
          void this.loadRoundBets();
        });

        socket.on(CRASH_EVENTS.BUST, () => {
          void this.loadHistory();
          void this.loadMyBets();
          void this.refreshState();
        });

        socket.on(CRASH_EVENTS.CASHOUT, (p: CrashCashoutPayload) => {
          this.liveCashouts.unshift(p);
          this.liveCashouts = this.liveCashouts.slice(0, 8);
        });

        socket.on(SOCKET_EVENTS.BALANCE, (p: { balance: string }) => {
          useAuthStore().setBalance(p.balance);
        });
      }

      this.startInterpolating();
    },

    /**
     * Recomputes the multiplier every frame from `startedAtMs` using the same
     * curve function the server prices cashouts with — so the number on screen
     * and the number you get paid can never diverge.
     */
    startInterpolating() {
      if (raf !== null) return;
      const step = () => {
        if (this.phase === 'RUNNING' && this.startedAtMs !== null) {
          const serverNow = Date.now() + this.clockOffsetMs;
          const m = multiplierAtX100(serverNow - this.startedAtMs);
          this.multiplierX100 = this.crashPointX100 ? Math.min(m, this.crashPointX100) : m;
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    },

    /**
     * Clears everything this client was showing about the game.
     *
     * Server-side round history is untouched — Crash rounds are shared by all
     * players and remain auditable. This only drops what THIS session had
     * cached, so leaving and coming back starts from a clean slate instead of
     * flashing the previous visit's results.
     */
    reset() {
      this.roundNo = '';
      this.phase = 'WAITING';
      this.serverSeedHash = '';
      this.serverSeed = null;
      this.crashPointX100 = null;
      this.startedAtMs = null;
      this.waitingEndsAtMs = null;
      this.multiplierX100 = X100;
      this.slots = {};
      this.history = [];
      this.myBets = [];
      this.liveCashouts = [];
      this.roundBets = [];
      lastRoundBetsAt = 0;
    },

    disconnect() {
      socket?.disconnect();
      socket = null;
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      this.connected = false;
      // Tied to disconnect so exiting the game can never leave stale history
      // behind, whichever way the player left.
      this.reset();
    },

    async refreshState() {
      const t0 = performance.now();
      const { data } = await api.get('/crash/state');
      this.pingMs = Math.round(performance.now() - t0);
      this.applyState(data.data);
      this.slots = data.data.myBets ?? {};
    },

    /**
     * The live "All Bets" list. Throttled to once a second — the socket tick
     * fires several times per second and this does not need to keep up.
     */
    async loadRoundBets() {
      const now = Date.now();
      if (now - lastRoundBetsAt < 1000) return;
      lastRoundBetsAt = now;
      try {
        const { data } = await api.get('/crash/round-bets');
        this.roundBets = data.data.bets;
      } catch {
        /* transient — the next tick retries */
      }
    },

    async loadHistory() {
      const { data } = await api.get('/crash/history?take=24');
      this.history = data.data;
    },

    async loadMyBets() {
      if (!useAuthStore().isLoggedIn) {
        this.myBets = [];
        return;
      }
      const { data } = await api.get('/crash/my-bets?take=30');
      this.myBets = data.data;
    },

    async loadAll() {
      await Promise.all([
        this.refreshState(),
        this.loadHistory(),
        this.loadMyBets(),
        this.loadRoundBets(),
      ]);
    },

    async placeBet(slot: number, stake: string, autoCashoutX100: number | null) {
      const { data } = await api.post('/crash/bet', { stake, autoCashoutX100, slot });
      useAuthStore().setBalance(data.data.balance);
      await this.refreshState();
      return data.data;
    },

    async cashOut(slot: number) {
      const { data } = await api.post('/crash/cashout', { slot });
      useAuthStore().setBalance(data.data.balance);
      await this.refreshState();
      return data.data;
    },
  },
});
