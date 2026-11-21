import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { getAuthToken, useAuthProfileReady } from 'deepspace'
import { DAILY, MAX_COLOR, PALETTE } from '../game/config'
import type { GradeKind } from '../game/daily/attempt'
import {
  canPaintDaily,
  dailyReducer,
  duePeekIndex,
  initialDailyClientState,
  needsDailyDayRefresh,
  shouldFireAutoGrade,
  shouldFinalGrade,
  type DailyAction,
  type DailyClientState,
  type DailyRejectReason,
} from '../game/daily/client-schedule'
import {
  cannedLine,
  FINAL_SUSPENSE_LINE,
  momentsCrossed,
  peekFallbackLine,
  prefersReducedMotion,
  verdictBeatMs,
  verdictGuessMs,
  type CannedMoment,
} from '../game/daily/voice'
import { decodeCells, encodeCells } from '../game/grid'
import type { DailyStateView, GradeView } from '../server/daily-service'

const GRID_CELLS = 1024
const GRID_WIDTH = 32
const GRID_HEIGHT = 32
export const DAILY_GRADE_TIMEOUT_MS = 25_000
/** While the player is drawing, the current canvas is saved at most this often. */
export const DAILY_CANVAS_SAVE_MS = 10_000
/** A canned line stays up this long before the last verdict/grade takes the bubble back. */
const VOICE_LINE_MS = 7_000

export type VerdictStage = 'suspense' | 'guess' | 'score'
export interface DailyVoice {
  line: string | null
  verdict: VerdictStage | null
}

type GradeResponse =
  | { ok: true; grade: GradeView; state: DailyStateView }
  | { ok: false; reason: DailyRejectReason; state: DailyStateView }
  | { skipped: 'skipped_blank' | 'skipped_unchanged'; window: number; state: DailyStateView }

function storageKey(day: string, userId: string): string {
  return `daily:${day}:${userId}`
}

function readLocalCells(day: string, userId: string): Uint8Array | null {
  if (!day || !userId) return null
  try {
    const raw = window.localStorage.getItem(storageKey(day, userId))
    if (!raw) return null
    const decoded = decodeCells(raw, GRID_CELLS)
    if (decoded.every((c) => c <= MAX_COLOR)) return decoded
  } catch {
    // Ignore storage or decode errors
  }
  return null
}

function writeLocalCells(day: string, userId: string, cells: Uint8Array): void {
  if (!day || !userId) return
  try {
    window.localStorage.setItem(storageKey(day, userId), encodeCells(cells))
  } catch {
    // Ignore storage quota or security errors
  }
}

function decodeValidCells(encoded: string | undefined): Uint8Array | null {
  if (!encoded) return null
  try {
    const decoded = decodeCells(encoded, GRID_CELLS)
    if (decoded.every((c) => c <= MAX_COLOR)) return decoded
  } catch {
    // Ignore invalid base64
  }
  return null
}

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await getAuthToken()
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  } catch {
    return { 'Content-Type': 'application/json' }
  }
}

