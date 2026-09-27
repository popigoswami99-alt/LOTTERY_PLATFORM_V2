import { ORIGINALS_GAME_CONFIG } from './originalsGameConfig'

export const ALL_VIRTUAL_GAMES = Object.freeze([
  ...ORIGINALS_GAME_CONFIG,

  {
    code: 'WINGO',
    name: 'WinGo',
    category: 'Lottery',
    virtualOnly: true,
  },
  {
    code: 'K3',
    name: 'K3',
    category: 'Lottery',
    virtualOnly: true,
  },
  {
    code: 'FOUR_D',
    name: '4D',
    category: 'Lottery',
    virtualOnly: true,
  },
  {
    code: 'FIVE_D',
    name: '5D',
    category: 'Lottery',
    virtualOnly: true,
  },
] as const)
