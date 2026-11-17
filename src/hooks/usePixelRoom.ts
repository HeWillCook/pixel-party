import { useCallback, useEffect, useRef, useState } from 'react'
import { getAuthToken, useAuthStatus } from 'deepspace'
import {
  applyConnectError,
  applyOptimisticPlace,
  applyServerMsg,
  clearLastReject,
  initialClientState,
  type ClientState,
} from '../game/client-state'
import { PALETTE } from '../game/config'
import { MAX_PLACE_BATCH, type Placement, type ClientMsg, type ServerMsg } from '../game/protocol'
import { cooldownMs } from '../game/rules'
import { pixelPreflight } from './pixelPreflight'

export interface UsePixelRoomResult {
  state: ClientState
  sessionExpired: boolean
  place: (x: number, y: number, c: number) => void
  ask: () => void
  next: () => void
  chooseTeam: (t: 'red' | 'blue') => void
}

const REJECT_DISPLAY_MS = 4000

export function usePixelRoom(joinCode: string): UsePixelRoomResult {
  const { isSignedIn, userId, sessionId } = useAuthStatus()
  const connectionKey = JSON.stringify([joinCode, isSignedIn, userId, sessionId])
  const [stateKey, setStateKey] = useState(connectionKey)
  const [state, setState] = useState<ClientState>(() => initialClientState())
  const [sessionExpired, setSessionExpired] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const stateRef = useRef<ClientState>(state)
  const queuedRef = useRef<Placement[]>([])
  const frameRef = useRef<number | null>(null)
  const lastSendAtRef = useRef<number>(0)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  // M6: Auto-clear reject banner after ~4s or once retryAt passes
  useEffect(() => {
    const reject = state.lastReject
    if (!reject) return
    const now = Date.now()
    const delay =
      reject.retryAt !== undefined && reject.retryAt > now
        ? Math.min(REJECT_DISPLAY_MS, Math.max(250, reject.retryAt - now + 100))
        : REJECT_DISPLAY_MS
    const timer = setTimeout(() => {
      setState((prev) =>
        prev.lastReject === reject ? clearLastReject(prev) : prev,
      )
    }, delay)
    return () => clearTimeout(timer)
  }, [state.lastReject])

  useEffect(() => {
    setStateKey(connectionKey)
    stateRef.current = initialClientState()
    setState(stateRef.current)
    queuedRef.current = []
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    setSessionExpired(false)
    lastSendAtRef.current = 0
    if (!joinCode || typeof window === 'undefined') return

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let alive = true
    let backoffMs = 500
    let terminalError = false
    let spectateWithoutToken = false
    const probeAbort = new AbortController()

    const scheduleReconnect = () => {
      if (!alive || terminalError) return
      const delay = backoffMs
      backoffMs = Math.min(backoffMs * 2, 8000)
      reconnectTimer = setTimeout(() => {
        void connect()
      }, delay)
    }

    const probeHttpError = async (pathUrl: string, hadToken: boolean): Promise<boolean> => {
      try {
        const { error: err, expired } = await pixelPreflight(pathUrl, hadToken, probeAbort.signal)
        if (expired && alive) {
          spectateWithoutToken = true
          setSessionExpired(true)
          return false
        }
        if (err && alive) {
          terminalError = true
          setState((prev) => applyConnectError(prev, err))
          return true
        }
      } catch {
        // Network error — allow normal exponential backoff reconnect
      }
      return false
    }

    const connect = async () => {
      if (!alive || terminalError) return
      let token: string | null = null
      if (isSignedIn && !spectateWithoutToken) {
        try {
          token = await getAuthToken()
        } catch {
          token = null
        }
      }
      if (!alive || terminalError) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const baseUrl = `${protocol}//${window.location.host}`
      const url = new URL(`/api/pixel/${encodeURIComponent(joinCode)}/ws`, baseUrl)
      if (token) {
        url.searchParams.set('token', token)
      }

      const httpProbeUrl = `${window.location.origin}/api/pixel/${encodeURIComponent(joinCode)}/ws${
        token ? `?token=${encodeURIComponent(token)}` : ''
      }`

      let receivedSnapshot = false
      const socket = new WebSocket(url.toString())
      ws = socket
      wsRef.current = socket

      socket.onopen = () => {
        if (ws !== socket || !alive) {
          socket.close()
          return
        }
        // M1: Do not reset backoffMs on open; reset only after a snapshot arrives
        setState((prev) => ({ ...prev, connected: true, connectError: null }))
      }

      socket.onmessage = (event) => {
        if (ws !== socket || !alive) return
        if (typeof event.data !== 'string') return
        try {
          const msg = JSON.parse(event.data) as ServerMsg
          if (msg.t === 'snapshot') {
            receivedSnapshot = true
            backoffMs = 500
          }
          if (msg.t === 'snapshot' || (msg.t === 'round' && msg.round.id !== stateRef.current.round?.id)) {
            queuedRef.current = []
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
            frameRef.current = null
          }
          setState((prev) => {
            const updated = applyServerMsg(prev, msg)
            stateRef.current = updated
            return updated
          })
        } catch {
          // Ignore malformed server payloads
        }
      }

      socket.onclose = () => {
        if (ws !== socket) return
        ws = null
        wsRef.current = null
        setState((prev) => ({ ...prev, connected: false }))
        if (!alive || terminalError) return

        // I2: If the socket closed before receiving a snapshot, probe HTTP status for 401 / 404 / 410
        if (!receivedSnapshot) {
          void probeHttpError(httpProbeUrl, Boolean(token)).then((isTerminal) => {
            if (!isTerminal) {
              scheduleReconnect()
            }
          })
        } else {
          scheduleReconnect()
        }
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    void connect()

    return () => {
      alive = false
      probeAbort.abort()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onclose = null
        ws.onerror = null
        ws.close()
      }
      wsRef.current = null
      queuedRef.current = []
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [joinCode, isSignedIn, userId, sessionId, connectionKey])

  const sendMsg = useCallback((msg: ClientMsg): boolean => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    try {
      ws.send(JSON.stringify(msg))
      return true
    } catch {
      return false
    }
  }, [])

  const place = useCallback(
    (x: number, y: number, c: number) => {
      const current = stateRef.current
      if (!Number.isInteger(x) || !Number.isInteger(y)) return
      if (x < 0 || x >= current.width || y < 0 || y >= current.height) return
      if (!Number.isInteger(c) || c < 1 || c >= PALETTE.length) return

      // M3: Gate placement on active playing state and signed-in snapshot identity
      if (!current.connected || !current.you.userId || current.round?.state !== 'playing') return

      const now = Date.now()
      const cd = cooldownMs(Math.max(1, current.players))

      if (now < current.you.cooldownUntil) return
      if (now - lastSendAtRef.current < cd) return

      const idx = y * current.width + x
      if (current.cells[idx] === c || current.pending.has(idx)) return
      if (wsRef.current?.readyState !== WebSocket.OPEN) return
      lastSendAtRef.current = now
      const optimistic = applyOptimisticPlace(current, x, y, c)
      const updated = { ...optimistic, you: { ...optimistic.you, cooldownUntil: Math.max(optimistic.you.cooldownUntil, now + cd) } }
      stateRef.current = updated
      setState(updated)
      queuedRef.current.push({ x, y, c })
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null
          const queued = queuedRef.current
          queuedRef.current = []
          for (let i = 0; i < queued.length; i += MAX_PLACE_BATCH) {
            const cells = queued.slice(i, i + MAX_PLACE_BATCH)
            if (!sendMsg({ t: 'place', cells })) {
              setState(prev => {
                let updated = prev
                for (const cell of cells) updated = applyServerMsg(updated, { t: 'reject', reason: 'round_inactive', x: cell.x, y: cell.y })
                stateRef.current = updated
                return updated
              })
            }
          }
        })
      }
    },
    [sendMsg],
  )

  const ask = useCallback(() => {
    sendMsg({ t: 'ask' })
  }, [sendMsg])

  const next = useCallback(() => {
    sendMsg({ t: 'next' })
  }, [sendMsg])

  const chooseTeam = useCallback(
    (team: 'red' | 'blue') => {
      sendMsg({ t: 'team', team })
    },
    [sendMsg],
  )

  return { state: stateKey === connectionKey ? state : initialClientState(), sessionExpired, place, ask, next, chooseTeam }
}
