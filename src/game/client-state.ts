import { MODES, type Mode, type ZoneId } from './config'
import { decodeCells } from './grid'
import type { RoundView, ServerMsg } from './protocol'

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
  /** Haiku saw letters, words or numbers: the guess is shown as a playful "no spelling" notice, never as a match. */
  text?: boolean
}

export interface ClientState {
  connected: boolean
  snapshotLoaded: boolean
  snapshotSeq: number
  connectError: ConnectError | null
  closedByHost: boolean
  mode: Mode
  width: number
  height: number
  cells: Uint8Array
  pending: Map<number, number>
  pendingIds: Map<number, number>
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
    snapshotSeq: 0,
    connectError: null,
    closedByHost: false,
    mode: 'coop',
    width,
    height,
    cells: new Uint8Array(width * height),
    pending: new Map<number, number>(),
    pendingIds: new Map<number, number>(),
    round: null,
    guesses: {} as Record<ZoneId, ZoneGuess | undefined>,
    guessLog: [],
    guessLogRoundId: null,
    players: 0,
    watching: 0,
    roster: [],
    you: { userId: null },
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
  options?: { id?: number },
): ClientState {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return s
  if (x < 0 || x >= s.width || y < 0 || y >= s.height) return s
  const idx = y * s.width + x
  const cells = s.cells.slice()
  const pending = new Map(s.pending)
  const pendingIds = new Map(s.pendingIds)
  if (!pending.has(idx)) {
    pending.set(idx, s.cells[idx])
  }
  if (options?.id !== undefined) {
    pendingIds.set(idx, options.id)
  } else {
    pendingIds.delete(idx)
  }
  cells[idx] = c
  return {
    ...s,
    cells,
    pending,
    pendingIds,
    lastReject: null,
  }
}

