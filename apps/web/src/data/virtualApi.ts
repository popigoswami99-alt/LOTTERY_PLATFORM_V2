const API_BASE =
  (import.meta as any).env?.VITE_API_URL ||
  'http://127.0.0.1:4000'

function token() {
  return (
    localStorage.getItem('accessToken') ||
    localStorage.getItem('access_token') ||
    localStorage.getItem('token') ||
    ''
  )
}

async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {})

  headers.set('Content-Type', 'application/json')

  const t = token()
  if (t) headers.set('Authorization', `Bearer ${t}`)

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  const text = await response.text()

  let data: any = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error ||
      `HTTP ${response.status}`
    )
  }

  return data
}

export const virtualApi = {
  health() {
    return request('/health')
  },

  games() {
    return request('/api/games')
  },

  rooms(gameCode: string) {
    return request(
      `/api/games/${encodeURIComponent(gameCode)}/rooms`
    )
  },

  roomState(roomKey: string) {
    return request(
      `/api/rooms/${encodeURIComponent(roomKey)}/state`
    )
  },

  results(roomKey: string) {
    return request(
      `/api/rooms/${encodeURIComponent(roomKey)}/results`
    )
  },

  myBets(roomKey: string) {
    return request(
      `/api/rooms/${encodeURIComponent(roomKey)}/my-bets`
    )
  },

  placeBet(
    roomKey: string,
    payload: {
      betType: string
      selection: string
      unitAmount: number
      multiplier: number
    }
  ) {
    return request(
      `/api/rooms/${encodeURIComponent(roomKey)}/bet`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    )
  },

  virtualBalance() {
    return request('/api/virtual/balance')
  },

  virtualLedger(limit = 50) {
    return request(
      `/api/virtual/ledger?limit=${encodeURIComponent(limit)}`
    )
  },

  virtualCredit(amount: number, reason = 'demo_credit') {
    return request('/api/virtual/credit', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        reason,
      }),
    })
  },
}
