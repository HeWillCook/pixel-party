import { useCallback, useEffect, useState } from 'react'
import { getAuthToken } from 'deepspace'
import type { PlayerStats } from '../../game/stats'

export type PlayerStatsStatus = 'loading' | 'ready' | 'error' | 'signed-out'

export interface PlayerStatsState {
  status: PlayerStatsStatus
  stats: PlayerStats | null
  retry: () => void
}

const LOAD_TIMEOUT_MS = 10_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPlayerStats(value: unknown): value is PlayerStats {
  if (!isRecord(value) || typeof value.userId !== 'string') return false
  return isRecord(value.daily) && isRecord(value.daily.medals) && isRecord(value.party)
}

/**
 * Reads `GET /api/stats/:userId`. Each attempt is a fresh fetch (the route is not a live query),
 * and a load that never answers becomes the error state rather than "Reading…" for ever.
 */
export function usePlayerStats(userId: string): PlayerStatsState {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ status: PlayerStatsStatus; stats: PlayerStats | null }>({
    status: userId ? 'loading' : 'error',
    stats: null,
  })
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    if (!userId) {
      setState({ status: 'error', stats: null })
      return
    }
    const controller = new AbortController()
    let live = true
    setState({ status: 'loading', stats: null })
    const timer = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS)

    void (async () => {
      try {
        const token = await getAuthToken()
        if (!token) {
          if (live) setState({ status: 'signed-out', stats: null })
          return
        }
        const response = await fetch(`/api/stats/${encodeURIComponent(userId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (response.status === 401) {
          if (live) setState({ status: 'signed-out', stats: null })
          return
        }
        if (!response.ok) throw new Error(`Stats request failed: ${response.status}`)
        const body: unknown = await response.json()
        const stats = isRecord(body) ? body.stats : null
        if (!isPlayerStats(stats)) throw new Error('Malformed stats response')
        if (live) setState({ status: 'ready', stats })
      } catch {
        if (live) setState({ status: 'error', stats: null })
      } finally {
        window.clearTimeout(timer)
      }
    })()

    return () => {
      live = false
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [userId, attempt])

  return { ...state, retry }
}