export function applyServerMsg(s: ClientState, m: ServerMsg, now: number = Date.now()): ClientState {
  switch (m.t) {
    case 'closed': return { ...applyConnectError(initialClientState(), 'closed'), closedByHost: true }
    case 'snapshot': {
      const cells = decodeCells(m.cells, m.width * m.height)
      const isNewRound = !s.round || s.round.id !== m.round.id
      const loaded: ClientState = {
        ...s,
        snapshotLoaded: true,
        snapshotSeq: s.snapshotSeq + 1,
        connectError: null,
        mode: m.mode,
        width: m.width,
        height: m.height,
        cells,
        pending: new Map<number, number>(),
        pendingIds: new Map<number, number>(),
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
      // Joining or reloading mid-round: Haiku's recent judgements arrive with the snapshot, so the feed is not blank.
      // A reconnect that already holds this round's log keeps it.
      if (loaded.guessLog.length > 0 || !m.judgements?.length) return loaded
      return m.judgements.reduce((acc, j) => logJudgement(acc, j, j.at), loaded)
    }
    case 'pixel': {
      if (m.x < 0 || m.x >= s.width || m.y < 0 || m.y >= s.height) return s
      const idx = m.y * s.width + m.x
      const cells = s.cells.slice()
      cells[idx] = m.c
      const pending = new Map(s.pending)
      const pendingIds = new Map(s.pendingIds)
      // M4: Any authoritative pixel (from self or another player) resolves/supersedes the pending entry for that cell
      if (pending.has(idx)) {
        pending.delete(idx)
        pendingIds.delete(idx)
      }
      return {
        ...s,
        cells,
        pending,
        pendingIds,
      }
    }
    case 'noop': {
      if (m.x < 0 || m.x >= s.width || m.y < 0 || m.y >= s.height) return s
      const idx = m.y * s.width + m.x
      // A no-op only settles a placement we sent for that cell; a stale id changes nothing.
      const matchesPending = s.pending.has(idx) && s.pendingIds.get(idx) === m.id
      if (!matchesPending) return s
      const pending = new Map(s.pending)
      pending.delete(idx)
      const pendingIds = new Map(s.pendingIds)
      pendingIds.delete(idx)
      let cells = s.cells
      if (s.cells[idx] !== 0) {
        cells = s.cells.slice()
        cells[idx] = 0
      }
      return {
        ...s,
        cells,
        pending,
        pendingIds,
      }
    }
    case 'reject': {
      const cells = s.cells.slice()
      const isPlacementReject =
        m.reason === 'not_signed_in' ||
        m.reason === 'round_inactive' ||
        m.reason === 'out_of_bounds' ||
        m.reason === 'bad_color' ||
        m.reason === 'rate_limited'

      const pending = new Map(s.pending)
      const pendingIds = new Map(s.pendingIds)
      if (isPlacementReject && pending.size > 0) {
        // Batches identify the rejected cell; retain FIFO compatibility with older servers.
        const idx = m.x === undefined || m.y === undefined ? undefined : m.y * s.width + m.x
        let entry: [number, number] | undefined
        if (m.id !== undefined) {
          if (idx !== undefined) {
            if (pending.has(idx) && pendingIds.get(idx) === m.id) {
              entry = [idx, pending.get(idx)!]
            }
          } else {
            for (const [pendingIdx, pendingId] of pendingIds.entries()) {
              if (pendingId === m.id && pending.has(pendingIdx)) {
                entry = [pendingIdx, pending.get(pendingIdx)!]
                break
              }
            }
          }
        } else {
          entry = idx === undefined
            ? pending.entries().next().value as [number, number] | undefined
            : pending.has(idx) ? [idx, pending.get(idx)!] : undefined
        }
        if (entry) {
          const [entryIdx, prevColor] = entry
          cells[entryIdx] = prevColor
          pending.delete(entryIdx)
          pendingIds.delete(entryIdx)
        }
      }

      const round =
        m.reason === 'ask_too_soon' && m.retryAt !== undefined && s.round
          ? {
              ...s.round,
              askAvailableAt: Math.max(s.round.askAvailableAt, m.retryAt),
            }
          : s.round

      // Pace limits are part of a drag, not an error: the cell is rolled back, the stroke carries on.
      return {
        ...s,
        cells,
        pending,
        pendingIds,
        round,
        lastReject: m.reason === 'rate_limited' ? s.lastReject : m,
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
    case 'judgement': return logJudgement(s, m, now)
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

/** Adds one of Haiku's judgements to the feed (and the latest-guess slot); `at` is when it was made. */
function logJudgement(
  s: ClientState,
  m: { zone: ZoneId; guesses: string[]; confidence: number; matched: boolean; text?: boolean },
  at: number,
): ClientState {
  const loggedGuesses = new Set(s.guessLog.flatMap(entry => entry.guesses.map(guess => guess.trim().toLowerCase())))
  const hasNewGuess = m.guesses.some(guess => !loggedGuesses.has(guess.trim().toLowerCase()))
  // A spelling notice is its own line even when Haiku's guesses repeat the ones already in the feed.
  const hasNewSpelling = Boolean(m.text) && !s.guessLog.some(entry => entry.text)
  const hasNewMatch = m.matched && !s.guessLog.some(entry => entry.matched)
  const guessLog = hasNewGuess || hasNewSpelling || hasNewMatch
    ? [{
        id: (s.guessLog[0]?.id ?? 0) + 1,
        atMs: s.round ? Math.max(0, at - s.round.startedAt) : 0,
        guesses: m.guesses,
        matched: m.matched,
        ...(m.text ? { text: true } : {}),
      }, ...s.guessLog].slice(0, 50)
    : s.guessLog
  return {
    ...s,
    guessLog,
    guesses: {
      ...s.guesses,
      [m.zone]: { guesses: m.guesses, confidence: m.confidence, matched: m.matched },
    },
  }
}

/** A socket opening is not authorization; only its first snapshot unlocks room UI. */
export function roomAccessView(state: ClientState): 'loading' | 'room' | ConnectError {
  return state.connectError ?? (state.snapshotLoaded ? 'room' : 'loading')
}
