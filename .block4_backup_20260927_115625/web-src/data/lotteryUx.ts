export const LOTTERY_PERIODS = Object.freeze({
  WINGO: ['30S', '1M', '3M', '5M', '10M'],
  K3: ['1M', '3M', '5M', '10M'],
  FOUR_D: ['1M', '5M', '10M'],
  FIVE_D: ['1M', '5M', '10M'],
})

export const LOTTERY_VIRTUAL_NOTICE =
  'Virtual/test credits only. Real-money deposit and withdrawal are disabled.'

export function normalizePeriod(value: unknown, fallback: string) {
  const v = String(value ?? '').trim().toUpperCase()
  return v || fallback
}

export function validVirtualAmount(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n <= 1_000_000
}
