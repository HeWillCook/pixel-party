import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { getAuthToken, useAuthProfileReady } from 'deepspace'
import { PALETTE } from '../game/config'
import type { GradeKind } from '../game/daily/attempt'
import {
  dailyReducer,
  initialDailyClientState,
  nextAutoAt,
  shouldFinalGrade,
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

  const [state, dispatch] = useReducer(dailyReducer, undefined, () =>
    initialDailyClientState(new Date().toISOString().slice(0, 10)),
  )
  const [cells, setCells] = useState<Uint8Array>(() => new Uint8Array(GRID_CELLS))

  const stateRef = useRef<DailyClientState>(state)
  const cellsRef = useRef<Uint8Array>(cells)
  const userIdRef = useRef<string>(userId)
  const lastGradeAtRef = useRef<number | null>(null)
  const lastAutoTargetRef = useRef<number | null>(null)
  const endingRef = useRef<boolean>(false)
  const restoredKeyRef = useRef<string>('')

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
      endingRef.current = false
      lastGradeAtRef.current = null
      lastAutoTargetRef.current = null
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
  }, [isSignedIn, userId, restoreCanvas])

  // Restore from localStorage if userId resolved after state_loaded
  useEffect(() => {
    if (userId && state.day && state.status !== 'not_started') {
      restoreCanvas(state, userId)
    }
  }, [userId, state, restoreCanvas])

  const sendGrade = useCallback(async (kind: GradeKind): Promise<void> => {
    if (stateRef.current.grading) return
    dispatch({ type: 'grade_start' })
    try {
      const headers = await authHeaders()
      const encoded = encodeCells(cellsRef.current)
      const res = await fetch('/api/daily/grade', {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind, cells: encoded }),
      })
      if (!res.ok) {
        dispatch({ type: 'error', message: 'Could not grade canvas right now.' })
        return
      }
      const payload = (await res.json()) as GradeResponse
      if (payload.ok) {
        lastGradeAtRef.current = Date.now()
        dispatch({ type: 'grade_ok', grade: payload.grade, state: payload.state })
      } else {
        dispatch({ type: 'grade_rejected', reason: payload.reason, state: payload.state })
      }
    } catch {
      dispatch({ type: 'error', message: 'Network error while grading.' })
    }
  }, [])

  const sendEnd = useCallback(async (): Promise<void> => {
    try {
      const headers = await authHeaders()
      const encoded = encodeCells(cellsRef.current)
      const res = await fetch('/api/daily/end', {
        method: 'POST',
        headers,
        body: JSON.stringify({ cells: encoded }),
      })
      if (!res.ok) return
      const serverState = (await res.json()) as DailyStateView
      dispatch({ type: 'state_loaded', state: serverState })
    } catch {
      // Ignore network error during end
    }
  }, [])

  const finishAttempt = useCallback(async (): Promise<void> => {
    if (endingRef.current) return
    endingRef.current = true
    try {
      if (!stateRef.current.finalUsed) {
        await sendGrade('final')
      }
      await sendEnd()
    } finally {
      endingRef.current = false
    }
  }, [sendGrade, sendEnd])

  // 1s ticker while playing: triggers auto grades at nextAutoAt and final grade + end when time is up
  useEffect(() => {
    if (state.status !== 'playing' || state.startedAt === undefined) return
    const startedAt = state.startedAt

    const interval = setInterval(() => {
      const cur = stateRef.current
      if (cur.status !== 'playing' || cur.startedAt === undefined) return
      const now = Date.now()

      if (shouldFinalGrade(now, startedAt)) {
        if (!cur.grading && !endingRef.current) {
          void finishAttempt()
        }
        return
      }

      if (cur.grading || endingRef.current) return

      const targetAuto =
        cur.nextAutoAt ?? nextAutoAt(startedAt, cur.autoUsed, lastGradeAtRef.current)
      if (
        targetAuto !== null &&
        now >= targetAuto &&
        lastAutoTargetRef.current !== targetAuto
      ) {
        lastAutoTargetRef.current = targetAuto
        void sendGrade('auto')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [state.status, state.startedAt, finishAttempt, sendGrade])

  const paint = useCallback((x: number, y: number, color: number) => {
    if (stateRef.current.status !== 'playing') return
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
      endingRef.current = false
      lastGradeAtRef.current = null
      lastAutoTargetRef.current = null
      dispatch({ type: 'state_loaded', state: serverState })
      if (userIdRef.current) {
        restoreCanvas(serverState, userIdRef.current)
      }
    } catch {
      dispatch({ type: 'error', message: 'Network error while starting attempt.' })
    }
  }, [restoreCanvas])

  const askNow = useCallback(async (): Promise<void> => {
    if (stateRef.current.status !== 'playing') return
    await sendGrade('ask')
  }, [sendGrade])

  const done = useCallback(async (): Promise<void> => {
    if (stateRef.current.status !== 'playing') return
    await finishAttempt()
  }, [finishAttempt])

  return { state, cells, paint, start, askNow, done }
}
