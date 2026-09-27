export const VIRTUAL_PLATFORM_MANIFEST = Object.freeze({
  mode: 'VIRTUAL_ONLY',

  payments: {
    deposit: false,
    withdrawal: false,
    recharge: false,
    bankBinding: false,
    upi: false,
  },

  credits: {
    enabled: true,
    realMoney: false,
    currency: 'TEST',
  },

  games: [
    {
      code: 'WINGO',
      name: 'WinGo',
      periods: ['30S', '1M', '3M', '5M', '10M'],
      virtualOnly: true,
    },
    {
      code: 'K3',
      name: 'K3',
      periods: ['1M', '3M', '5M', '10M'],
      virtualOnly: true,
    },
    {
      code: 'FOUR_D',
      name: '4D',
      periods: ['1M', '5M', '10M'],
      virtualOnly: true,
    },
    {
      code: 'FIVE_D',
      name: '5D',
      periods: ['1M', '5M', '10M'],
      virtualOnly: true,
    },
    {
      code: 'CRASH',
      name: 'Crash / Aviator',
      virtualOnly: true,
    },
    {
      code: 'MINES',
      name: 'Mines',
      virtualOnly: true,
    },
    {
      code: 'PLINKO',
      name: 'Plinko',
      virtualOnly: true,
    },
    {
      code: 'LIMBO',
      name: 'Limbo',
      virtualOnly: true,
    },
    {
      code: 'DICE',
      name: 'Dice',
      virtualOnly: true,
    },
    {
      code: 'WHEEL',
      name: 'Wheel',
      virtualOnly: true,
    },
    {
      code: 'HILO',
      name: 'HiLo',
      virtualOnly: true,
    },
    {
      code: 'DRAGON_TIGER',
      name: 'Dragon Tiger',
      virtualOnly: true,
    },
    {
      code: 'ANDAR_BAHAR',
      name: 'Andar Bahar',
      virtualOnly: true,
    },
    {
      code: 'KENO',
      name: 'Keno',
      virtualOnly: true,
    },
    {
      code: 'ROULETTE',
      name: 'Roulette',
      virtualOnly: true,
    },
    {
      code: 'BLACKJACK',
      name: 'Blackjack',
      virtualOnly: true,
    },
    {
      code: 'TEEN_PATTI',
      name: 'Teen Patti',
      virtualOnly: true,
    },
    {
      code: 'SLOTS',
      name: 'Slots',
      virtualOnly: true,
    },
  ],
})
