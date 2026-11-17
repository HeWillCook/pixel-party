import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AuthOverlay,
  useAuthProfileReady,
  usePresenceRoom,
  useQuery,
  useUserLookup,
} from 'deepspace'
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Clock,
  FastForward,
  LogIn,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react'
import { AskAiButton } from '../../../components/game/AskAiButton'
import { GuessFeed } from '../../../components/game/GuessFeed'
import { Palette } from '../../../components/game/Palette'
import { PixelCanvas } from '../../../components/game/PixelCanvas'
import { PlayerCursors } from '../../../components/game/PlayerCursors'
import { RoundBar } from '../../../components/game/RoundBar'
import { Button } from '../../../components/ui'
import type { RejectMsg } from '../../../game/client-state'
import { MODES } from '../../../game/config'
import { cooldownMs } from '../../../game/rules'
import { usePixelRoom } from '../../../hooks/usePixelRoom'

interface RoomRecord {
  name: string
  mode: 'coop' | 'team'
  visibility: 'public' | 'private'
  joinCode: string
  hostId: string
  status: 'lobby' | 'playing' | 'intermission' | 'paused' | 'closed'
  isDefaultBoard: boolean
}

interface RoundRecord {
  roomId: string
  roundId: string
  word: string
  outcome: 'won' | 'timeout' | 'teamWin'
  score?: number
  pixelsUsed?: number
  durationMs?: number
  contributorIds?: string[]
  finalGuesses?: string[]
}

function rejectMessage(reject: RejectMsg | null, now: number): string | null {
  if (!reject) return null
  switch (reject.reason) {
    case 'not_signed_in':
      return 'Sign in to place pixels or ask the AI.'
    case 'cooldown': {
      const wait = reject.retryAt ? Math.max(0.1, (reject.retryAt - now) / 1000) : 0.2
      return `Brush cooling down — ready in ${wait.toFixed(1)}s`
    }
    case 'ask_too_soon': {
      const wait = reject.retryAt ? Math.max(1, Math.ceil((reject.retryAt - now) / 1000)) : 5
      return `Hold on! You can ask the AI again in ${wait}s.`
    }
    case 'canvas_unchanged':
      return 'Draw something new first!'
    case 'round_inactive':
      return 'Round is not currently active.'
    case 'not_host':
      return 'Only the room host can skip to the next round.'
    case 'out_of_bounds':
      return 'That spot is outside the canvas.'
    case 'bad_color':
      return 'Pick a valid palette swatch first.'
    default:
      return null
  }
}

