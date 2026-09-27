export type OriginalsGameConfig = {
  code: string
  name: string
  category: string
  virtualOnly: true
  controls: string[]
}

export const ORIGINALS_GAME_CONFIG: OriginalsGameConfig[] = [
  {
    code: 'CRASH',
    name: 'Crash / Aviator',
    category: 'Originals',
    virtualOnly: true,
    controls: ['BET', 'AUTO_CASHOUT', 'CASHOUT', 'HISTORY'],
  },
  {
    code: 'MINES',
    name: 'Mines',
    category: 'Originals',
    virtualOnly: true,
    controls: ['MINES', 'BET', 'REVEAL', 'CASHOUT'],
  },
  {
    code: 'PLINKO',
    name: 'Plinko',
    category: 'Originals',
    virtualOnly: true,
    controls: ['RISK', 'ROWS', 'BET', 'DROP'],
  },
  {
    code: 'LIMBO',
    name: 'Limbo',
    category: 'Originals',
    virtualOnly: true,
    controls: ['TARGET', 'BET', 'PLAY'],
  },
  {
    code: 'DICE',
    name: 'Dice',
    category: 'Originals',
    virtualOnly: true,
    controls: ['OVER_UNDER', 'CHANCE', 'BET', 'ROLL'],
  },
  {
    code: 'WHEEL',
    name: 'Wheel',
    category: 'Originals',
    virtualOnly: true,
    controls: ['RISK', 'BET', 'SPIN', 'HISTORY'],
  },
  {
    code: 'HILO',
    name: 'HiLo',
    category: 'Originals',
    virtualOnly: true,
    controls: ['HIGHER', 'LOWER', 'SAME', 'BET'],
  },
  {
    code: 'ROULETTE',
    name: 'Roulette',
    category: 'Casino',
    virtualOnly: true,
    controls: ['RED', 'BLACK', 'ODD', 'EVEN', 'NUMBER'],
  },
  {
    code: 'BLACKJACK',
    name: 'Blackjack',
    category: 'Casino',
    virtualOnly: true,
    controls: ['HIT', 'STAND', 'DOUBLE', 'BET'],
  },
  {
    code: 'TEEN_PATTI',
    name: 'Teen Patti',
    category: 'Casino',
    virtualOnly: true,
    controls: ['PLAYER', 'TIE', 'BANKER', 'BET'],
  },
  {
    code: 'DRAGON_TIGER',
    name: 'Dragon Tiger',
    category: 'Casino',
    virtualOnly: true,
    controls: ['DRAGON', 'TIGER', 'TIE', 'BET'],
  },
  {
    code: 'ANDAR_BAHAR',
    name: 'Andar Bahar',
    category: 'Casino',
    virtualOnly: true,
    controls: ['ANDAR', 'BAHAR', 'BET'],
  },
  {
    code: 'SLOTS',
    name: 'Slots',
    category: 'Slots',
    virtualOnly: true,
    controls: ['BET', 'SPIN', 'AUTOPLAY', 'HISTORY'],
  },
  {
    code: 'KENO',
    name: 'Keno',
    category: 'Lottery',
    virtualOnly: true,
    controls: ['NUMBERS', 'BET', 'DRAW', 'HISTORY'],
  },
]
