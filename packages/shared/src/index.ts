/**
 * Shared game rules, odds and money maths.
 *
 * Imported by BOTH the API and the web client so the odds the bet panel shows
 * and the money the server actually pays out can never disagree.
 *
 * Everything here is browser-safe: no node: imports, no crypto. Turning a
 * committed seed into random values is the server's job (see the API's
 * draw.ts); each game declares only how many values it needs and how to shape
 * them into a result.
 */

export * from './core.js';
export * from './games/types.js';
export * from './games/registry.js';
export * from './games/wingo.js';
export * from './games/k3.js';
export * from './games/fived.js';
export * from './games/fourd.js';
export * from './games/motorace.js';
export * from './games/crash.js';
export * from './games/instant.js';
export * from './games/combinatorics.js';
export * from './games/plinko.js';
export * from './games/keno.js';
export * from './games/hilo.js';
export * from './games/andarbahar.js';
export * from './games/dragontiger.js';
export * from './games/wheel.js';
export * from './games/tower.js';