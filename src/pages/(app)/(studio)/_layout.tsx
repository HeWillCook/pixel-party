import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import {
  getAuthToken,
  useAuthProfileReady,
  useMutations,
  useQuery,
} from 'deepspace'
import { DeleteRoomButton } from '../../../components/game/DeleteRoomButton'
import { requestVerticalSceneTransition } from '../../../components/porch/VerticalSceneTransition'
import { enableNavMotion } from '../../../components/porch/returnFlag'
import { StudioLobby, type ConjureCodeResult, type StudioRoomItem } from '../../../components/studio/StudioLobby'
import { StudioWorldContext, type RoomPhase, type RoomSummary, type StudioWorldValue } from '../../../components/studio/StudioWorld'
import { useToast } from '../../../components/ui'
import type { Composition, Rect } from '../../../scene/camera'
import { SCENE_ZOOM_MS } from '../../../scene/zoom'

interface RoomRecord {
  name: string
  mode: 'coop' | 'team'
  visibility: 'public' | 'private'
  joinCode: string
  hostId: string
  status: 'lobby' | 'playing' | 'intermission' | 'paused' | 'closed'
  playerCount: number
  lastActiveAt: number
  isDefaultBoard: boolean
}

/**
 * The basement studio. `/party` (the lobby) and `/r/:code` (a room) are two views of one scene: this layout owns the
 * studio and its camera, and a room is a foreground that grows out of the magic easel. Opening a room pushes the
 * camera into the easel, leaving pulls it back out: the scene is never swapped for another picture.
 */
