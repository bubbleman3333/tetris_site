// 戦績 API（minna_api / Cloudflare Workers + D1）のクライアント。

const BASE = import.meta.env.VITE_API_BASE ?? 'https://minna-api.rakunowa.workers.dev'

export interface WorldStats {
  games: number
  kills: number
  kill_rate: number
  fastest: { seconds: number; name: string | null } | null
  longest_seconds: number
}

export interface HallEntry {
  name: string | null
  seconds: number
  garbage: number
  lines: number
  created_at: string
}

export interface ResultPayload {
  killed: boolean
  seconds: number
  garbage: number
  lines: number
  name?: string
  /** bot よけ（人が触らない入力欄。値が入っていたら無視される） */
  website?: string
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} が取れません（${res.status}）`)
  return (await res.json()) as T
}

export const fetchStats = (): Promise<WorldStats> => getJson<WorldStats>('/v1/tetris/stats')

export const fetchHall = (): Promise<{ entries: HallEntry[] }> =>
  getJson<{ entries: HallEntry[] }>('/v1/tetris/hall')

export async function postResult(payload: ResultPayload): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(BASE + '/v1/tetris/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'minna' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: (data as { error?: string }).error ?? `送信に失敗しました（${res.status}）` }
  return { ok: true }
}
