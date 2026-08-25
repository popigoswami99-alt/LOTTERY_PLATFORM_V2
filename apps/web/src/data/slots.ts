/**
 * Slots catalogue.
 *
 * Slots are licensed third-party content that reaches the lobby through a
 * seamless-wallet aggregator, which is not integrated in this build. This list
 * is the CATALOGUE — real titles, providers and RTP — shown so the Slots
 * category is populated like the reference. Tiles are marked "Soon" and do not
 * launch a game, because no aggregator contract backs them yet.
 */

export interface SlotGame {
  name: string;
  provider: string;
  art: string;
  rtp: number;
}

export const SLOTS: SlotGame[] = [
  { name: 'Gates of Olympus', provider: 'Pragmatic Play', art: '⚡', rtp: 96.5 },
  { name: 'Sweet Bonanza', provider: 'Pragmatic Play', art: '🍭', rtp: 96.51 },
  { name: 'Sugar Rush', provider: 'Pragmatic Play', art: '🍬', rtp: 96.5 },
  { name: 'Starlight Princess', provider: 'Pragmatic Play', art: '👑', rtp: 96.5 },
  { name: 'The Dog House', provider: 'Pragmatic Play', art: '🐕', rtp: 96.51 },
  { name: 'Wild West Gold', provider: 'Pragmatic Play', art: '🤠', rtp: 96.51 },
  { name: 'Fortune Tiger', provider: 'PG Soft', art: '🐯', rtp: 96.81 },
  { name: 'Fortune Ox', provider: 'PG Soft', art: '🐂', rtp: 96.75 },
  { name: 'Fortune Mouse', provider: 'PG Soft', art: '🐭', rtp: 96.96 },
  { name: 'Fortune Rabbit', provider: 'PG Soft', art: '🐰', rtp: 96.75 },
  { name: 'Mahjong Ways', provider: 'PG Soft', art: '🀄', rtp: 96.95 },
  { name: 'Lucky Neko', provider: 'PG Soft', art: '🐱', rtp: 96.73 },
  { name: 'Super Ace', provider: 'JILI', art: '🃏', rtp: 96.0 },
  { name: 'Golden Empire', provider: 'JILI', art: '🏯', rtp: 96.5 },
  { name: 'Money Coming', provider: 'JILI', art: '💵', rtp: 97.0 },
  { name: 'Boxing King', provider: 'JILI', art: '🥊', rtp: 96.75 },
  { name: 'Fortune Gems', provider: 'JILI', art: '💎', rtp: 97.0 },
  { name: 'Crazy 777', provider: 'JILI', art: '🎰', rtp: 96.71 },
];
