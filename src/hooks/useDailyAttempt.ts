import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { getAuthToken, useAuthProfileReady } from 'deepspace'
import { PALETTE } from '../game/config'
import { cellsHash, type GradeKind } from '../game/daily/attempt'
import {
  canAskDaily,
  canPaintDaily,
  dailyReducer,
  initialDailyClientState,
  shouldFireAutoGrade,
  shouldFinalGrade,
  type DailyAction,
  type DailyClientState,
  type DailyRejectReason,
} from '../game/daily/client-schedule'
import { decodeCells, encodeCells } from '../game/grid'
import type { DailyStateView, GradeView } from '../server/daily-service'

const GRID_CELLS = 1024
const GRID_WIDTH = 32
const GRID_HEIGHT = 32

type GradeResponse =
  | { ok: true; grade: GradeView; state: DailyStateView }
  | { ok: false; reason: DailyRejectReason; state: DailyStateView }

function storageKey(day: string, userId: string): string {
  return `daily:${day}:${userId}`
}

function readLocalCells(day: string, userId: string): Uint8Array | null {
  if (!day || !userId) return null
  try {
    const raw = window.localStorage.getItem(storageKey(day, userId))
    if (!raw) return null
    const decoded = decodeCells(raw, GRID_CELLS)
    if (decoded.every((c) => c <= 15)) return decoded
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
    if (decoded.every((c) => c <= 15)) return decoded
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
  start(): Promise<void>
  askNow(): Promise<void>
  done(): Promise<void>
} {
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: false })
  const userId = user?.id ?? ''

  const [state, rawDispatch] = useReducer(dailyReducer, undefined, () =>
    initialDailyClientState(new Date().toISOString().slice(0, 10)),
  )
  const [cells, setCells] = useState<Uint8Array>(() => new Uint8Array(GRID_CELLS))

  const stateRef = useRef<DailyClientState>(state)
  const cellsRef = useRef<Uint8Array>(cells)
  const userIdRef = useRef<string>(userId)
  const inFlightGradeRef = useRef<Promise<void> | null>(null)
  const finalizingRef = useRef<boolean>(false)
  const finishPromiseRef = useRef<Promise<void> | null>(null)
  const frozenFinalCellsRef = useRef<string | null>(null)
  const restoredKeyRef = useRef<string>('')

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

  const restoreCanvas = useCallback(
    (serverState: DailyStateView, uid: string) => {
      const key = `${serverState.day}:${uid}:${serverState.status}`
      if (restoredKeyRef.current === key) return
      restoredKeyRef.current = key

      const fromLocal = readLocalCells(serverState.day, uid)
      if (fromLocal) {
        cellsRef.current = fromLocal
        setCells(fromLocal)
        return
      }
      const fromServer = decodeValidCells(serverState.lastCells)
      if (fromServer) {
        cellsRef.current = fromServer
        setCells(fromServer)
      }
    },
    [],
  )

  // Load GET /api/daily/me on mount (when signed in)
  useEffect(() => {
    if (!isSignedIn) {
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
          asksUsed: 0,
          finalUsed: false,
          best: 0,
        },
      })
      return
    }

    let cancelled = false
    const loadMe = async () => {
      try {
        const headers = await authHeaders()
        const res = await fetch('/api/daily/me', { method: 'GET', headers })
        if (!res.ok || cancelled) return
        const serverState = (await res.json()) as DailyStateView
        if (cancelled) return
        if (serverState.status === 'ended') {
          finalizingRef.current = false
          frozenFinalCellsRef.current = null
        }
        dispatch({ type: 'state_loaded', state: serverState })
        if (userId) {
          restoreCanvas(serverState, userId)
        }
      } catch {
        // Ignore transient network errors on initial load
      }
    }
    void loadMe()

    return () => {
      cancelled = true
    }
  }, [isSignedIn, userId, restoreCanvas, dispatch])

  // Restore from localStorage if userId resolved after state_loaded
  useEffect(() => {
    if (userId && state.day && state.status !== 'not_started') {
      restoreCanvas(state, userId)
    }
  }, [userId, state, restoreCanvas])

  const sendGrade = useCallback(
    (kind: GradeKind, encodedOverride?: string): Promise<void> => {
      if (inFlightGradeRef.current) return inFlightGradeRef.current
      if (kind !== 'final' && (finalizingRef.current || stateRef.current.finalizing)) {
        return Promise.resolve()
      }

      const encoded = encodedOverride ?? encodeCells(cellsRef.current)
      const hash = cellsHash(encoded)
      dispatch({ type: 'grade_start', kind })

      const promise = (async () => {
        try {
          const headers = await authHeaders()
          const res = await fetch('/api/daily/grade', {
            method: 'POST',
            headers,
            body: JSON.stringify({ kind, cells: encoded }),
          })
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
          if (payload.ok) {
            dispatch({
              type: 'grade_ok',
              grade: payload.grade,
              state: payload.state,
              cellsHash: hash,
              now,
            })
          } else {
            dispatch({
              type: 'grade_rejected',
              reason: payload.reason,
              state: payload.state,
              kind,
              cellsHash: hash,
              now,
            })
          }
        } catch {
          dispatch({
            type: 'error',
            message: 'Network error while grading.',
            kind,
            now: Date.now(),
          })
        } finally {
          inFlightGradeRef.current = null
        }
      })()

      inFlightGradeRef.current = promise
      return promise
    },
    [dispatch],
  )

  const sendEnd = useCallback(
    async (encodedCells: string): Promise<boolean> => {
      try {
        const headers = await authHeaders()
        const res = await fetch('/api/daily/end', {
          method: 'POST',
          headers,
          body: JSON.stringify({ cells: encodedCells }),
        })
        if (!res.ok) {
          dispatch({
            type: 'end_failed',
            message: 'Could not finish attempt — press Done to retry.',
          })
          return false
        }
        const serverState = (await res.json()) as DailyStateView
        finalizingRef.current = false
        frozenFinalCellsRef.current = null
        dispatch({
          type: 'state_loaded',
          state: { ...serverState, status: 'ended' },
          preserveError: Boolean(stateRef.current.lastError) && !stateRef.current.endFailed,
        })
        return true
      } catch {
        dispatch({
          type: 'end_failed',
          message: 'Network error while finishing attempt — press Done to retry.',
        })
        return false
      }
    },
    [dispatch],
  )

  const finishAttempt = useCallback(async (): Promise<void> => {
    if (finishPromiseRef.current) return finishPromiseRef.current
    if (stateRef.current.status === 'ended') return

    finalizingRef.current = true
    if (frozenFinalCellsRef.current === null) {
      frozenFinalCellsRef.current = encodeCells(cellsRef.current)
    }
    const frozenCells = frozenFinalCellsRef.current
    dispatch({ type: 'finalize_start' })

    const promise = (async () => {
      try {
        // Wait for any grade already in flight before running final grade
        if (inFlightGradeRef.current) {
          await inFlightGradeRef.current
        }
        if (
          stateRef.current.status !== 'ended' &&
          !stateRef.current.finalUsed &&
          !stateRef.current.endFailed
        ) {
          await sendGrade('final', frozenCells)
        }
        if (stateRef.current.status !== 'ended') {
          await sendEnd(frozenCells)
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
  }, [dispatch, sendGrade, sendEnd])

  // 1s ticker while playing: triggers auto grades at nextAutoAt, final grade + end when time is up, and retries failed end
  useEffect(() => {
    if (state.status !== 'playing' || state.startedAt === undefined) return
    const startedAt = state.startedAt

    const interval = setInterval(() => {
      const cur = stateRef.current
      if (cur.status !== 'playing' || cur.startedAt === undefined) return
      const now = Date.now()

      if (cur.endFailed && !finishPromiseRef.current) {
        void finishAttempt()
        return
      }

      if (shouldFinalGrade(now, startedAt)) {
        if (!finishPromiseRef.current) {
          void finishAttempt()
        }
        return
      }

      if (finalizingRef.current || cur.finalizing || inFlightGradeRef.current) return

      const currentHash = cellsHash(encodeCells(cellsRef.current))
      if (shouldFireAutoGrade(cur, now, currentHash)) {
        void sendGrade('auto')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [state.status, state.startedAt, finishAttempt, sendGrade])

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

  const start = useCallback(async (): Promise<void> => {
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/daily/start', {
        method: 'POST',
        headers,
      })
      if (!res.ok) {
        dispatch({ type: 'error', message: 'Could not start daily attempt.' })
        return
      }
      const serverState = (await res.json()) as DailyStateView
      finalizingRef.current = false
      finishPromiseRef.current = null
      frozenFinalCellsRef.current = null
      dispatch({ type: 'state_loaded', state: serverState })
      if (userIdRef.current) {
        restoreCanvas(serverState, userIdRef.current)
      }
    } catch {
      dispatch({ type: 'error', message: 'Network error while starting attempt.' })
    }
  }, [restoreCanvas, dispatch])

  const askNow = useCallback(async (): Promise<void> => {
    const now = Date.now()
    if (
      finalizingRef.current ||
      inFlightGradeRef.current ||
      !canAskDaily(stateRef.current, now)
    ) {
      return
    }
    await sendGrade('ask')
  }, [sendGrade])

  const done = useCallback(async (): Promise<void> => {
    if (stateRef.current.status !== 'playing') return
    await finishAttempt()
  }, [finishAttempt])

  return { state, cells, paint, start, askNow, done }
}
