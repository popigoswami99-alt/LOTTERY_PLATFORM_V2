export type LotterySelection = {
  value: string
  label?: string
  multiplier?: number
  type?: string
}

export type LotteryGameConfig = {
  code: string
  name: string
  periods: string[]
  selections: LotterySelection[]
  quickAmounts: number[]
  virtualOnly: true
}

const digits = Array.from({ length: 10 }, (_, i) => ({
  value: String(i),
  label: String(i),
  multiplier: 9,
  type: 'number',
}))

export const LOTTERY_GAME_CONFIG: Record<string, LotteryGameConfig> = {
  WINGO: {
    code: 'WINGO',
    name: 'WinGo',
    periods: ['30S', '1M', '3M', '5M', '10M'],
    selections: [
      ...digits,
      { value: 'RED', label: 'Red', multiplier: 2, type: 'color' },
      { value: 'GREEN', label: 'Green', multiplier: 2, type: 'color' },
      { value: 'VIOLET', label: 'Violet', multiplier: 4.5, type: 'color' },
      { value: 'BIG', label: 'Big', multiplier: 2, type: 'size' },
      { value: 'SMALL', label: 'Small', multiplier: 2, type: 'size' },
      { value: 'ODD', label: 'Odd', multiplier: 2, type: 'parity' },
      { value: 'EVEN', label: 'Even', multiplier: 2, type: 'parity' },
    ],
    quickAmounts: [10, 50, 100, 500, 1000],
    virtualOnly: true,
  },

  K3: {
    code: 'K3',
    name: 'K3',
    periods: ['1M', '3M', '5M', '10M'],
    selections: [
      { value: 'BIG', label: 'Big', multiplier: 2 },
      { value: 'SMALL', label: 'Small', multiplier: 2 },
      { value: 'ODD', label: 'Odd', multiplier: 2 },
      { value: 'EVEN', label: 'Even', multiplier: 2 },
      { value: 'SUM', label: 'Sum', multiplier: 6 },
      { value: 'DOUBLE', label: 'Double', multiplier: 10 },
      { value: 'TRIPLE', label: 'Triple', multiplier: 30 },
    ],
    quickAmounts: [10, 50, 100, 500, 1000],
    virtualOnly: true,
  },

  FOUR_D: {
    code: 'FOUR_D',
    name: '4D',
    periods: ['1M', '5M', '10M'],
    selections: digits,
    quickAmounts: [10, 50, 100, 500],
    virtualOnly: true,
  },

  FIVE_D: {
    code: 'FIVE_D',
    name: '5D',
    periods: ['1M', '5M', '10M'],
    selections: digits,
    quickAmounts: [10, 50, 100, 500],
    virtualOnly: true,
  },
}
