import { MODES, type Mode, type ZoneId } from './config'
import { decodeCells } from './grid'
import type { RoundView, ServerMsg } from './protocol'
import { cooldownMs } from './rules'

export type SnapshotYou = Extract<ServerMsg, { t: 'snapshot' }>['you']
export type RejectMsg = Extract<ServerMsg, { t: 'reject' }>

export interface ZoneGuess {
  guesses: string[]
  confidence: number
  matched: boolean
}

export interface ClientState {
  connected: boolean
  snapshotLoaded: boolean
  mode: Mode
  width: number
  height: number
  cells: Uint8Array
  pending: Map<number, number>
  round: RoundView | null
  guesses: Record<ZoneId, ZoneGuess | undefined>
  players: number
  you: SnapshotYou
  aiResting: boolean
  lastReject: RejectMsg | null
}

export function initialClientState(): ClientState {
  const { width, height } = MODES.coop
  return {
    connected: false,
    snapshotLoaded: false,
    mode: 'coop',
    width,
    height,
    cells: new Uint8Array(width * height),
    pending: new Map<number, number>(),
    round: null,
    guesses: {} as Record<ZoneId, ZoneGuess | undefined>,
    players: 0,
    you: { userId: null, cooldownUntil: 0 },
    aiResting: false,
    lastReject: null,
  }
}

export function applyOptimisticPlace(
  s: ClientState,
  x: number,
  y: number,
  c: number,
): ClientState {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return s
  if (x < 0 || x >= s.width || y < 0 || y >= s.height) return s
  const idx = y * s.width + x
  const cells = s.cells.slice()
  const pending = new Map(s.pending)
  if (!pending.has(idx)) {
    pending.set(idx, s.cells[idx])
  }
  cells[idx] = c
  return {
    ...s,
    cells,
    pending,
    lastReject: null,
  }
}

export function applyServerMsg(s: ClientState, m: ServerMsg): ClientState {
  switch (m.t) {
    case 'snapshot': {
      const cells = decodeCells(m.cells, m.width * m.height)
      const isNewRound = !s.round || s.round.id !== m.round.id
      return {
        ...s,
        snapshotLoaded: true,
        mode: m.mode,
        width: m.width,
        height: m.height,
        cells,
        pending: new Map<number, number>(),
        round: m.round,
        guesses: isNewRound
          ? ({} as Record<ZoneId, ZoneGuess | undefined>)
          : s.guesses,
        players: m.players,
        you: m.you,
        aiResting: m.aiResting,
        lastReject: null,
      }
    }
    case 'pixel': {
      if (m.x < 0 || m.x >= s.width || m.y < 0 || m.y >= s.height) return s
      const idx = m.y * s.width + m.x
      const cells = s.cells.slice()
      cells[idx] = m.c
      const pending = new Map(s.pending)
      if (m.by === s.you.userId && pending.has(idx)) {
        pending.delete(idx)
      }
      const you =
        m.by === s.you.userId
          ? {
              ...s.you,
              cooldownUntil: Math.max(
                s.you.cooldownUntil,
                Date.now() + cooldownMs(Math.max(1, s.players)),
              ),
            }
          : s.you
      return {
        ...s,
        cells,
        pending,
        you,
      }
    }
    case 'reject': {
      const cells = s.cells.slice()
      const isPlacementReject =
        m.reason === 'not_signed_in' ||
        m.reason === 'round_inactive' ||
        m.reason === 'out_of_bounds' ||
        m.reason === 'bad_color' ||
        m.reason === 'cooldown'

      const pending = new Map(s.pending)
      if (isPlacementReject && pending.size > 0) {
        for (const [idx, prevColor] of pending.entries()) {
          cells[idx] = prevColor
        }
        pending.clear()
      }

      const you =
        m.reason === 'cooldown' && m.retryAt !== undefined
          ? { ...s.you, cooldownUntil: m.retryAt }
          : s.you

      const round =
        m.reason === 'ask_too_soon' && m.retryAt !== undefined && s.round
          ? {
              ...s.round,
              askAvailableAt: Math.max(s.round.askAvailableAt, m.retryAt),
            }
          : s.round

      return {
        ...s,
        cells,
        pending,
        you,
        round,
        lastReject: m,
      }
    }
    case 'round': {
      const isNewRound = !s.round || s.round.id !== m.round.id
      return {
        ...s,
        round: m.round,
        guesses: isNewRound
          ? ({} as Record<ZoneId, ZoneGuess | undefined>)
          : s.guesses,
      }
    }
    case 'judgement': {
      return {
        ...s,
        guesses: {
          ...s.guesses,
          [m.zone]: {
            guesses: m.guesses,
            confidence: m.confidence,
            matched: m.matched,
          },
        },
      }
    }
    case 'players': {
      return {
        ...s,
        players: m.count,
      }
    }
    case 'ai_resting': {
      return {
        ...s,
        aiResting: true,
      }
    }
  }
}
