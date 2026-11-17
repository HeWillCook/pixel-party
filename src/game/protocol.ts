import type { Mode, ZoneId } from './config'
import type { RejectReason } from './rules'

export interface Placement { x: number; y: number; c: number }
export const MAX_PLACE_BATCH = 64

export type ClientMsg =
  | { t: 'place'; x: number; y: number; c: number }
  | { t: 'place'; cells: Placement[] }
  | { t: 'ask' }
  | { t: 'next' }
  | { t: 'team'; team: 'red' | 'blue' }

export interface RoundView {
  id: string
  word: string
  state: 'lobby' | 'playing' | 'intermission' | 'paused'
  startedAt: number
  endsAt: number | null
  askAvailableAt: number
  endedAt?: number
  result?: { outcome: 'won' | 'timeout' | 'teamWin'; score?: number; contributorCount?: number; winningTeam?: 'red' | 'blue' | 'draw' }
}

export interface ConnectedPlayer { userId: string; name: string }

export type ServerMsg =
  | { t: 'snapshot'; mode: Mode; width: number; height: number; cells: string; round: RoundView; you: { userId: string | null; cooldownUntil: number; team?: 'red' | 'blue' }; players: number; roster?: ConnectedPlayer[]; watching?: number; aiResting: boolean }
  | { t: 'pixel'; x: number; y: number; c: number; by: string }
  | { t: 'reject'; reason: RejectReason | 'ask_too_soon' | 'not_host' | 'canvas_unchanged'; retryAt?: number; x?: number; y?: number }
  | { t: 'round'; round: RoundView }
  | { t: 'judgement'; zone: ZoneId; guesses: string[]; confidence: number; matched: boolean }
  | { t: 'players'; count: number; roster?: ConnectedPlayer[]; watching?: number }
  | { t: 'ai_resting' }

export function parseClientMsg(raw: string): ClientMsg | null {
  if (raw.length > 4096) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('t' in value)) return null
    if (value.t === 'ask' || value.t === 'next') return { t: value.t }
    if (value.t === 'team' && 'team' in value && (value.team === 'red' || value.team === 'blue')) return { t: 'team', team: value.team }
    if (value.t === 'place' && 'cells' in value) {
      if (!Array.isArray(value.cells) || value.cells.length < 1 || value.cells.length > MAX_PLACE_BATCH || !value.cells.every(isPlacement)) return null
      return { t: 'place', cells: value.cells.map(({ x, y, c }) => ({ x, y, c })) }
    }
    if (value.t === 'place' && 'x' in value && 'y' in value && 'c' in value && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y) && typeof value.c === 'number' && Number.isFinite(value.c)) {
      return { t: 'place', x: value.x, y: value.y, c: value.c }
    }
  } catch {
    return null
  }
  return null
}

function isPlacement(value: unknown): value is Placement {
  return !!value && typeof value === 'object' && ['x', 'y', 'c'].every(key => key in value && typeof (value as Record<string, unknown>)[key] === 'number' && Number.isFinite((value as Record<string, unknown>)[key]))
}
