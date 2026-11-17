import { useCallback, useEffect, useRef, useState } from 'react'
import { getAuthToken, useAuthStatus } from 'deepspace'
import {
  applyOptimisticPlace,
  applyServerMsg,
  initialClientState,
  type ClientState,
} from '../game/client-state'
import { PALETTE } from '../game/config'
import type { ClientMsg, ServerMsg } from '../game/protocol'
import { cooldownMs } from '../game/rules'

export interface UsePixelRoomResult {
  state: ClientState
  place: (x: number, y: number, c: number) => void
  ask: () => void
  next: () => void
  chooseTeam: (t: 'red' | 'blue') => void
}

export function usePixelRoom(joinCode: string): UsePixelRoomResult {
  const { isSignedIn, userId, sessionId } = useAuthStatus()
  const [state, setState] = useState<ClientState>(() => initialClientState())
  const wsRef = useRef<WebSocket | null>(null)
  const stateRef = useRef<ClientState>(state)
  const lastSendAtRef = useRef<number>(0)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    setState(initialClientState())
    lastSendAtRef.current = 0
    if (!joinCode || typeof window === 'undefined') return

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let alive = true
    let backoffMs = 500

    const scheduleReconnect = () => {
      if (!alive) return
      const delay = backoffMs
      backoffMs = Math.min(backoffMs * 2, 8000)
      reconnectTimer = setTimeout(() => {
        void connect()
      }, delay)
    }

    const connect = async () => {
      if (!alive) return
      let token: string | null = null
      if (isSignedIn) {
        try {
          token = await getAuthToken()
        } catch {
          token = null
        }
      }
      if (!alive) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const baseUrl = `${protocol}//${window.location.host}`
      const url = new URL(`/api/pixel/${encodeURIComponent(joinCode)}/ws`, baseUrl)
      if (token) {
        url.searchParams.set('token', token)
      }

      const socket = new WebSocket(url.toString())
      ws = socket
      wsRef.current = socket

      socket.onopen = () => {
        if (ws !== socket || !alive) {
          socket.close()
          return
        }
        backoffMs = 500
        setState((prev) => ({ ...prev, connected: true }))
      }

      socket.onmessage = (event) => {
        if (ws !== socket || !alive) return
        if (typeof event.data !== 'string') return
        try {
          const msg = JSON.parse(event.data) as ServerMsg
          setState((prev) => applyServerMsg(prev, msg))
        } catch {
          // Ignore malformed server payloads
        }
      }

      socket.onclose = () => {
        if (ws !== socket) return
        ws = null
        wsRef.current = null
        setState((prev) => ({ ...prev, connected: false }))
        scheduleReconnect()
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    void connect()

    return () => {
      alive = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onclose = null
        ws.onerror = null
        ws.close()
      }
      wsRef.current = null
    }
  }, [joinCode, isSignedIn, userId, sessionId])

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

      const now = Date.now()
      const cd = cooldownMs(Math.max(1, current.players))

      // If signed in and playing, client-side throttle drag/clicks to cooldown
      if (current.you.userId) {
        if (now < current.you.cooldownUntil) return
        if (now - lastSendAtRef.current < cd) return
      }

      const idx = y * current.width + x
      if (current.cells[idx] === c) return

      if (!sendMsg({ t: 'place', x, y, c })) return
      lastSendAtRef.current = now

      setState((prev) => {
        const next = applyOptimisticPlace(prev, x, y, c)
        if (!prev.you.userId) return next
        return {
          ...next,
          you: {
            ...next.you,
            cooldownUntil: Math.max(next.you.cooldownUntil, now + cd),
          },
        }
      })
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

  return { state, place, ask, next, chooseTeam }
}
