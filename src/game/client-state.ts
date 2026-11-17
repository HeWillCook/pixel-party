import { MODES, type Mode, type ZoneId } from './config'
import { decodeCells } from './grid'
import type { RoundView, ServerMsg } from './protocol'
import { cooldownMs } from './rules'

export type SnapshotYou = Extract<ServerMsg, { t: 'snapshot' }>['you']
export type RejectMsg = Extract<ServerMsg, { t: 'reject' }>
export type ConnectError = 'unauthorized' | 'not_found' | 'closed'

export interface ZoneGuess {
  guesses: string[]
  confidence: number
  matched: boolean
}

export interface GuessLogEntry {
  id: number
  atMs: number
  guesses: string[]
  matched: boolean
}

export interface ClientState {
  connected: boolean
  snapshotLoaded: boolean
  connectError: ConnectError | null
  mode: Mode
  width: number
  height: number
  cells: Uint8Array
  pending: Map<number, number>
  round: RoundView | null
  guesses: Record<ZoneId, ZoneGuess | undefined>
  guessLog: GuessLogEntry[]
  guessLogRoundId: string | null
  roster: { userId: string; name: string }[]
  players: number
  watching: number
  you: SnapshotYou
  aiResting: boolean
  lastReject: RejectMsg | null
}

export function initialClientState(): ClientState {
  const { width, height } = MODES.coop
  return {
    connected: false,
    snapshotLoaded: false,
    connectError: null,
    mode: 'coop',
    width,
    height,
    cells: new Uint8Array(width * height),
    pending: new Map<number, number>(),
    round: null,
    guesses: {} as Record<ZoneId, ZoneGuess | undefined>,
    guessLog: [],
    guessLogRoundId: null,
    players: 0,
    watching: 0,
    roster: [],
    you: { userId: null, cooldownUntil: 0 },
    aiResting: false,
    lastReject: null,
  }
}

export function statusToConnectError(status: number): ConnectError | null {
  if (status === 401) return 'unauthorized'
  if (status === 404) return 'not_found'
  if (status === 410) return 'closed'
  return null
}

export function applyConnectError(
  s: ClientState,
  error: ConnectError | null,
): ClientState {
  return {
    ...s,
    connected: false,
    connectError: error,
  }
}

export function clearLastReject(s: ClientState): ClientState {
  if (!s.lastReject) return s
  return {
    ...s,
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

export function applyServerMsg(s: ClientState, m: ServerMsg, now: number = Date.now()): ClientState {
  switch (m.t) {
    case 'snapshot': {
      const cells = decodeCells(m.cells, m.width * m.height)
      const isNewRound = !s.round || s.round.id !== m.round.id
      return {
        ...s,
        snapshotLoaded: true,
        connectError: null,
        mode: m.mode,
        width: m.width,
        height: m.height,
        cells,
        pending: new Map<number, number>(),
        round: m.round,
        guessLog: m.round.id === s.guessLogRoundId ? s.guessLog : [],
        guessLogRoundId: m.round.id,
        guesses: isNewRound
          ? ({} as Record<ZoneId, ZoneGuess | undefined>)
          : s.guesses,
        players: m.players,
        watching: m.watching ?? 0,
        roster: m.roster ?? [],
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
      // M4: Any authoritative pixel (from self or another player) resolves/supersedes the pending entry for that cell
      if (pending.has(idx)) {
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
        m.reason === 'cooldown' ||
        m.reason === 'rate_limited'

      const pending = new Map(s.pending)
      if (isPlacementReject && pending.size > 0) {
        // Batches identify the rejected cell; retain FIFO compatibility with older servers.
        const idx = m.x === undefined || m.y === undefined ? undefined : m.y * s.width + m.x
        const firstEntry = idx === undefined
          ? pending.entries().next().value as [number, number] | undefined
          : pending.has(idx) ? [idx, pending.get(idx)!] : undefined
        if (firstEntry) {
          const [idx, prevColor] = firstEntry
          cells[idx] = prevColor
          pending.delete(idx)
        }
      }

      const you =
        (m.reason === 'cooldown' || m.reason === 'rate_limited') && m.retryAt !== undefined
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
        guessLog: m.round.id === s.guessLogRoundId ? s.guessLog : [],
        guessLogRoundId: m.round.id,
        guesses: isNewRound
          ? ({} as Record<ZoneId, ZoneGuess | undefined>)
          : s.guesses,
      }
    }
    case 'judgement': {
      const loggedGuesses = new Set(s.guessLog.flatMap(entry => entry.guesses.map(guess => guess.trim().toLowerCase())))
      const hasNewGuess = m.guesses.some(guess => !loggedGuesses.has(guess.trim().toLowerCase()))
      const hasNewMatch = m.matched && !s.guessLog.some(entry => entry.matched)
      const guessLog = hasNewGuess || hasNewMatch
        ? [{
            id: (s.guessLog[0]?.id ?? 0) + 1,
            atMs: s.round ? Math.max(0, now - s.round.startedAt) : 0,
            guesses: m.guesses,
            matched: m.matched,
          }, ...s.guessLog].slice(0, 50)
        : s.guessLog
      return {
        ...s,
        guessLog,
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
        watching: m.watching ?? 0,
        roster: m.roster ?? s.roster,
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

/** A socket opening is not authorization; only its first snapshot unlocks room UI. */
export function roomAccessView(state: ClientState): 'loading' | 'room' | ConnectError {
  return state.connectError ?? (state.snapshotLoaded ? 'room' : 'loading')
}
