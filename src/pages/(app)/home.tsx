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
      <section className="arcade-card relative overflow-hidden rounded-xl border-2 border-amber-400/80 bg-gradient-to-br from-[#231b42] via-[#171426] to-[#2d1636] p-5 sm:p-8">
        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-xl space-y-2.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="font-pixel uppercase tracking-wider">Always-On Co-op Canvas</span>
            </div>
            <h1 className="font-pixel text-2xl font-extrabold uppercase tracking-tight text-foreground sm:text-4xl">
              Draw Together. Beat the AI.
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Jump straight onto the public 32×32 pixel board. Everyone on the board sees the word—except Claude Haiku, who watches the canvas and shouts out live guesses!
            </p>
            {defaultBoardRoom && (
              <div className="flex items-center gap-3 pt-1 text-xs text-amber-200/90">
                <span className="font-pixel inline-flex items-center gap-1.5 rounded bg-black/40 px-2.5 py-1">
                  <Users className="h-3.5 w-3.5 text-cyan-400" aria-hidden />
                  {defaultBoardRoom.data.playerCount ?? 0} active painters
                </span>
                <span className="font-pixel uppercase text-emerald-300">
                  ● {defaultBoardRoom.data.status}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row lg:flex-col">
            <Link
              to="/r/play"
              data-testid="lobby-play-now"
              className="arcade-btn font-pixel inline-flex items-center justify-center gap-2.5 rounded-lg bg-amber-400 px-6 py-3.5 text-sm font-extrabold uppercase tracking-wider text-slate-950 hover:bg-amber-300 sm:text-base"
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
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-pixel text-lg font-extrabold uppercase tracking-wider text-foreground">
                Live Public Rooms
              </h2>
              <p className="text-xs text-muted-foreground">
                Drop into an active co-op canvas or spectate live rounds.
              </p>
            </div>
            <Badge variant="secondary" className="font-pixel">
              {livePublicRooms.length + 1} Open
            </Badge>
          </div>

          <div data-testid="public-rooms-list" className="flex flex-col gap-3">
            {/* Always show the featured Public Board at the top of the room list */}
            <Link
              to="/r/play"
              data-testid="room-card-play"
              className="arcade-card group flex items-center justify-between gap-4 rounded-lg bg-card p-4 transition-colors hover:border-amber-400/70"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-amber-400/60 bg-amber-400/15 text-amber-300">
                  <PaletteIcon className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-sm font-extrabold text-foreground group-hover:text-amber-300">
                      Public Board
                    </span>
                    <Badge variant="default" className="font-pixel text-[10px] uppercase">
                      Featured
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Code: <code className="font-pixel text-foreground">play</code> • Co-op 32×32
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-pixel inline-flex items-center gap-1 rounded bg-secondary px-2.5 py-1 text-xs font-bold text-foreground">
                  <Users className="h-3.5 w-3.5 text-cyan-400" aria-hidden />
                  {defaultBoardRoom?.data.playerCount ?? 0}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-amber-300" />
              </div>
            </Link>

            {roomsStatus === 'loading' && livePublicRooms.length === 0 ? (
              <div className="arcade-card rounded-lg bg-card/50 p-6 text-center text-xs text-muted-foreground">
                Scanning active frequencies…
              </div>
            ) : livePublicRooms.length === 0 ? (
              <div className="arcade-card rounded-lg bg-card/60 p-6 text-center">
                <p className="font-pixel text-xs font-bold uppercase text-foreground">
                  No custom public rooms right now
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hop into the Public Board above or create your own room on the right!
                </p>
              </div>
            ) : (
              livePublicRooms.map((room) => (
                <div key={room.recordId} className="arcade-card flex items-center gap-3 rounded-lg bg-card pr-4">
                  <Link
                    to={`/r/${room.data.joinCode}`}
                    data-testid={`room-card-${room.data.joinCode}`}
                    className="group flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg p-4 transition-colors hover:text-pink-300"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-pixel truncate text-sm font-bold text-foreground group-hover:text-pink-300">
                          {room.data.name}
                        </span>
                        <Badge variant="secondary" className="font-pixel text-[10px] uppercase">
                          {room.data.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Code: <code className="font-pixel text-foreground">{room.data.joinCode}</code> • Co-op 32×32
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-pixel inline-flex items-center gap-1 rounded bg-secondary px-2.5 py-1 text-xs font-bold text-foreground">
                        <Users className="h-3.5 w-3.5 text-cyan-400" aria-hidden />
                        {room.data.playerCount ?? 0}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-pink-300" />
                    </div>
                  </Link>
                  {user?.id === room.data.hostId && <DeleteRoomButton joinCode={room.data.joinCode} onDeleted={() => setDeletedRooms(previous => [...previous, room.recordId])} />}
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
            className="arcade-card flex flex-col gap-4 rounded-xl bg-card p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-pixel text-base font-extrabold uppercase tracking-wider text-foreground">
                Create a Room
              </h2>
              <Badge variant="secondary" className="font-pixel text-[10px] uppercase">
                Co-op 32×32
              </Badge>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="room-name" className="font-pixel text-xs uppercase">
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
              <Label className="font-pixel text-xs uppercase">Mode</Label>
              <div className="flex items-center justify-between rounded-md border border-border bg-secondary/60 px-3 py-2 text-xs">
                <span className="font-pixel font-bold text-foreground">Co-op (32×32 Shared Grid)</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-pixel text-xs uppercase">Visibility</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="visibility-public"
                  disabled={!mutationsReady || creating}
                  onClick={() => setVisibility('public')}
                  className={`flex items-center justify-center gap-1.5 rounded-md border-2 px-3 py-2 text-xs font-bold transition-colors ${
                    visibility === 'public'
                      ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                      : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" aria-hidden />
                  <span className="font-pixel">Public</span>
                </button>
                <button
                  type="button"
                  data-testid="visibility-private"
                  disabled={!mutationsReady || creating}
                  onClick={() => setVisibility('private')}
                  className={`flex items-center justify-center gap-1.5 rounded-md border-2 px-3 py-2 text-xs font-bold transition-colors ${
                    visibility === 'private'
                      ? 'border-pink-400 bg-pink-400/15 text-pink-300'
                      : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                  <span className="font-pixel">Private</span>
                </button>
              </div>
            </div>

            {isSignedIn ? (
              <Button
                type="submit"
                data-testid="create-room-submit"
                disabled={!mutationsReady || creating || !roomName.trim()}
                className="arcade-btn font-pixel mt-1 w-full gap-2 bg-amber-400 font-extrabold uppercase text-slate-950 hover:bg-amber-300"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {creating ? 'Creating…' : 'Create & Launch Room'}
              </Button>
            ) : (
              <Button
                type="button"
                data-testid="create-room-signin"
                onClick={() => setShowAuthModal(true)}
                className="arcade-btn font-pixel mt-1 w-full gap-2 bg-primary font-extrabold uppercase text-primary-foreground"
              >
                Sign in to Host a Room
              </Button>
            )}
          </form>

          {/* Join by Code Card */}
          <form
            data-testid="join-room-form"
            onSubmit={handleJoinCode}
            className="arcade-card flex flex-col gap-3 rounded-xl bg-card p-5"
          >
            <h3 className="font-pixel text-sm font-extrabold uppercase tracking-wider text-foreground">
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
                  className="font-pixel pl-8 uppercase"
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                data-testid="join-code-submit"
                disabled={joining || !joinCodeInput.trim()}
                className="arcade-btn font-pixel font-bold uppercase"
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
