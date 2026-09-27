export const ORIGINALS_VIRTUAL_NOTICE =
  'Virtual/test credits only. Real-money deposit and withdrawal are disabled.'

export const ORIGINALS_QUICK_AMOUNTS = [10, 50, 100, 500, 1000]

export function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function safeMultiplier(value: unknown, fallback = 1) {
  const n = safeNumber(value, fallback)
  return n > 0 ? n : fallback
}

export function potentialReturn(amount: unknown, multiplier: unknown) {
  const a = safeNumber(amount)
  const m = safeMultiplier(multiplier)
  return Math.max(0, a * m)
}
