import type { Mode, ZoneId } from './config'
import type { RejectReason } from './rules'

export type ClientMsg =
  | { t: 'place'; x: number; y: number; c: number }
  | { t: 'ask' }
  | { t: 'next' }
  | { t: 'team'; team: 'red' | 'blue' }

export interface RoundView {
  id: string
  word: string
  state: 'playing' | 'intermission' | 'paused'
  startedAt: number
  endsAt: number | null
  askAvailableAt: number
  endedAt?: number
  result?: { outcome: 'won' | 'timeout' | 'teamWin'; score?: number; winningTeam?: 'red' | 'blue' | 'draw' }
}

export type ServerMsg =
  | { t: 'snapshot'; mode: Mode; width: number; height: number; cells: string; round: RoundView; you: { userId: string | null; cooldownUntil: number; team?: 'red' | 'blue' }; players: number; aiResting: boolean }
  | { t: 'pixel'; x: number; y: number; c: number; by: string }
  | { t: 'reject'; reason: RejectReason | 'ask_too_soon' | 'not_host' | 'canvas_unchanged'; retryAt?: number }
  | { t: 'round'; round: RoundView }
  | { t: 'judgement'; zone: ZoneId; guesses: string[]; confidence: number; matched: boolean }
  | { t: 'players'; count: number }
  | { t: 'ai_resting' }

export function parseClientMsg(raw: string): ClientMsg | null {
  if (raw.length > 256) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('t' in value)) return null
    if (value.t === 'ask' || value.t === 'next') return { t: value.t }
    if (value.t === 'team' && 'team' in value && (value.team === 'red' || value.team === 'blue')) return { t: 'team', team: value.team }
    if (value.t === 'place' && 'x' in value && 'y' in value && 'c' in value && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y) && typeof value.c === 'number' && Number.isFinite(value.c)) {
      return { t: 'place', x: value.x, y: value.y, c: value.c }
    }
  } catch {
    return null
  }
  return null
}