export default function RoomPage() {
  const { code = 'play' } = useParams<{ code: string }>()
  const joinCode = code.trim() || 'play'

  const { isSignedIn, user } = useAuthProfileReady({ requireUser: false })
  const { getName } = useUserLookup()

  const { state, place, ask, next } = usePixelRoom(joinCode)
  const { peers, updateState: updatePresence } = usePresenceRoom(`pixel:${joinCode}`)

  const { records: roomRecords } = useQuery<RoomRecord>('rooms', {
    where: { joinCode },
    limit: 1,
  })
  const roomDoc = roomRecords[0]

  const { records: roundRecords } = useQuery<RoundRecord>(
    'rounds',
    state.round?.id
      ? {
          where: { roundId: state.round.id },
          limit: 1,
        }
      : { limit: 1 },
  )
  const currentRoundDoc = useMemo(
    () => roundRecords.find((r) => r.data.roundId === state.round?.id),
    [roundRecords, state.round?.id],
  )

  const [activeColor, setActiveColor] = useState<number>(4) // Default red
  const [now, setNow] = useState<number>(() => Date.now())
  const [showAuthModal, setShowAuthModal] = useState(false)
  const lastPresenceSentRef = useRef<number>(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 100)
    return () => clearInterval(interval)
  }, [])

  const handleHoverCell = useCallback(
    (cell: { x: number; y: number } | null) => {
      if (!cell) return
      const t = Date.now()
      // Throttle cursor broadcasts to 10/s (100ms)
      if (t - lastPresenceSentRef.current < 100) return
      lastPresenceSentRef.current = t
      updatePresence({ cursor: { x: cell.x, y: cell.y }, x: cell.x, y: cell.y })
    },
    [updatePresence],
  )

  const isSpectator = !isSignedIn || !state.you.userId
  const roundPlaying = state.round?.state === 'playing'
  const canDraw = !isSpectator && Boolean(roundPlaying)
  const cooldownTotalMs = cooldownMs(Math.max(1, state.players))
  const cooldownRemainingMs = Math.max(0, state.you.cooldownUntil - now)

  const pixelsCount = useMemo(() => {
    let count = 0
    for (let i = 0; i < state.cells.length; i++) {
      if (state.cells[i] !== 0) count++
    }
    return count
  }, [state.cells])

  const isHost =
    Boolean(user?.id) &&
    Boolean(roomDoc?.data.hostId) &&
    !roomDoc?.data.isDefaultBoard &&
    joinCode !== 'play' &&
    roomDoc?.data.hostId === user?.id

  const handlePlace = useCallback(
    (x: number, y: number, color: number) => {
      if (!isSignedIn) {
        setShowAuthModal(true)
        return
      }
      place(x, y, color)
    },
    [isSignedIn, place],
  )

  const friendlyReject = rejectMessage(state.lastReject, now)

  const contributorNames = useMemo(() => {
    const rawIds = currentRoundDoc?.data.contributorIds
    const ids = Array.isArray(rawIds) ? rawIds : []
    if (ids.length === 0) {
      if (pixelsCount > 0 && user?.id) {
        return [user.name || user.email || 'You']
      }
      return []
    }
    return ids.map((id) => getName(id) || (id === user?.id ? user.name || 'You' : `Painter ${id.slice(0, 5)}`))
  }, [currentRoundDoc, getName, pixelsCount, user])

  const intermissionRemainingSec = useMemo(() => {
    if (state.round?.state !== 'intermission' || !state.round.endedAt) return 0
    const endsAt = state.round.endedAt + MODES[state.mode].intermissionMs
    return Math.max(0, Math.ceil((endsAt - now) / 1000))
  }, [state.round, state.mode, now])

  const showOverlay = state.round?.state === 'intermission' && state.round.result != null
  const outcome = state.round?.result?.outcome

  return (
    <div
      data-testid="room-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4"
    >
      {/* Top breadcrumb & host controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/home"
          className="font-pixel inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Lobby
        </Link>

        <div className="flex items-center gap-2">
          {isHost && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="host-next-button"
              onClick={next}
              className="arcade-btn font-pixel h-8 gap-1.5 px-3 text-xs font-bold"
            >
              <FastForward className="h-3.5 w-3.5 text-amber-400" aria-hidden />
              Skip Round
            </Button>
          )}
        </div>
      </div>

      {/* Round Bar: Word, Timer, Players, Share */}
      <RoundBar
        round={state.round}
        players={state.players}
        connected={state.connected}
        now={now}
        joinCode={joinCode}
        roomName={roomDoc?.data.name}
        pixelsCount={pixelsCount}
      />

      {/* Spectator Sign-In Banner */}
      {!isSignedIn && (
        <div
          data-testid="spectator-banner"
          className="arcade-card flex flex-wrap items-center justify-between gap-3 rounded-lg border-amber-400/70 bg-amber-500/10 px-4 py-2.5"
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm">
            <LogIn className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            <span className="font-medium text-amber-100">
              You are watching in <strong>Spectator Mode</strong>. Sign in to place pixels and ask the AI!
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            data-testid="spectator-sign-in-button"
            onClick={() => setShowAuthModal(true)}
            className="arcade-btn font-pixel h-8 bg-amber-400 px-3 text-xs font-extrabold uppercase text-slate-950 hover:bg-amber-300"
          >
            Sign in to play
          </Button>
        </div>
      )}

      {/* Reject feedback toast/banner */}
      {friendlyReject && (
        <div
          data-testid="reject-notice"
          role="status"
          className="flex items-center justify-between gap-2 rounded-md border border-amber-400/50 bg-amber-950/60 px-3 py-2 text-xs font-medium text-amber-200"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            <span>{friendlyReject}</span>
          </div>
          {state.lastReject?.reason === 'not_signed_in' && !isSignedIn && (
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="font-pixel underline hover:text-white"
            >
              Sign in
            </button>
          )}
        </div>
      )}

      {/* Main Game Stage: Responsive 2-column on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        {/* Left/Center Column: Pixel Canvas + Palette */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          <PixelCanvas
            width={state.width}
            height={state.height}
            cells={state.cells}
            activeColor={activeColor}
            canDraw={canDraw}
            cooldownRemainingMs={cooldownRemainingMs}
            onPlace={handlePlace}
            onHoverCell={handleHoverCell}
          >
            <PlayerCursors peers={peers} width={state.width} height={state.height} />

            {/* Win / Timeout Intermission Overlay */}
            {showOverlay && state.round && (
              <div
                data-testid="round-overlay"
                className="animate-in fade-in-0 zoom-in-95 absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center backdrop-blur-xs"
              >
                <div className="arcade-card flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border-2 border-amber-400 bg-[#1b1530] p-5 shadow-2xl">
                  {outcome === 'won' ? (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-400">
                        <Trophy className="h-6 w-6 text-emerald-400" aria-hidden />
                      </div>
                      <span className="font-pixel rounded bg-emerald-500/20 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-widest text-emerald-300">
                        AI Guessed It!
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 ring-2 ring-amber-400">
                        <Clock className="h-6 w-6 text-amber-400" aria-hidden />
                      </div>
                      <span className="font-pixel rounded bg-amber-500/20 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-widest text-amber-300">
                        Time&apos;s Up!
                      </span>
                    </>
                  )}

                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      The word was
                    </p>
                    <h2
                      data-testid="overlay-word"
                      className="font-pixel mt-0.5 text-2xl font-extrabold uppercase tracking-wider text-amber-300"
                    >
                      {state.round.word}
                    </h2>
                  </div>

                  <div className="grid w-full grid-cols-2 gap-2 rounded-lg bg-background/60 p-2.5 text-xs">
                    <div className="flex flex-col items-center">
                      <span className="text-muted-foreground">Score</span>
                      <span
                        data-testid="overlay-score"
                        className="font-pixel mt-0.5 flex items-center gap-1 text-base font-extrabold text-emerald-400"
                      >
                        <Award className="h-4 w-4" aria-hidden />
                        {state.round.result?.score ?? 0} pts
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-muted-foreground">Pixels Used</span>
                      <span className="font-pixel mt-0.5 text-base font-extrabold text-foreground">
                        {currentRoundDoc?.data.pixelsUsed ?? pixelsCount} px
                      </span>
                    </div>
                  </div>

                  <div
                    data-testid="overlay-contributors"
                    className="w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-left"
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Users className="h-3.5 w-3.5 text-cyan-400" aria-hidden />
                      <span>Contributors</span>
                    </div>
                    {contributorNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {contributorNames.map((name, idx) => (
                          <span
                            key={`${name}-${idx}`}
                            className="font-pixel rounded bg-secondary px-2 py-0.5 text-xs font-bold text-foreground"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No pixels placed this round.</p>
                    )}
                  </div>

                  <div className="mt-1 flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-pixel">
                      Next word in {intermissionRemainingSec}s…
                    </span>
                    {isHost && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={next}
                        className="arcade-btn font-pixel h-8 bg-amber-400 px-3 text-xs font-extrabold text-slate-950 hover:bg-amber-300"
                      >
                        Next Word Now
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </PixelCanvas>

          <Palette
            activeColor={activeColor}
            onSelectColor={setActiveColor}
            disabled={isSpectator}
            cooldownRemainingMs={cooldownRemainingMs}
            cooldownTotalMs={cooldownTotalMs}
          />
        </div>

        {/* Right Column: Star AI Guess Feed + Ask Button + How Scoring Works */}
        <div className="flex flex-col gap-3 lg:col-span-5">
          <GuessFeed
            guesses={state.guesses}
            aiResting={state.aiResting}
            roundId={state.round?.id}
          />

          <div className="arcade-card flex flex-col gap-2.5 rounded-lg bg-card p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-pixel text-xs font-bold uppercase tracking-wider text-foreground">
                  Ready for a Verdict?
                </h3>
                <p className="text-xs text-muted-foreground">
                  Nudge Claude Haiku to inspect the canvas right now.
                </p>
              </div>
              <AskAiButton
                askAvailableAt={state.round?.askAvailableAt ?? 0}
                now={now}
                isSpectator={isSpectator}
                aiResting={state.aiResting}
                roundPlaying={Boolean(roundPlaying)}
                onAsk={ask}
              />
            </div>
          </div>

          {/* Minimalist Pixel Economy Rules Card */}
          <div className="arcade-card rounded-lg bg-card/80 p-3.5 text-xs">
            <div className="mb-2 flex items-center gap-1.5 font-bold uppercase tracking-wider text-amber-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="font-pixel">Less Ink = More Points</span>
            </div>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Minimalist bonus:</strong> The fewer pixels on the 32×32 grid when the AI guesses the word, the higher everyone&apos;s score.
              </li>
              <li>
                <strong className="text-foreground">Speed bonus:</strong> Fast guesses earn extra points before the 5-minute clock runs out.
              </li>
              <li>
                <strong className="text-foreground">Shared victory:</strong> Every painter who placed at least one pixel on the winning canvas earns full round points!
              </li>
            </ul>
          </div>
        </div>
      </div>

      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}
