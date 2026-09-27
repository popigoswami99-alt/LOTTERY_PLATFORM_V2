import { payoutFor, type Odds, type RoomConfig } from '../core.js';
import type { GameRules, Outcome, ResolvableBet, ResultSummary } from './types.js';

type ExtraResult = {
  value: number;
  label: string;
};

const odds = (num:number, den=1): Odds => ({ num, den });
const room = (key:string, gameCode:string, label:string): RoomConfig => ({
  key, gameCode, label, intervalSec: 60, lockBeforeSec: 5,
});

function outcome(bet:ResolvableBet, hit:boolean, o:Odds): Outcome {
  return {
    won: hit,
    odds: o,
    payout: hit ? payoutFor(bet.stake, o) : 0n,
  };
}

function summary(r:ExtraResult): ResultSummary {
  return { primary: r.label, tags: [] };
}

export const rouletteRules: GameRules<ExtraResult> = {
  gameCode: 'ROULETTE',
  label: 'Roulette',
  rooms: [room('ROULETTE_1M','ROULETTE','Roulette 1Min')],
  draw: { count: 1, modulus: 37 },
  buildResult: ([n]) => ({ value:n, label:String(n) }),
  resultDigit: r => r.value % 10,

  validateSelection(betType, selection) {
    if (betType === 'NUMBER' && /^(?:[0-9]|[12][0-9]|3[0])$/.test(selection)) return;
    if (betType === 'COLOR' && ['RED','BLACK','GREEN'].includes(selection)) return;
    throw new Error(`Invalid Roulette selection: ${betType}:${selection}`);
  },

  displayOdds(betType) {
    return betType === 'NUMBER' ? odds(35) : odds(2);
  },

  resolve(bet, result) {
    if (bet.betType === 'NUMBER')
      return outcome(bet, Number(bet.selection) === result.value, odds(35));

    const color = result.value === 0 ? 'GREEN' : result.value % 2 ? 'RED' : 'BLACK';
    const hit = bet.betType === 'COLOR' && bet.selection === color;
    return outcome(bet, hit, odds(2));
  },

  describe: summary,
};

export const blackjackRules: GameRules<ExtraResult> = {
  gameCode: 'BLACKJACK',
  label: 'Blackjack',
  rooms: [room('BLACKJACK_1M','BLACKJACK','Blackjack 1Min')],
  draw: { count: 1, modulus: 3 },
  buildResult: ([n]) => {
    const label = ['PLAYER','DEALER','TIE'][n]!;
    return { value:n, label };
  },
  resultDigit: r => r.value,

  validateSelection(betType, selection) {
    if (betType !== 'RESULT' || !['PLAYER','DEALER','TIE'].includes(selection))
      throw new Error(`Invalid Blackjack selection: ${betType}:${selection}`);
  },

  displayOdds(_b, selection) {
    return selection === 'TIE' ? odds(8) : odds(2);
  },

  resolve(bet, result) {
    const hit = bet.betType === 'RESULT' &&
      bet.selection === result.label;
    return outcome(bet, hit, bet.selection === 'TIE' ? odds(8) : odds(2));
  },

  describe: summary,
};

export const teenPattiRules: GameRules<ExtraResult> = {
  gameCode: 'TEEN_PATTI',
  label: 'Teen Patti',
  rooms: [room('TEEN_PATTI_1M','TEEN_PATTI','Teen Patti 1Min')],
  draw: { count: 1, modulus: 3 },
  buildResult: ([n]) => ({
    value:n,
    label:['PLAYER','BANKER','TIE'][n]!,
  }),
  resultDigit: r => r.value,

  validateSelection(betType, selection) {
    if (betType !== 'RESULT' || !['PLAYER','BANKER','TIE'].includes(selection))
      throw new Error(`Invalid Teen Patti selection: ${betType}:${selection}`);
  },

  displayOdds(_b, selection) {
    return selection === 'TIE' ? odds(8) : odds(2);
  },

  resolve(bet, result) {
    const hit = bet.betType === 'RESULT' && bet.selection === result.label;
    return outcome(bet, hit, bet.selection === 'TIE' ? odds(8) : odds(2));
  },

  describe: summary,
};

const SLOT_SYMBOLS = ['CHERRY','LEMON','BELL','STAR','SEVEN'];

export const slotsRules: GameRules<ExtraResult> = {
  gameCode: 'SLOTS',
  label: 'Slots',
  rooms: [room('SLOTS_1M','SLOTS','Slots 1Min')],
  draw: { count: 1, modulus: 5 },
  buildResult: ([n]) => ({
    value:n,
    label:SLOT_SYMBOLS[n]!,
  }),
  resultDigit: r => r.value,

  validateSelection(betType, selection) {
    if (betType !== 'SYMBOL' || !SLOT_SYMBOLS.includes(selection))
      throw new Error(`Invalid Slots selection: ${betType}:${selection}`);
  },

  displayOdds() {
    return odds(5);
  },

  resolve(bet, result) {
    const hit = bet.betType === 'SYMBOL' && bet.selection === result.label;
    return outcome(bet, hit, odds(5));
  },

  describe: summary,
};

export const fishingRules: GameRules<ExtraResult> = {
  gameCode: 'FISHING',
  label: 'Fishing',
  rooms: [room('FISHING_1M','FISHING','Fishing 1Min')],
  draw: { count: 1, modulus: 5 },
  buildResult: ([n]) => ({
    value:n + 1,
    label:`FISH_${n + 1}`,
  }),
  resultDigit: r => r.value,

  validateSelection(betType, selection) {
    if (betType !== 'TARGET' || !/^FISH_[1-5]$/.test(selection))
      throw new Error(`Invalid Fishing selection: ${betType}:${selection}`);
  },

  displayOdds() {
    return odds(3);
  },

  resolve(bet, result) {
    const hit = bet.betType === 'TARGET' && bet.selection === result.label;
    return outcome(bet, hit, odds(3));
  },

  describe: summary,
};
