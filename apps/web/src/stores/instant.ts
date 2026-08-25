import { defineStore } from 'pinia';
import type {
  ABCard as ABCardT,
  ABHand,
  ABSide as ABSideT,
  DTSide as DTSideT,
  DiceDirection,
  HiloCall,
  HiloCard as HiloCardT,
} from '@lp/shared';
import { api } from '@/api/client';
import { useAuthStore } from './auth';

export interface SeedState {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface InstantHistoryRow {
  id: string;
  gameCode: string;
  stake: string;
  params: Record<string, unknown>;
  state: Record<string, unknown> | null;
  resultData: Record<string, unknown> | null;
  multiplierX100: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'REFUNDED';
  payout: string;
  nonce: number;
  createdAt: string;
}

export interface HiloGame {
  betId: string;
  stake: string;
  current: HiloCardT;
  steps: Array<{ rank: number; call: HiloCall; drawn: HiloCardT }>;
  multiplierX100: number;
}

export interface DTResult {
  side: DTSideT;
  dragon: ABCardT;
  tiger: ABCardT;
  winner: DTSideT;
  won: boolean;
  multiplierX100: number;
  payout: string;
}

export interface ABGame {
  betId: string;
  stake: string;
  joker: ABCardT;
  firstSide: ABSideT;
  odds: { andar: number; bahar: number };
}

export interface MinesGame {
  betId: string;
  stake: string;
  mines: number;
  revealed: number[];
  multiplierX100: number;
}

export interface ChickenGame {
  betId: string;
  stake: string;
  state: {
    minesCount: number;
    row: number;
    path: number[];
  };
  multiplierX100: number;
}

/**
 * State shared by Dice, Limbo and Mines.
 *
 * These games have no shared round and no socket — each call resolves on its
 * own. What they DO share is the seed pair, so it lives here and every game
 * reads the same commitment and nonce.
 */
export const useInstantStore = defineStore('instant', {
  state: () => ({
    seed: null as SeedState | null,
    history: [] as InstantHistoryRow[],
    mines: null as MinesGame | null,
    /** Board revealed once a Mines game ends. */
    minePositions: null as number[] | null,
    lastMineHit: null as number | null,

    chicken: null as ChickenGame | null,
    chickenRowMines: null as number[] | null,
    chickenLastHit: null as number | null,
    chickenResult: null as { path: number[]; finalRow: number; cashedOut?: boolean } | null,

    hilo: null as HiloGame | null,

    /** Andar Bahar: the open hand, and the last completed deal. */
    ab: null as ABGame | null,
    abResult: null as (ABHand & { side: ABSideT; won: boolean; payout: string }) | null,

    /** Dragon Tiger: the last deal. */
    dt: null as DTResult | null,
  }),

  actions: {
    /**
     * Clears this session's cached view of the instant games.
     *
     * Called when leaving a game. Besides resetting history on exit, it stops
     * one game's results briefly showing under another — the store is shared
     * by Dice, Limbo, Mines, Plinko, Keno and Hi-Lo, and `history` is filtered
     * per game only once the next fetch returns.
     *
     * Bets already placed are unaffected: an in-progress Mines or Hi-Lo game
     * lives on the server and is restored on the next visit.
     */
    reset() {
      this.history = [];
      this.mines = null;
      this.hilo = null;
      this.minePositions = null;
      this.lastMineHit = null;
      this.ab = null;
      this.abResult = null;
      this.dt = null;
      this.chicken = null;
      this.chickenRowMines = null;
      this.chickenLastHit = null;
      this.chickenResult = null;
    },

    async loadSeed() {
      const { data } = await api.get('/instant/seed');
      this.seed = data.data;
    },

    async setClientSeed(clientSeed: string) {
      const { data } = await api.post('/instant/seed/client', { clientSeed });
      this.seed = data.data;
    },

    async rotateSeed() {
      const { data } = await api.post('/instant/seed/rotate', {});
      this.seed = { ...data.data.next };
      return data.data.revealed as {
        serverSeed: string;
        serverSeedHash: string;
        clientSeed: string;
        betsPlayed: number;
      };
    },

    async loadHistory(game?: string) {
      const q = game ? `?game=${game}&take=25` : '?take=25';
      const { data } = await api.get(`/instant/history${q}`);
      this.history = data.data;
    },

    bumpNonce() {
      if (this.seed) this.seed.nonce += 1;
    },

    // --- Dice ---------------------------------------------------------------

    async rollDice(stake: string, target: number, direction: DiceDirection) {
      const { data } = await api.post('/instant/dice/roll', { stake, target, direction });
      useAuthStore().setBalance(data.data.balance);
      this.bumpNonce();
      await this.loadHistory('DICE');
      return data.data as {
        roll: number;
        won: boolean;
        multiplierX100: number;
        payout: string;
        nonce: number;
      };
    },

    // --- Limbo --------------------------------------------------------------

    async playLimbo(stake: string, targetX100: number) {
      const { data } = await api.post('/instant/limbo/play', { stake, targetX100 });
      useAuthStore().setBalance(data.data.balance);
      this.bumpNonce();
      await this.loadHistory('LIMBO');
      return data.data as {
        resultX100: number;
        won: boolean;
        targetX100: number;
        payout: string;
      };
    },

    // --- Mines --------------------------------------------------------------

    async loadMines() {
      const { data } = await api.get('/instant/mines/current');
      this.mines = data.data;
      if (data.data) {
        this.minePositions = null;
        this.lastMineHit = null;
      }
    },

    async startMines(stake: string, mines: number) {
      const { data } = await api.post('/instant/mines/start', { stake, mines });
      useAuthStore().setBalance(data.data.balance);
      this.bumpNonce();
      this.minePositions = null;
      this.lastMineHit = null;
      this.mines = {
        betId: data.data.betId,
        stake,
        mines,
        revealed: [],
        multiplierX100: data.data.multiplierX100,
      };
    },

    async revealTile(tile: number) {
      const { data } = await api.post('/instant/mines/reveal', { tile });
      const d = data.data;

      if (this.mines) {
        this.mines.revealed = d.revealed;
        this.mines.multiplierX100 = d.multiplierX100;
      }

      if (d.status !== 'PENDING') {
        // Game over — the server now discloses the board.
        this.minePositions = d.minePositions;
        this.lastMineHit = d.hitMine ? tile : null;
        if (d.balance) useAuthStore().setBalance(d.balance);
        this.mines = null;
        await this.loadHistory('MINES');
      }

      return d as {
        hitMine: boolean;
        status: 'PENDING' | 'WON' | 'LOST';
        multiplierX100: number;
        payout: string;
      };
    },

    // --- Chicken Road -------------------------------------------------------

    async loadChicken() {
      const { data } = await api.get('/instant/chicken/current');
      this.chicken = data.data;
      if (data.data) {
        this.chickenRowMines = null;
        this.chickenLastHit = null;
        this.chickenResult = null;
      }
    },

    async startChicken(stake: string, minesCount: number) {
      const { data } = await api.post('/instant/chicken/start', { stake, minesCount });
      useAuthStore().setBalance(data.data.balance);
      this.bumpNonce();
      this.chickenRowMines = null;
      this.chickenLastHit = null;
      this.chickenResult = null;
      this.chicken = { ...data.data, stake, multiplierX100: 100 };
    },

    async stepChicken(lane: number) {
      const { data } = await api.post('/instant/chicken/step', { lane });
      const d = data.data;

      if (this.chicken) {
        this.chicken.state = d.state;
        this.chicken.multiplierX100 = d.multiplierX100;
      }

      if (d.finished) {
        this.chickenRowMines = d.rowMines;
        this.chickenLastHit = d.hitMine ? lane : null;
        this.chickenResult = { path: this.chicken!.state.path, finalRow: this.chicken!.state.row };
        if (d.balance) useAuthStore().setBalance(d.balance);
        this.chicken = null;
        await this.loadHistory('CHICKEN');
      }

      return d as {
        hitMine: boolean;
        finished: boolean;
        won: boolean;
        rowMines: number[];
        multiplierX100: number;
        payout: string;
      };
    },

    async cashoutChicken() {
      const { data } = await api.post('/instant/chicken/cashout');
      const d = data.data;
      if (d.balance) useAuthStore().setBalance(d.balance);
      this.chickenResult = { path: this.chicken!.state.path, finalRow: this.chicken!.state.row, cashedOut: true };
      this.chicken = null;
      await this.loadHistory('CHICKEN');
      return d as { payout: string; multiplierX100: number };
    },

    // --- Plinko -------------------------------------------------------------

    async dropPlinko(stake: string, rows: number, risk: string) {
      const { data } = await api.post('/instant/plinko/drop', { stake, rows, risk });
      useAuthStore().setBalance(data.data.balance);
      this.bumpNonce();
      await this.loadHistory('PLINKO');
      return data.data as {
        path: boolean[];
        bucket: number;
        multiplierX100: number;
        payout: string;
      };
    },

    // --- Wheel --------------------------------------------------------------

    async spinWheel(stake: string, risk: string) {
      const { data } = await api.post('/instant/wheel/spin', { stake, risk });
      useAuthStore().setBalance(data.data.balance);
      this.bumpNonce();
      await this.loadHistory('WHEEL');
      return data.data as {
        segment: number;
        multiplierX100: number;
        payout: string;
        nonce: number;
      };
    },

    // --- MotoRace -------------------------------------------------------------

    async raceMoto(stake: string, pick: number) {
      const { data } = await api.post('/instant/motorace/race', { stake, pick });
      useAuthStore().setBalance(data.data.balance);
      this.bumpNonce();
      await this.loadHistory('MOTORACE');
      return data.data as {
        pick: number;
        winner: number;
        multiplierX100: number;
        payout: string;
        nonce: number;
      };
    },

    // --- Keno ---------------------------------------------------------------

    async playKeno(stake: string, picks: number[]) {
      const { data } = await api.post('/instant/keno/play', { stake, picks });
      useAuthStore().setBalance(data.data.balance);
      this.bumpNonce();
      await this.loadHistory('KENO');
      return data.data as {
        picks: number[];
        drawn: number[];
        hits: number[];
        multiplierX100: number;
        payout: string;
      };
    },

    // --- Dragon Tiger -------------------------------------------------------

    async playDragonTiger(stake: string, side: DTSideT) {
      const { data } = await api.post('/instant/dragontiger/play', { stake, side });
      useAuthStore().setBalance(data.data.balance);
      this.bumpNonce();
      this.dt = data.data;
      await this.loadHistory('DRAGONTIGER');
      return data.data as DTResult;
    },

    // --- Andar Bahar --------------------------------------------------------

    async loadAB() {
      const { data } = await api.get('/instant/andarbahar/current');
      this.ab = data.data;
      if (data.data) this.abResult = null;
    },

    async startAB(stake: string) {
      const { data } = await api.post('/instant/andarbahar/start', { stake });
      useAuthStore().setBalance(data.data.balance);
      this.bumpNonce();
      this.abResult = null;
      this.ab = {
        betId: data.data.betId,
        stake,
        joker: data.data.joker,
        firstSide: data.data.firstSide,
        odds: data.data.odds,
      };
    },

    async pickAB(side: ABSideT) {
      const { data } = await api.post('/instant/andarbahar/pick', { side });
      const d = data.data;
      if (d.balance) useAuthStore().setBalance(d.balance);
      this.abResult = { ...d.hand, side: d.side, won: d.won, payout: d.payout };
      this.ab = null;
      await this.loadHistory('ANDARBAHAR');
      return d as { won: boolean; multiplierX100: number; payout: string; hand: ABHand };
    },

    // --- Hi-Lo --------------------------------------------------------------

    async loadHilo() {
      const { data } = await api.get('/instant/hilo/current');
      this.hilo = data.data;
    },

    async startHilo(stake: string) {
      const { data } = await api.post('/instant/hilo/start', { stake });
      useAuthStore().setBalance(data.data.balance);
      this.bumpNonce();
      this.hilo = {
        betId: data.data.betId,
        stake,
        current: data.data.current,
        steps: [],
        multiplierX100: data.data.multiplierX100,
      };
    },

    async callHilo(call: 'higher' | 'lower') {
      const { data } = await api.post('/instant/hilo/call', { call });
      const d = data.data;

      if (this.hilo) {
        this.hilo.current = d.drawn;
        this.hilo.steps = d.steps;
        this.hilo.multiplierX100 = d.multiplierX100;
      }

      if (d.status !== 'PENDING') {
        this.hilo = null;
        await this.loadHistory('HILO');
      }
      return d as { drawn: HiloCardT; survived: boolean; multiplierX100: number; status: string };
    },

    async cashoutHilo() {
      const { data } = await api.post('/instant/hilo/cashout', {});
      useAuthStore().setBalance(data.data.balance);
      this.hilo = null;
      await this.loadHistory('HILO');
      return data.data as { multiplierX100: number; payout: string };
    },

    async cashoutMines() {
      const { data } = await api.post('/instant/mines/cashout', {});
      useAuthStore().setBalance(data.data.balance);
      this.minePositions = data.data.minePositions;
      this.lastMineHit = null;
      this.mines = null;
      await this.loadHistory('MINES');
      return data.data as { multiplierX100: number; payout: string };
    },
  },
});