export function useDailyAttempt(): {
  state: DailyClientState
  cells: Uint8Array
  paint(x: number, y: number, color: number): void
  replaceCells(next: Uint8Array): void
  start(): Promise<boolean>
  tick(): void
  /** Haiku's live, non-scoring voice and the final verdict choreography. */
  voice: DailyVoice
  /** DEV ONLY (__DEBUG_TOOLS__) */
  reset(): Promise<boolean>
} {
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: false })
  const userId = user?.id ?? ''

  const [state, rawDispatch] = useReducer(dailyReducer, undefined, () =>
    initialDailyClientState(new Date().toISOString().slice(0, 10)),
  )
  const [cells, setCells] = useState<Uint8Array>(() => new Uint8Array(GRID_CELLS))
  const [loadedUserId, setLoadedUserId] = useState('')
  const loadedUserIdRef = useRef('')

  const stateRef = useRef<DailyClientState>(state)
  const cellsRef = useRef<Uint8Array>(cells)
  const userIdRef = useRef<string>(userId)
  const tokenRef = useRef<string | null>(null)
  const inFlightGradeRef = useRef<Promise<void> | null>(null)
  const finalizingRef = useRef<boolean>(false)
  const finishPromiseRef = useRef<Promise<void> | null>(null)
  const frozenFinalCellsRef = useRef<string | null>(null)
  const restoredKeyRef = useRef<string>('')
  const loadMeRef = useRef<(() => void) | null>(null)
  const missedRefreshAtRef = useRef(0)
  const mutationEpochRef = useRef(0)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [voice, setVoice] = useState<DailyVoice>({ line: null, verdict: null })
  const voiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const verdictTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const cannedIndexRef = useRef(0)
  const lastTickElapsedRef = useRef(0)
  const peekFiredRef = useRef(DAILY.peekWindowsMs.map(() => false))
  const peekInFlightRef = useRef(false)
  const canvasSaveRef = useRef<{ sentHash: string | null; at: number }>({ sentHash: null, at: 0 })

  const dispatch = useCallback((action: DailyAction) => {
    stateRef.current = dailyReducer(stateRef.current, action)
    rawDispatch(action)
  }, [])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    cellsRef.current = cells
  }, [cells])

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current)
    if (voiceTimerRef.current !== null) clearTimeout(voiceTimerRef.current)
    for (const timer of verdictTimersRef.current) clearTimeout(timer)
    verdictTimersRef.current = []
  }, [])

  const clearVoiceTimers = useCallback(() => {
    if (voiceTimerRef.current !== null) {
      clearTimeout(voiceTimerRef.current)
      voiceTimerRef.current = null
    }
    for (const timer of verdictTimersRef.current) clearTimeout(timer)
    verdictTimersRef.current = []
  }, [])

  /** Show a transient line in Haiku's bubble (never a score; it yields to the verdict choreography). */
  const showVoiceLine = useCallback((line: string) => {
    clearVoiceTimers()
    setVoice({ line, verdict: null })
    voiceTimerRef.current = setTimeout(() => {
      voiceTimerRef.current = null
      setVoice({ line: null, verdict: null })
    }, VOICE_LINE_MS)
  }, [clearVoiceTimers])

  const showCanned = useCallback((moment: CannedMoment) => {
    showVoiceLine(cannedLine(moment, cannedIndexRef.current++))
  }, [showVoiceLine])

  /** The verdict reveal: suspense line, a beat, the guess, then the score. Reduced motion skips the beat. */
  const playVerdict = useCallback(() => {
    clearVoiceTimers()
    const reduced = prefersReducedMotion()
    const beat = verdictBeatMs(reduced)
    const guessHold = verdictGuessMs(reduced)
    if (beat <= 0) {
      setVoice({ line: null, verdict: 'score' })
      return
    }
    setVoice({ line: FINAL_SUSPENSE_LINE, verdict: 'suspense' })
    const first = setTimeout(() => {
      setVoice({ line: null, verdict: 'guess' })
      const second = setTimeout(() => {
        setVoice({ line: null, verdict: 'score' })
      }, guessHold)
      verdictTimersRef.current.push(second)
    }, beat)
    verdictTimersRef.current.push(first)
  }, [clearVoiceTimers])

  const resetVoice = useCallback(() => {
    clearVoiceTimers()
    lastTickElapsedRef.current = 0
    cannedIndexRef.current = 0
    peekFiredRef.current = DAILY.peekWindowsMs.map(() => false)
    peekInFlightRef.current = false
    canvasSaveRef.current = { sentHash: null, at: 0 }
    setVoice({ line: null, verdict: null })
  }, [clearVoiceTimers])

  const restoreCanvas = useCallback(
    (serverState: DailyStateView, uid: string) => {
      const key = `${serverState.day}:${uid}:${serverState.status}`
      if (restoredKeyRef.current === key) return
      restoredKeyRef.current = key

      // The server's saved canvas wins: a second device's stale local copy must never be
      // restored and then autosaved over newer art. Local storage only fills in when the server
      // has nothing yet (e.g. the first autosave has not landed).
      const fromServer = decodeValidCells(serverState.lastCells)
      const restored = fromServer ?? readLocalCells(serverState.day, uid) ?? new Uint8Array(GRID_CELLS)
      cellsRef.current = restored
      setCells(restored)
    },
    [],
  )

  // Load GET /api/daily/me on mount (when signed in)
  useEffect(() => {
    if (!isSignedIn) {
      loadedUserIdRef.current = ''
      setLoadedUserId('')
      restoredKeyRef.current = ''
      finalizingRef.current = false
      finishPromiseRef.current = null
      frozenFinalCellsRef.current = null
      inFlightGradeRef.current = null
      dispatch({
        type: 'state_loaded',
        state: {
          day: new Date().toISOString().slice(0, 10),
          status: 'not_started',
          autoUsed: 0,
          finalUsed: false,
          best: 0,
          windows: [],
          nextAutoAt: null,
          serverNow: Date.now(),
        },
      })
      return
    }

    let cancelled = false
    let loading = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryDelay = 1_000
    const loadMe = async () => {
      if (loading) return
      loading = true
      const epoch = mutationEpochRef.current
      try {
        const headers = await authHeaders()
        if (headers.Authorization) tokenRef.current = headers.Authorization.replace('Bearer ', '')
        const res = await fetch('/api/daily/me', { method: 'GET', headers })
        if (!res.ok) throw new Error('Daily state unavailable')
        if (cancelled) return
        const serverState = (await res.json()) as DailyStateView
        if (cancelled || epoch !== mutationEpochRef.current) return
        if (serverState.status === 'ended' || stateRef.current.stale || serverState.day !== stateRef.current.day) {
          finalizingRef.current = false
          frozenFinalCellsRef.current = null
        }
        dispatch({ type: 'state_loaded', state: serverState })
        loadedUserIdRef.current = userId
        setLoadedUserId(userId)
        retryDelay = 1_000
        if (userId) {
          restoreCanvas(serverState, userId)
        }
      } catch {
        if (!cancelled && (!stateRef.current.loaded || loadedUserIdRef.current !== userId)) {
          retryTimer = setTimeout(() => { retryTimer = null; void loadMe() }, retryDelay)
          retryDelay = Math.min(retryDelay * 2, 30_000)
        }
      } finally {
        loading = false
      }
    }
    loadMeRef.current = () => { void loadMe() }
    void loadMe()
    const rollover = setInterval(() => {
      if (needsDailyDayRefresh(stateRef.current, Date.now())) void loadMe()
    }, 1000)

    return () => {
      cancelled = true
      loadMeRef.current = null
      if (retryTimer !== null) clearTimeout(retryTimer)
      clearInterval(rollover)
    }
  }, [isSignedIn, userId, restoreCanvas, dispatch])

  // Restore from localStorage if userId resolved after state_loaded
  useEffect(() => {
    if (userId && state.day && state.status !== 'not_started') {
      restoreCanvas(state, userId)
    }
  }, [userId, state, restoreCanvas])

  const sendCanvas = useCallback(async (encoded: string, keepalive = false): Promise<void> => {
    const day = stateRef.current.day
    if (!day) return
    const send = async () => {
      const token = keepalive ? tokenRef.current : null
      const headers = keepalive
        ? { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        : await authHeaders()
      if (!keepalive && headers.Authorization) tokenRef.current = headers.Authorization.replace('Bearer ', '')
      return fetch('/api/daily/canvas', {
        method: 'POST',
        headers,
        body: JSON.stringify({ day, cells: encoded }),
        ...(keepalive ? { keepalive: true } : {}),
      })
    }
    try {
      const res = await send()
      if (!res.ok) canvasSaveRef.current.sentHash = null
    } catch {
      canvasSaveRef.current.sentHash = null
    }
  }, [])

  // A closed tab still stores the canvas it had: flush the latest art as the page goes away.
  useEffect(() => {
    const flush = () => {
      const current = stateRef.current
      if (current.status !== 'playing' || !userIdRef.current) return
      const encoded = encodeCells(cellsRef.current)
      if (canvasSaveRef.current.sentHash === encoded) return
      canvasSaveRef.current.sentHash = encoded
      void sendCanvas(encoded, true)
    }
    const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [sendCanvas])

  const servicePeek = useCallback(async (index: number): Promise<void> => {
    if (peekInFlightRef.current) return
    if (cellsRef.current.every(cell => cell === 0)) return
    const day = stateRef.current.day
    peekInFlightRef.current = true
    try {
      const headers = await authHeaders()
      if (headers.Authorization) tokenRef.current = headers.Authorization.replace('Bearer ', '')
      const res = await fetch('/api/daily/peek', {
        method: 'POST',
        headers,
        body: JSON.stringify({ day, cells: encodeCells(cellsRef.current) }),
      })
      const payload = res.ok ? await res.json() as { ok?: boolean; line?: string } : null
      if (stateRef.current.day !== day || stateRef.current.stale) return
      showVoiceLine(payload?.ok === true && typeof payload.line === 'string' ? payload.line : peekFallbackLine(index))
    } catch {
      if (stateRef.current.day === day && !stateRef.current.stale) showVoiceLine(peekFallbackLine(index))
    } finally {
      peekInFlightRef.current = false
    }
  }, [showVoiceLine])

  const sendGrade = useCallback(
    (kind: GradeKind, encodedOverride?: string, window?: number): Promise<void> => {
      if (stateRef.current.stale) return Promise.resolve()
      if (inFlightGradeRef.current) return inFlightGradeRef.current
      if (kind !== 'final' && (finalizingRef.current || stateRef.current.finalizing)) {
        return Promise.resolve()
      }

      const encoded = encodedOverride ?? encodeCells(cellsRef.current)
      const day = stateRef.current.day
      mutationEpochRef.current++
      dispatch({ type: 'grade_start', kind })

      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort(new DOMException('Signal timed out', 'TimeoutError'))
      }, DAILY_GRADE_TIMEOUT_MS)

      const promise = (async () => {
        try {
          const headers = await authHeaders()
          if (headers.Authorization) tokenRef.current = headers.Authorization.replace('Bearer ', '')
          if (stateRef.current.day !== day || stateRef.current.stale) return
          const res = await fetch('/api/daily/grade', {
            method: 'POST',
            headers,
            body: JSON.stringify({ day, kind, cells: encoded, ...(kind === 'auto' ? { window } : {}) }),
            signal: controller.signal,
          })
          if (stateRef.current.day !== day) return
          const now = Date.now()
          if (!res.ok) {
            dispatch({
              type: 'error',
              message: 'Could not grade canvas right now.',
              kind,
              now,
            })
            return
          }
          const payload = (await res.json()) as GradeResponse
          if (stateRef.current.day !== day || stateRef.current.stale) return
          if ((!('skipped' in payload) && !payload.ok && payload.reason === 'invalid_day') || payload.state.day !== day) {
            dispatch({ type: 'grade_rejected', reason: 'invalid_day' })
            return
          }
          if ('skipped' in payload) {
            dispatch({ type: 'grade_skipped', status: payload.skipped, window: payload.window, state: payload.state })
            if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current)
            noticeTimerRef.current = setTimeout(() => { noticeTimerRef.current = null; dispatch({ type: 'clear_notice' }) }, 6_000)
            return
          }
          if (payload.ok) {
            dispatch({
              type: 'grade_ok',
              grade: payload.grade,
              state: payload.state,
              now,
            })
            if (kind === 'final') playVerdict()
            else showCanned('halfway')
          } else {
            dispatch({
              type: 'grade_rejected',
              reason: payload.reason,
              state: payload.state,
              kind,
              now,
            })
          }
        } catch (err) {
          if (stateRef.current.day !== day || stateRef.current.stale) return
          const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
          dispatch({
            type: 'error',
            message: timedOut
              ? 'Haiku took too long to answer — try again.'
              : 'Network error while grading.',
            kind,
            now: Date.now(),
          })
        } finally {
          clearTimeout(timeoutId)
          mutationEpochRef.current++
          inFlightGradeRef.current = null
        }
      })()

      inFlightGradeRef.current = promise
      return promise
    },
    [dispatch, playVerdict, showCanned],
  )

  const finishAttempt = useCallback(async (timeoutCells?: Uint8Array): Promise<void> => {
    if (finishPromiseRef.current) return finishPromiseRef.current
    if (stateRef.current.status === 'ended') return
    if (stateRef.current.stale) return
    const day = stateRef.current.day

    finalizingRef.current = true
    if (frozenFinalCellsRef.current === null) {
      frozenFinalCellsRef.current = encodeCells(timeoutCells ?? cellsRef.current)
    }
    const frozenCells = frozenFinalCellsRef.current
    dispatch({ type: 'finalize_start' })

    const promise = (async () => {
      try {
        // Wait for any grade already in flight before running the final judgement.
        if (inFlightGradeRef.current) {
          await inFlightGradeRef.current
        }
        if (stateRef.current.day !== day || stateRef.current.stale) return
        if (stateRef.current.status !== 'ended') {
          await sendGrade('final', frozenCells)
        }
        if (stateRef.current.day !== day || stateRef.current.stale) return
        if (stateRef.current.status !== 'ended') {
          // The final judgement always ends the attempt server-side. If the response was lost or
          // the server was busy, re-read the authoritative state and let a later tick retry.
          loadMeRef.current?.()
        } else {
          finalizingRef.current = false
          frozenFinalCellsRef.current = null
        }
      } finally {
        finishPromiseRef.current = null
      }
    })()

    finishPromiseRef.current = promise
    return promise
  }, [dispatch, sendGrade])

  const tick = useCallback(() => {
    if (!userIdRef.current || loadedUserIdRef.current !== userIdRef.current) return
    const cur = stateRef.current
    if (cur.status !== 'playing' || cur.startedAt === undefined || cur.stale) return
    const now = Date.now()

    // Haiku's timed, non-scoring lines (start and the halfway verdict are triggered elsewhere).
    const elapsed = now + cur.clockOffsetMs - cur.startedAt
    if (elapsed < lastTickElapsedRef.current) lastTickElapsedRef.current = elapsed
    if (!finalizingRef.current) {
      for (const moment of momentsCrossed(lastTickElapsedRef.current, elapsed)) showCanned(moment)
    }
    lastTickElapsedRef.current = elapsed

    // Keep the server's copy of the latest canvas current (debounced), so the final verdict uses
    // the art the player actually ended on even if this tab never gets to send it.
    const encoded = encodeCells(cellsRef.current)
    if (canvasSaveRef.current.sentHash !== encoded && now - canvasSaveRef.current.at >= DAILY_CANVAS_SAVE_MS) {
      canvasSaveRef.current.at = now
      canvasSaveRef.current.sentHash = encoded
      void sendCanvas(encoded)
    }

    if (shouldFinalGrade(now, cur.startedAt, cur.clockOffsetMs)) {
      if (!finishPromiseRef.current) {
        // The final lands even on an untouched canvas: the attempt always runs its five minutes.
        const localCells = readLocalCells(cur.day, userIdRef.current)
        void finishAttempt(localCells ?? undefined)
      }
      return
    }

    if (finalizingRef.current || cur.finalizing || inFlightGradeRef.current) return

    if (cur.nextAutoAt != null && now + cur.clockOffsetMs - cur.nextAutoAt > DAILY.autoMissAfterMs) {
      if (now >= missedRefreshAtRef.current) {
        missedRefreshAtRef.current = now + 10_000
        loadMeRef.current?.()
      }
      return
    }
    const localCells = readLocalCells(cur.day, userIdRef.current)
    if (shouldFireAutoGrade(cur, now, localCells !== null) && localCells) {
      const window = DAILY.autoWindowsMs.findIndex(offset => cur.startedAt! + offset === cur.nextAutoAt)
      if (window >= 0) void sendGrade('auto', encodeCells(localCells), window)
      return
    }

    if (!cur.grading) {
      const peek = duePeekIndex(now, cur.startedAt, cur.clockOffsetMs, peekFiredRef.current)
      if (peek !== null) {
        peekFiredRef.current[peek] = true
        void servicePeek(peek)
      }
    }
  }, [finishAttempt, sendCanvas, sendGrade, servicePeek, showCanned])

  const paint = useCallback((x: number, y: number, color: number) => {
    const now = Date.now()
    if (finalizingRef.current || !canPaintDaily(stateRef.current, now)) return
    if (!Number.isInteger(x) || !Number.isInteger(y)) return
    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return
    if (!Number.isInteger(color) || color < 0 || color >= PALETTE.length) return

    const idx = y * GRID_WIDTH + x
    if (cellsRef.current[idx] === color) return

    const next = new Uint8Array(cellsRef.current)
    next[idx] = color
    cellsRef.current = next
    setCells(next)

    if (stateRef.current.day && userIdRef.current) {
      writeLocalCells(stateRef.current.day, userIdRef.current, next)
    }
  }, [])

  const replaceCells = useCallback((next: Uint8Array) => {
    const now = Date.now()
    if (finalizingRef.current || !canPaintDaily(stateRef.current, now)) return
    if (next.length !== GRID_CELLS) return
    for (let i = 0; i < next.length; i++) {
      const c = next[i]!
      if (!Number.isInteger(c) || c < 0 || c > MAX_COLOR) return
    }

    const copy = new Uint8Array(next)
    cellsRef.current = copy
    setCells(copy)

    if (stateRef.current.day && userIdRef.current) {
      writeLocalCells(stateRef.current.day, userIdRef.current, copy)
    }
  }, [])

  const start = useCallback(async (): Promise<boolean> => {
    mutationEpochRef.current++
    try {
      const headers = await authHeaders()
      if (headers.Authorization) tokenRef.current = headers.Authorization.replace('Bearer ', '')
      const res = await fetch('/api/daily/start', {
        method: 'POST',
        headers,
      })
      if (!res.ok) {
        dispatch({ type: 'error', message: 'Could not start daily attempt.' })
        return false
      }
      const serverState = (await res.json()) as DailyStateView
      finalizingRef.current = false
      finishPromiseRef.current = null
      frozenFinalCellsRef.current = null
      resetVoice()
      dispatch({ type: 'state_loaded', state: serverState })
      if (userIdRef.current) {
        restoreCanvas(serverState, userIdRef.current)
        if (serverState.status === 'playing' && !readLocalCells(serverState.day, userIdRef.current)) {
          writeLocalCells(serverState.day, userIdRef.current, cellsRef.current)
        }
      }
      if (serverState.status === 'playing') showCanned('start')
      return serverState.status === 'playing'
    } catch {
      dispatch({ type: 'error', message: 'Network error while starting attempt.' })
      return false
    } finally {
      mutationEpochRef.current++
    }
  }, [restoreCanvas, dispatch, resetVoice, showCanned])

  // DEV ONLY (__DEBUG_TOOLS__): POST /api/daily/reset exists only in dev and
  // PIXLE_TEST builds; in production this returns before the fetch.
  const reset = useCallback(async (): Promise<boolean> => {
    if (!__DEBUG_TOOLS__) return false
    const prevDay = stateRef.current.day
    mutationEpochRef.current++
    try {
      const headers = await authHeaders()
      if (headers.Authorization) tokenRef.current = headers.Authorization.replace('Bearer ', '')
      const res = await fetch('/api/daily/reset', {
        method: 'POST',
        headers,
      })
      if (!res.ok) {
        dispatch({ type: 'error', message: 'Could not reset daily attempt.' })
        return false
      }
      const serverState = (await res.json()) as DailyStateView
      finalizingRef.current = false
      finishPromiseRef.current = null
      frozenFinalCellsRef.current = null
      inFlightGradeRef.current = null
      restoredKeyRef.current = ''
      resetVoice()
      if (userIdRef.current) {
        try {
          if (prevDay) window.localStorage.removeItem(storageKey(prevDay, userIdRef.current))
          if (serverState.day) window.localStorage.removeItem(storageKey(serverState.day, userIdRef.current))
        } catch {
          // Ignore storage removal errors
        }
      }
      const blank = new Uint8Array(GRID_CELLS)
      cellsRef.current = blank
      setCells(blank)
      dispatch({ type: 'state_loaded', state: serverState })
      return serverState.status === 'not_started'
    } catch {
      dispatch({ type: 'error', message: 'Network error while resetting attempt.' })
      return false
    } finally {
      mutationEpochRef.current++
    }
  }, [dispatch, resetVoice])

  const exposedVoice = voice
  return { state: isSignedIn && (!userId || loadedUserId !== userId) ? { ...state, loaded: false } : state, cells, paint, replaceCells, start, tick, voice: exposedVoice, reset }
}
