import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AuthOverlay,
  getAuthToken,
  useAuthProfileReady,
  useMutations,
  useQuery,
} from 'deepspace'
import {
  ArrowRight,
  Globe,
  Hash,
  Lock,
  Palette as PaletteIcon,
  Play,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react'
import { DeleteRoomButton } from '../../components/game/DeleteRoomButton'
import {
  Badge,
  Button,
  Input,
  Label,
  useToast,
} from '../../components/ui'

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

export default function HomePage() {
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

  const livePublicRooms = rooms.filter(
    (room) =>
      room.data.status !== 'closed' &&
      !deletedRooms.includes(room.recordId) &&
      room.data.visibility === 'public' &&
      !room.data.isDefaultBoard &&
      room.data.joinCode !== 'play',
  )

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

  const handleJoinCode = async (e: FormEvent) => {
    e.preventDefault()
    const raw = joinCodeInput.trim()
    if (!raw) return
    const normalized = raw.toLowerCase() === 'play' ? 'play' : raw.toUpperCase()
    if (normalized === 'play') {
      navigate('/r/play')
      return
    }
    if (!isSignedIn) {
      navigate(`/r/${normalized}`)
      return
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
        toastError('Could not join room', payload.error ?? 'Check the code and try again.')
        return
      }
      navigate(`/r/${normalized}`)
    } catch {
      toastError('Network error', 'Failed to join room.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div
      data-testid="lobby-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8"
    >
      {/* Hero Banner: Play Now on the Default Public Board */}
      <section className="pp-panel relative overflow-hidden p-5 sm:p-8">
        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-xl space-y-2.5">
            <div className="pp-chip inline-flex items-center gap-2 px-3 py-1 text-base uppercase tracking-wider">
              <Sparkles className="h-4 w-4 text-[var(--sunset-1)]" aria-hidden />
              <span>Always-On Co-op Canvas</span>
            </div>
            <h1 className="pp-word text-3xl uppercase leading-none sm:text-5xl">
              Draw Together. Beat the AI.
            </h1>
            <p className="text-lg leading-snug text-muted-foreground">
              Jump straight onto the public 32×32 pixel board. Everyone on the board sees the word—except Claude Haiku, who watches the canvas and shouts out live guesses!
            </p>
            {defaultBoardRoom && (
              <div className="flex flex-wrap items-center gap-3 pt-1 text-base">
                <span className="pp-chip inline-flex items-center gap-1.5 px-2.5 py-0.5">
                  <Users className="h-4 w-4 text-[var(--sunset-1)]" aria-hidden />
                  {defaultBoardRoom.data.playerCount ?? 0} active painters
                </span>
                <span className="uppercase text-[var(--sunset-1)]">
                  ● {defaultBoardRoom.data.status}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row lg:flex-col">
            <Link
              to="/r/play"
              data-testid="lobby-play-now"
              className="pp-btn inline-flex items-center justify-center gap-2.5 px-6 py-3 text-xl uppercase tracking-wider"
            >
              <Play className="h-5 w-5 fill-current" aria-hidden />
              Play now
            </Link>
          </div>
        </div>
      </section>

      {/* Main Grid: Live Public Rooms + Create / Join Room */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7 Cols: Live Public Rooms List */}
        <section className="flex flex-col gap-4 lg:col-span-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl uppercase tracking-wider text-[var(--sunset-2)]">
                Live Public Rooms
              </h2>
              <p className="text-base text-muted-foreground">
                Drop into an active co-op canvas or spectate live rounds.
              </p>
            </div>
            <Badge variant="secondary" className="pp-chip shrink-0 whitespace-nowrap text-base uppercase">
              {livePublicRooms.length + 1} Open
            </Badge>
          </div>

          <div data-testid="public-rooms-list" className="flex flex-col gap-3">
            {/* Always show the featured Public Board at the top of the room list */}
            <Link
              to="/r/play"
              data-testid="room-card-play"
              className="pp-panel group flex items-center justify-between gap-3 p-4 transition-colors hover:border-[var(--sunset-1)]"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="pp-chip flex h-11 w-11 shrink-0 items-center justify-center text-[var(--sunset-1)]">
                  <PaletteIcon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="whitespace-nowrap text-xl uppercase text-foreground group-hover:text-[var(--sunset-1)]">
                      Public Board
                    </span>
                    <Badge variant="default" className="pp-chip text-sm uppercase">
                      Featured
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-base text-muted-foreground">
                    Code: <code className="text-[var(--sunset-1)]">play</code> • Co-op 32×32
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2.5">
                <span className="pp-chip inline-flex items-center gap-1.5 px-2.5 py-0.5 text-base">
                  <Users className="h-4 w-4 text-[var(--sunset-1)]" aria-hidden />
                  {defaultBoardRoom?.data.playerCount ?? 0}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-[var(--sunset-1)]" />
              </div>
            </Link>

            {roomsStatus === 'loading' && livePublicRooms.length === 0 ? (
              <div className="pp-panel p-6 text-center text-base text-muted-foreground">
                Scanning active frequencies…
              </div>
            ) : livePublicRooms.length === 0 ? (
              <div className="pp-panel p-6 text-center">
                <p className="text-lg uppercase text-[var(--sunset-2)]">
                  No custom public rooms right now
                </p>
                <p className="mt-1 text-base text-muted-foreground">
                  Hop into the Public Board above or create your own room on the right!
                </p>
              </div>
            ) : (
              livePublicRooms.map((room) => (
                <div key={room.recordId} className="pp-panel flex flex-col items-stretch sm:flex-row sm:items-center sm:gap-3 sm:pr-4">
                  <Link
                    to={`/r/${room.data.joinCode}`}
                    data-testid={`room-card-${room.data.joinCode}`}
                    className="group flex min-w-0 flex-1 items-center justify-between gap-4 p-4 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xl uppercase text-foreground group-hover:text-[var(--sunset-1)]">
                          {room.data.name}
                        </span>
                        <Badge variant="secondary" className="pp-chip text-sm uppercase">
                          {room.data.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-base text-muted-foreground">
                        Code: <code className="text-[var(--sunset-1)]">{room.data.joinCode}</code> • Co-op 32×32
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="pp-chip inline-flex items-center gap-1.5 px-2.5 py-0.5 text-base">
                        <Users className="h-4 w-4 text-[var(--sunset-1)]" aria-hidden />
                        {room.data.playerCount ?? 0}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-[var(--sunset-1)]" />
                    </div>
                  </Link>
                  {user?.id === room.data.hostId && (
                    <div className="flex justify-end px-4 pb-4 sm:p-0">
                      <DeleteRoomButton joinCode={room.data.joinCode} onDeleted={() => setDeletedRooms(previous => [...previous, room.recordId])} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Right 5 Cols: Create Room + Join by Code */}
        <section className="flex flex-col gap-5 lg:col-span-5">
          {/* Create Room Card */}
          <form
            data-testid="create-room-form"
            onSubmit={handleCreateRoom}
            className="pp-panel flex flex-col gap-4 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl uppercase tracking-wider text-[var(--sunset-2)]">
                Create a Room
              </h2>
              <Badge variant="secondary" className="pp-chip text-sm uppercase">
                Co-op 32×32
              </Badge>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="room-name" className="text-base uppercase text-[var(--soft-text)]">
                Room Name
              </Label>
              <Input
                id="room-name"
                data-testid="create-room-name"
                placeholder="e.g. Midnight Pixel Club"
                maxLength={40}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                disabled={!mutationsReady || creating}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-base uppercase text-[var(--soft-text)]">Mode</Label>
              <div className="flex items-center justify-between border border-border bg-secondary/60 px-3 py-2 text-base">
                <span className="text-foreground">Co-op (32×32 Shared Grid)</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-base uppercase text-[var(--soft-text)]">Visibility</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="visibility-public"
                  disabled={!mutationsReady || creating}
                  onClick={() => setVisibility('public')}
                  className={`flex items-center justify-center gap-1.5 border-2 px-3 py-2 text-base uppercase transition-colors ${
                    visibility === 'public'
                      ? 'border-[var(--sunset-1)] bg-secondary text-[var(--sunset-1)]'
                      : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Globe className="h-4 w-4" aria-hidden />
                  <span>Public</span>
                </button>
                <button
                  type="button"
                  data-testid="visibility-private"
                  disabled={!mutationsReady || creating}
                  onClick={() => setVisibility('private')}
                  className={`flex items-center justify-center gap-1.5 border-2 px-3 py-2 text-base uppercase transition-colors ${
                    visibility === 'private'
                      ? 'border-[var(--sunset-1)] bg-secondary text-[var(--sunset-1)]'
                      : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Lock className="h-4 w-4" aria-hidden />
                  <span>Private</span>
                </button>
              </div>
            </div>

            {isSignedIn ? (
              <Button
                type="submit"
                data-testid="create-room-submit"
                disabled={!mutationsReady || creating || !roomName.trim()}
                className="pp-btn mt-1 w-full gap-2 text-lg uppercase"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {creating ? 'Creating…' : 'Create & Launch Room'}
              </Button>
            ) : (
              <Button
                type="button"
                data-testid="create-room-signin"
                onClick={() => setShowAuthModal(true)}
                className="pp-btn mt-1 w-full gap-2 text-lg uppercase"
              >
                Sign in to Host a Room
              </Button>
            )}
          </form>

          {/* Join by Code Card */}
          <form
            data-testid="join-room-form"
            onSubmit={handleJoinCode}
            className="pp-panel flex flex-col gap-3 p-5"
          >
            <h3 className="text-xl uppercase tracking-wider text-[var(--sunset-2)]">
              Have an invite code?
            </h3>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  data-testid="join-code-input"
                  placeholder="Enter 4-char code"
                  maxLength={64}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  disabled={joining}
                  className="pl-8 uppercase"
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                data-testid="join-code-submit"
                disabled={joining || !joinCodeInput.trim()}
                className="pp-btn px-5 text-lg uppercase"
              >
                {joining ? 'Joining…' : 'Join'}
              </Button>
            </div>
          </form>
        </section>
      </div>

      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}
