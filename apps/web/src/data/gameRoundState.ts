export type GameRoundState = {
  roundId: string
  status: 'OPEN' | 'LOCKED' | 'RUNNING' | 'SETTLED'
  result?: string | number
  multiplier?: number
  serverSeedHash?: string
  serverSeed?: string
  clientSeed?: string
  nonce?: number
  createdAt?: string
}

export type VirtualBetRecord = {
  id: string
  roundId: string
  gameCode: string
  selection?: string
  amount: number
  multiplier?: number
  status: 'PENDING' | 'WON' | 'LOST' | 'CANCELLED'
  payout?: number
  createdAt: string
}