export default function StudioLayout() {
  const navigate = useNavigate()
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: false })
  const { ready: mutationsReady } = useMutations('rooms')
  const { error: toastError, success: toastSuccess } = useToast()

  const { records: rooms, status: roomsStatus } = useQuery<RoomRecord>('rooms', {
    orderBy: 'lastActiveAt',
    orderDir: 'desc',
    limit: 50,
  })

  const [roomName, setRoomName] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [creating, setCreating] = useState(false)

  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const [deletedRooms, setDeletedRooms] = useState<string[]>([])

  // Public rooms for everyone, plus the private rooms this player hosts or has joined (the rooms query only returns
  // private rooms to their host and members, so any private room that arrives here is "yours").
  const listedRooms: StudioRoomItem[] = rooms
    .filter(
      (room) =>
        room.data.status !== 'closed' &&
        !deletedRooms.includes(room.recordId) &&
        (room.data.visibility === 'public' || (isSignedIn && room.data.visibility === 'private')) &&
        !room.data.isDefaultBoard &&
        room.data.joinCode !== 'play',
    )
    .map((room) => ({
      recordId: room.recordId,
      name: room.data.name,
      joinCode: room.data.joinCode,
      hostId: room.data.hostId,
      status: room.data.status,
      playerCount: room.data.playerCount ?? 0,
      visibility: room.data.visibility,
    }))

  const defaultBoardRoom = rooms.find(
    (room) => room.data.isDefaultBoard || room.data.joinCode === 'play',
  )

  const createRoom = async (name: string, roomVisibility: 'public' | 'private') => {
    setCreating(true)
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/actions/createRoom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name,
          mode: 'coop',
          visibility: roomVisibility,
        }),
      })
      const payload = (await res.json()) as {
        success?: boolean
        data?: { roomId: string; joinCode: string }
        error?: string
      }
      if (!res.ok || !payload.success || !payload.data) {
        toastError('Could not create room', payload.error ?? 'Please try again.')
        return
      }
      toastSuccess('Room created!', `Joining ${name}…`)
      enableNavMotion()
      navigate(`/r/${payload.data.joinCode}`)
    } catch {
      toastError('Network error', 'Could not reach the server to create your room.')
    } finally {
      setCreating(false)
    }
  }

  const handleCreateRoom = async (e: FormEvent) => {
    e.preventDefault()
    if (!isSignedIn) {
      setSignInOpen(true)
      return
    }
    const trimmed = roomName.trim()
    if (!trimmed) {
      toastError('Room name required', 'Give your canvas room a name (1–40 chars).')
      return
    }
    await createRoom(trimmed, visibility)
  }

  // DEV ONLY (__DEBUG_TOOLS__)
  const handleDebugRoom = () => {
    if (creating) return
    if (!isSignedIn) {
      setSignInOpen(true)
      return
    }
    void createRoom(`Debug room ${Math.random().toString(36).slice(2, 6).toUpperCase()}`, 'public')
  }

  const handleJoinCode = useCallback(async (rawCode: string): Promise<ConjureCodeResult> => {
    const raw = rawCode.trim()
    if (!raw) return { status: 'not_found' }
    const normalized = raw.toLowerCase() === 'play' ? 'play' : raw.toUpperCase()
    if (normalized === 'play') {
      return { status: 'ok', joinCode: 'play' }
    }
    if (!isSignedIn) {
      return { status: 'ok', joinCode: normalized }
    }
    setJoining(true)
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/actions/joinRoom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ joinCode: normalized }),
      })
      const payload = (await res.json()) as {
        success?: boolean
        error?: string
      }
      if (!res.ok || !payload.success) {
        return { status: 'not_found' }
      }
      return { status: 'ok', joinCode: normalized }
    } catch {
      return { status: 'not_found' }
    } finally {
      setJoining(false)
    }
  }, [isSignedIn])

  // --- The room open on the easel (if any) ---------------------------------------------------------------
  const location = useLocation()
  const roomMatch = useMatch('/r/:code')
  const roomCode = roomMatch ? decodeURIComponent(roomMatch.params.code ?? 'play') : null
  const normalizedRoomCode = roomCode ? (roomCode.toLowerCase() === 'play' ? 'play' : roomCode.toUpperCase()) : null
  const [boardRect, setBoardRectState] = useState<Rect | null>(null)
  const [summary, setSummaryState] = useState<RoomSummary | null>(null)
  const [minBoardPx, setMinBoardPx] = useState<number | null>(null)
  const [roomShift, setRoomShift] = useState({ x: 0, y: 0 })
  const focusRef = useRef<Rect | null>(null)
  const stageRef = useRef<HTMLElement | null>(null)
  const [entering, setEntering] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sawParty = useRef(false)
  const inRoom = normalizedRoomCode !== null

  // A room reached from the lobby zooms in; a room opened cold (reload, shared link) is simply there.
  useEffect(() => {
    if (!inRoom) {
      sawParty.current = true
      setBoardRectState(null)
      setSummaryState(null)
      setLeaving(false)
      return
    }
    if (!sawParty.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setEntering(true)
    const timer = setTimeout(() => setEntering(false), SCENE_ZOOM_MS)
    return () => { clearTimeout(timer); setEntering(false) }
  }, [inRoom, location.key])

  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current) }, [])

  // Stepping back out of a room we walked into from the studio is a real Back (the room's entry is popped, so Forward
  // walks in again and Back from the studio goes on to the porch). A room opened cold (reload, shared link) has no
  // studio entry behind it, so there the room's entry is replaced instead of piling a second /party on the stack.
  const finishLeave = useCallback((path: string) => {
    const hasStudioBehind = sawParty.current && path === '/party' && ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
    if (hasStudioBehind) navigate(-1)
    else navigate(path, { replace: true })
  }, [navigate])
  const leave = useCallback((path = '/party') => {
    if (leaveTimer.current) return
    enableNavMotion()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishLeave(path)
      return
    }
    setLeaving(true)
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null
      finishLeave(path)
    }, SCENE_ZOOM_MS)
  }, [finishLeave])

  // Browser Back from the studio to the porch pans the floor up: usePopMoves (components/porch/popMoves.ts) requests
  // it before the router swaps the route. No blocker here: a data router honours one blocker at a time, and rooms own one.

  const phase: RoomPhase = leaving ? 'leaving' : entering ? 'entering' : 'active'
  const setBoardRect = useCallback((rect: Rect | null) => {
    setBoardRectState((previous) =>
      previous === rect || (previous && rect && previous.x === rect.x && previous.y === rect.y && previous.w === rect.w && previous.h === rect.h)
        ? previous
        : rect)
  }, [])
  const setSummary = useCallback((next: RoomSummary | null) => {
    setSummaryState((previous) =>
      previous === next || (previous && next && previous.players === next.players && previous.roundState === next.roundState && previous.word === next.word)
        ? previous
        : next)
  }, [])
  const onFocus = useCallback((rect: Rect | null) => { focusRef.current = rect }, [])
  const world = useMemo<StudioWorldValue>(() => ({
    hostRef: stageRef,
    focus: (_composition: Composition) => focusRef.current ?? { x: 0, y: 0, w: 1, h: 1 },
    setBoardRect,
    setSummary,
    minBoardPx,
    roomShift,
    phase,
    signInOpen,
    setSignInOpen,
    leave,
  }), [phase, signInOpen, leave, setBoardRect, setSummary, minBoardPx, roomShift])

  return (
    <StudioWorldContext.Provider value={world}>
      <div className="studio-root">
      <StudioLobby
        room={normalizedRoomCode ? { code: normalizedRoomCode, phase, boardRect, summary } : null}
        stageRef={stageRef}
        onFocus={onFocus}
        onMinBoard={setMinBoardPx}
        onRoomShift={setRoomShift}
        rooms={listedRooms}
        roomsLoading={roomsStatus === 'loading'}
        defaultBoardPlayers={defaultBoardRoom?.data.playerCount ?? 0}
        signedIn={!!isSignedIn}
        currentUserId={user?.id}
        mutationsReady={mutationsReady}
        roomName={roomName}
        visibility={visibility}
        creating={creating}
        joinCodeInput={joinCodeInput}
        joining={joining}
        onRoomNameChange={setRoomName}
        onVisibilityChange={setVisibility}
        onCreateRoom={handleCreateRoom}
        onRequestSignIn={() => setSignInOpen(true)}
        onDebugRoom={__DEBUG_TOOLS__ ? handleDebugRoom : undefined}
        signInOpen={signInOpen && !inRoom}
        onCloseSignIn={() => setSignInOpen(false)}
        onJoinCodeChange={setJoinCodeInput}
        onConjureCode={handleJoinCode}
        renderPackUp={(room) => (
          <DeleteRoomButton
            joinCode={room.joinCode}
            label="Pack up"
            onDeleted={() => setDeletedRooms((previous) => [...previous, room.recordId])}
          />
        )}
      />
      <Outlet />
      </div>
    </StudioWorldContext.Provider>
  )
}
