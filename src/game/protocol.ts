import type { Mode, ZoneId } from './config'
import type { RejectReason } from './rules'

export interface Placement { x: number; y: number; c: number; id?: number }
export const MAX_PLACE_BATCH = 64

export type ClientMsg =
  | { t: 'place'; x: number; y: number; c: number; id?: number }
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
  | { t: 'closed' }
  | { t: 'snapshot'; mode: Mode; width: number; height: number; cells: string; round: RoundView; you: { userId: string | null; cooldownUntil: number; team?: 'red' | 'blue' }; players: number; roster?: ConnectedPlayer[]; watching?: number; aiResting: boolean }
  | { t: 'pixel'; x: number; y: number; c: number; by: string }
  | { t: 'noop'; x: number; y: number; id?: number }
  | { t: 'reject'; reason: RejectReason | 'ask_too_soon' | 'not_host' | 'canvas_unchanged' | 'canvas_blank'; retryAt?: number; x?: number; y?: number; id?: number }
  | { t: 'round'; round: RoundView }
  | { t: 'judgement'; zone: ZoneId; guesses: string[]; confidence: number; matched: boolean }
  | { t: 'players'; count: number; roster?: ConnectedPlayer[]; watching?: number }
  | { t: 'ai_resting' }

const SERVER_MSG_TYPES = new Set([
  'closed',
  'snapshot',
  'pixel',
  'noop',
  'reject',
  'round',
  'judgement',
  'players',
  'ai_resting',
])

const REJECT_REASONS = new Set<string>([
  'not_signed_in',
  'round_inactive',
  'out_of_bounds',
  'bad_color',
  'cooldown',
  'rate_limited',
  'ask_too_soon',
  'not_host',
  'canvas_unchanged',
  'canvas_blank',
])

function isValidPlacementId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function parseServerMsg(raw: string): ServerMsg | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('t' in value) || typeof value.t !== 'string') return null
    if (!SERVER_MSG_TYPES.has(value.t)) return null
    if (value.t === 'noop') {
      if (
        !('x' in value) ||
        !('y' in value) ||
        typeof value.x !== 'number' ||
        !Number.isInteger(value.x) ||
        typeof value.y !== 'number' ||
        !Number.isInteger(value.y)
      ) {
        return null
      }
      if ('id' in value && value.id !== undefined) {
        if (!isValidPlacementId(value.id)) return null
        return { t: 'noop', x: value.x, y: value.y, id: value.id }
      }
      return { t: 'noop', x: value.x, y: value.y }
    }
    if (value.t === 'reject') {
      if (!('reason' in value) || typeof value.reason !== 'string' || !REJECT_REASONS.has(value.reason)) {
        return null
      }
      const msg: Extract<ServerMsg, { t: 'reject' }> = {
        t: 'reject',
        reason: value.reason as Extract<ServerMsg, { t: 'reject' }>['reason'],
      }
      if ('retryAt' in value && value.retryAt !== undefined) {
        if (typeof value.retryAt !== 'number' || !Number.isFinite(value.retryAt)) return null
        msg.retryAt = value.retryAt
      }
      if ('x' in value && value.x !== undefined) {
        if (typeof value.x !== 'number' || !Number.isInteger(value.x)) return null
        msg.x = value.x
      }
      if ('y' in value && value.y !== undefined) {
        if (typeof value.y !== 'number' || !Number.isInteger(value.y)) return null
        msg.y = value.y
      }
      if ('id' in value && value.id !== undefined) {
        if (!isValidPlacementId(value.id)) return null
        msg.id = value.id
      }
      return msg
    }
    return value as ServerMsg
  } catch {
    return null
  }
}

export function parseClientMsg(raw: string): ClientMsg | null {
  if (raw.length > 4096) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('t' in value)) return null
    if (value.t === 'ask' || value.t === 'next') return { t: value.t }
    if (value.t === 'team' && 'team' in value && (value.team === 'red' || value.team === 'blue')) return { t: 'team', team: value.team }
    if (value.t === 'place' && 'cells' in value) {
      if (!Array.isArray(value.cells) || value.cells.length < 1 || value.cells.length > MAX_PLACE_BATCH || !value.cells.every(isPlacement)) return null
      return {
        t: 'place',
        cells: value.cells.map(({ x, y, c, id }) => (id === undefined ? { x, y, c } : { x, y, c, id })),
      }
    }
    if (
      value.t === 'place' &&
      'x' in value &&
      'y' in value &&
      'c' in value &&
      typeof value.x === 'number' &&
      Number.isFinite(value.x) &&
      typeof value.y === 'number' &&
      Number.isFinite(value.y) &&
      typeof value.c === 'number' &&
      Number.isFinite(value.c)
    ) {
      if ('id' in value && value.id !== undefined) {
        if (!isValidPlacementId(value.id)) return null
        return { t: 'place', x: value.x, y: value.y, c: value.c, id: value.id }
      }
      return { t: 'place', x: value.x, y: value.y, c: value.c }
    }
  } catch {
    return null
  }
  return null
}

function isPlacement(value: unknown): value is Placement {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (!['x', 'y', 'c'].every(key => key in record && typeof record[key] === 'number' && Number.isFinite(record[key]))) {
    return false
  }
  if ('id' in record && record.id !== undefined && !isValidPlacementId(record.id)) {
    return false
  }
  return true
}
