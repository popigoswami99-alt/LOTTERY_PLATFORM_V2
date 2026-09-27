import type { RoomConfig } from '../core.js';
import type { GameRules } from './types.js';
import { GAME_CODE_WINGO, wingoRules } from './wingo.js';
import { GAME_CODE_K3, k3Rules } from './k3.js';
import { GAME_CODE_5D, fiveDRules } from './fived.js';
import { GAME_CODE_4D, fourDRules } from './fourd.js';

/**
 * The engine registry.
 *
 * Adding a game is: write a rules module, add one line here. The scheduler,
 * period service, bet placement, settlement and socket layer all read from
 * this registry and need no per-game changes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAMES: Record<string, GameRules<any>> = {
  [GAME_CODE_WINGO]: wingoRules,
  [GAME_CODE_K3]: k3Rules,
  [GAME_CODE_5D]: fiveDRules,
  [GAME_CODE_4D]: fourDRules,
};

export const GAME_CODES = Object.keys(GAMES);

/** Every room across every registered game — what the scheduler iterates. */
export const ALL_ROOMS: RoomConfig[] = Object.values(GAMES).flatMap((g) => g.rooms);

export const ROOM_BY_KEY: Record<string, RoomConfig> = Object.fromEntries(
  ALL_ROOMS.map((r) => [r.key, r]),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rulesFor(gameCode: string): GameRules<any> | undefined {
  return GAMES[gameCode];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rulesForRoom(roomKey: string): GameRules<any> | undefined {
  const room = ROOM_BY_KEY[roomKey];
  return room ? GAMES[room.gameCode] : undefined;
}

export function roomsOf(gameCode: string): RoomConfig[] {
  return GAMES[gameCode]?.rooms ?? [];
}
