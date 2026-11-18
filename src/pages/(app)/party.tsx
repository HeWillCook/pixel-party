import { useCallback, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AuthOverlay,
  getAuthToken,
  useAuthProfileReady,
  useMutations,
  useQuery,
} from 'deepspace'
import { DeleteRoomButton } from '../../components/game/DeleteRoomButton'
import { StudioLobby, type StudioRoomItem } from '../../components/studio/StudioLobby'
import { useToast } from '../../components/ui'
import { pixelPreflight } from '../../hooks/pixelPreflight'

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

export type ConjureCodeResult =
  | { status: 'ok'; joinCode: string }
  | { status: 'not_found' }

export default function PartyPage() {
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
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [deletedRooms, setDeletedRooms] = useState<string[]>([])

  const livePublicRooms: StudioRoomItem[] = rooms
    .filter(
      (room) =>
        room.data.status !== 'closed' &&
        !deletedRooms.includes(room.recordId) &&
        room.data.visibility === 'public' &&
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
    }))

  const defaultBoardRoom = rooms.find(
    (room) => room.data.isDefaultBoard || room.data.joinCode === 'play',
  )

  const handleCreateRoom = async (e: FormEvent) => {
    e.preventDefault()
    if (!isSignedIn) {
      setShowAuthModal(true)
      return
    }
    const trimmed = roomName.trim()
    if (!trimmed) {
      toastError('Room name required', 'Give your canvas room a name (1–40 chars).')
      return
    }
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
          name: trimmed,
          mode: 'coop',
          visibility,
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
      toastSuccess('Room created!', `Joining ${trimmed}…`)
      navigate(`/r/${payload.data.joinCode}`)
    } catch {
      toastError('Network error', 'Could not reach the server to create your room.')
    } finally {
      setCreating(false)
    }
  }

  const handleJoinCode = useCallback(async (rawCode: string): Promise<ConjureCodeResult> => {
    const raw = rawCode.trim()
    if (!raw) return { status: 'not_found' }
    const normalized = raw.toLowerCase() === 'play' ? 'play' : raw.toUpperCase()
    if (normalized === 'play') {
      return { status: 'ok', joinCode: 'play' }
    }
    if (!isSignedIn) {
      if (livePublicRooms.some((r) => r.joinCode === normalized)) {
        return { status: 'ok', joinCode: normalized }
      }
      try {
        const probe = await pixelPreflight(
          `${window.location.origin}/api/pixel/${encodeURIComponent(normalized)}/ws`,
          false,
          new AbortController().signal,
        )
        if (probe.error === 'not_found' || probe.error === 'closed') {
          return { status: 'not_found' }
        }
        return { status: 'ok', joinCode: normalized }
      } catch {
        return { status: 'not_found' }
      }
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
  }, [isSignedIn, livePublicRooms])

  return (
    <>
      <StudioLobby
        rooms={livePublicRooms}
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
        onRequestSignIn={() => setShowAuthModal(true)}
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
      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </>
  )
}
