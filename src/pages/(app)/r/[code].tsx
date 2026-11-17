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
  Copy,
  Eye,
  FastForward,
  Lock,
  LogIn,
  SearchX,
  Sparkles,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react'
import { AskAiButton } from '../../../components/game/AskAiButton'
import { GuessFeed } from '../../../components/game/GuessFeed'
import { Palette } from '../../../components/game/Palette'
import { PixelCanvas } from '../../../components/game/PixelCanvas'
import { PlayerCursors } from '../../../components/game/PlayerCursors'
import { RoundBar } from '../../../components/game/RoundBar'
import { Button } from '../../../components/ui'
import { roomAccessView, type RejectMsg } from '../../../game/client-state'
import { MODES } from '../../../game/config'
import { contributorLabel } from '../../../game/contributor-label'
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
    case 'rate_limited':
      return 'Painting too quickly — try again in a moment.'
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

function InviteBadge({ code }: { code: string }) {
  const [copyStatus, setCopyStatus] = useState('Copy link')
  return (
    <div className="flex items-center gap-2">
      <span data-testid="room-code" className="font-pixel rounded-md border-2 border-amber-400 bg-amber-400/10 px-3 py-1 text-lg font-extrabold tracking-widest text-amber-300" aria-label={`Room code ${code}`}>
        {code}
      </span>
      <Button type="button" variant="secondary" size="sm" className="arcade-btn gap-1.5" data-testid="copy-room-link" onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(`/r/${encodeURIComponent(code)}`, window.location.origin).href)
          setCopyStatus('Copied!')
        } catch { setCopyStatus('Could not copy') }
      }}>
        <Copy className="h-3.5 w-3.5" aria-hidden />
        <span aria-live="polite">{copyStatus}</span>
      </Button>
    </div>
  )
}

export default function RoomPage() {
  const { code = 'play' } = useParams<{ code: string }>()
  const rawCode = code.trim() || 'play'
  const joinCode = rawCode.toLowerCase() === 'play' ? 'play' : rawCode.toUpperCase()

  const { isSignedIn, user } = useAuthProfileReady({ requireUser: false })
  const { getName } = useUserLookup()

  const { state, sessionExpired, place, ask, next } = usePixelRoom(joinCode)
  const { peers, updateState: updatePresence } = usePresenceRoom(`pixel:${joinCode}`)

  const { records: roomRecords } = useQuery<RoomRecord>('rooms', {
    where: { joinCode },
    limit: 1,
  })
  const roomDoc = roomRecords[0]

  const { records: roundRecords } = useQuery<RoundRecord>('rounds', {
    where: { roundId: state.round?.id ?? '__none__' },
    limit: 1,
  })
  const currentRoundDoc = useMemo(
    () => (state.round?.id ? roundRecords.find((r) => r.data.roundId === state.round?.id) : undefined),
    [roundRecords, state.round?.id],
  )

  const [activeColor, setActiveColor] = useState<number>(4) // Default red
  const [now, setNow] = useState<number>(() => Date.now())
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [dismissedOverlayRoundId, setDismissedOverlayRoundId] = useState<string | null>(null)
  const lastPresenceSentRef = useRef<number>(0)
  const trailingCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayDialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 100)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    return () => {
      if (trailingCursorTimerRef.current) {
        clearTimeout(trailingCursorTimerRef.current)
      }
    }
  }, [])

  const handleHoverCell = useCallback(
    (cell: { x: number; y: number } | null) => {
      if (trailingCursorTimerRef.current) {
        clearTimeout(trailingCursorTimerRef.current)
        trailingCursorTimerRef.current = null
      }
      if (!cell) {
        lastPresenceSentRef.current = Date.now()
        updatePresence({ cursor: null })
        return
      }
      const t = Date.now()
      const elapsed = t - lastPresenceSentRef.current
      if (elapsed >= 100) {
        lastPresenceSentRef.current = t
        updatePresence({ cursor: { x: cell.x, y: cell.y } })
      } else {
        trailingCursorTimerRef.current = setTimeout(() => {
          trailingCursorTimerRef.current = null
          lastPresenceSentRef.current = Date.now()
          updatePresence({ cursor: { x: cell.x, y: cell.y } })
        }, 100 - elapsed)
      }
    },
    [updatePresence],
  )

  const isSpectator = state.snapshotLoaded ? !state.you.userId : !isSignedIn
  const roundPlaying = state.round?.state === 'playing'
  const canDraw = Boolean(state.you.userId) && Boolean(roundPlaying)
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
      if (isSpectator) {
        setShowAuthModal(true)
        return
      }
      if (!canDraw) return
      place(x, y, color)
    },
    [isSpectator, canDraw, place],
  )

  const friendlyReject = rejectMessage(state.lastReject, now)

  const contributorInfo = useMemo(() => {
    const rawIds = currentRoundDoc?.data.contributorIds
    const ids = Array.isArray(rawIds) ? rawIds : []
    if (ids.length > 0) {
      return {
        names: ids.map(
          (id) => getName(id) || (id === user?.id ? user.name || 'You' : `Painter ${id.slice(0, 5)}`),
        ),
        fallbackText: null as string | null,
      }
    }
    const usedPx = currentRoundDoc?.data.pixelsUsed ?? pixelsCount
    if (usedPx > 0) {
      const painterCount = state.round?.result?.contributorCount ?? currentRoundDoc?.data.contributorIds?.length
      return {
        names: [] as string[],
        fallbackText: contributorLabel(painterCount, usedPx),
      }
    }
    return {
      names: [] as string[],
      fallbackText: 'No pixels placed this round.',
    }
  }, [currentRoundDoc, getName, pixelsCount, state.round?.result?.contributorCount, user])

  const intermissionRemainingSec = useMemo(() => {
    if (state.round?.state !== 'intermission' || !state.round.endedAt) return 0
    const endsAt = state.round.endedAt + MODES[state.mode].intermissionMs
    return Math.max(0, Math.ceil((endsAt - now) / 1000))
  }, [state.round, state.mode, now])

  const showOverlay =
    state.round?.state === 'intermission' &&
    state.round.result != null &&
    dismissedOverlayRoundId !== state.round.id
  const outcome = state.round?.result?.outcome

  useEffect(() => {
    if (showOverlay) {
      overlayDialogRef.current?.focus()
    }
  }, [showOverlay])

  const accessView = roomAccessView(state)
  if (accessView === 'loading') {
    return <div role="status" data-testid="room-loading" className="mx-auto max-w-2xl px-4 py-10 text-center text-muted-foreground">Connecting…</div>
  }

  // Terminal connection states (401 private room, 404 unknown room, 410 closed room)
  if (state.connectError) {
    return (
      <div
        data-testid="room-page"
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10 sm:px-6"
      >
        <Link
          to="/party"
          className="font-pixel inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Lobby
        </Link>

        {state.connectError === 'unauthorized' && (
          <div
            data-testid="room-error-unauthorized"
            className="arcade-card flex flex-col items-center gap-4 rounded-xl border-2 border-amber-400 bg-card p-6 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/20 ring-2 ring-amber-400">
              <Lock className="h-6 w-6 text-amber-300" aria-hidden />
            </div>
            <div className="space-y-1">
              <h1 className="font-pixel text-xl font-extrabold uppercase text-foreground">
                Private Room — Sign In Required
              </h1>
              <p className="text-sm text-muted-foreground">
                Invite room <span className="font-pixel text-amber-300">{joinCode}</span> is private.
                Sign in with your account to join the board.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                type="button"
                data-testid="room-error-sign-in"
                onClick={() => setShowAuthModal(true)}
                className="arcade-btn font-pixel bg-amber-400 px-5 font-extrabold uppercase text-slate-950 hover:bg-amber-300"
              >
                <LogIn className="mr-2 h-4 w-4" aria-hidden />
                Sign in to join
              </Button>
              <Link
                to="/party"
                className="arcade-btn font-pixel inline-flex h-10 items-center justify-center rounded-md bg-secondary px-4 text-xs font-bold text-secondary-foreground hover:bg-secondary/80"
              >
                Back to Lobby
              </Link>
            </div>
          </div>
        )}

        {state.connectError === 'not_found' && (
          <div
            data-testid="room-error-not-found"
            className="arcade-card flex flex-col items-center gap-4 rounded-xl border-2 border-rose-400/80 bg-card p-6 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20 ring-2 ring-rose-400">
              <SearchX className="h-6 w-6 text-rose-300" aria-hidden />
            </div>
            <div className="space-y-1">
              <h1 className="font-pixel text-xl font-extrabold uppercase text-foreground">
                Room Not Found
              </h1>
              <p className="text-sm text-muted-foreground">
                No room exists for code <span className="font-pixel text-rose-300">{joinCode}</span>.
                Check the invite code or jump into an active board from the lobby.
              </p>
            </div>
            <Link
              to="/party"
              className="arcade-btn font-pixel inline-flex h-10 items-center justify-center rounded-md bg-amber-400 px-5 text-sm font-extrabold uppercase text-slate-950 hover:bg-amber-300"
            >
              Back to Lobby
            </Link>
          </div>
        )}

        {state.connectError === 'closed' && (
          <div
            data-testid="room-error-closed"
            className="arcade-card flex flex-col items-center gap-4 rounded-xl border-2 border-border bg-card p-6 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary ring-2 ring-border">
              <XCircle className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <h1 className="font-pixel text-xl font-extrabold uppercase text-foreground">
                This Room Has Closed
              </h1>
              <p className="text-sm text-muted-foreground">
                Room <span className="font-pixel text-amber-300">{joinCode}</span> has ended. Head
                back to the lobby to join the main board or start a new room.
              </p>
            </div>
            <Link
              to="/party"
              className="arcade-btn font-pixel inline-flex h-10 items-center justify-center rounded-md bg-amber-400 px-5 text-sm font-extrabold uppercase text-slate-950 hover:bg-amber-300"
            >
              Back to Lobby
            </Link>
          </div>
        )}

        {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
      </div>
    )
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        to="/party"
        className="font-pixel inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to Lobby
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        {(roomDoc?.data.visibility === 'private' || state.round?.state === 'lobby') && <InviteBadge code={roomDoc?.data.joinCode ?? joinCode} />}
        {isHost && state.round?.state !== 'lobby' && (
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
  )

  if (state.round?.state === 'lobby') {
    return (
      <div data-testid="room-page" className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
        {header}
        <div data-testid="room-lobby" className="arcade-card space-y-4 rounded-lg bg-card p-5">
          <h1 className="font-pixel text-xl font-bold">{roomDoc?.data.name ?? 'Waiting room'}</h1>
          <p className="text-sm text-muted-foreground">Share the room link and start whenever you’re ready.</p>
          <h2 data-testid="round-players" className="font-pixel font-bold">{state.players} {state.players === 1 ? 'painter' : 'painters'}</h2>
          <ul className="space-y-2" aria-label="Connected players">
            {state.roster.map(player => <li key={player.userId} className="rounded bg-secondary px-3 py-2 text-sm">{player.name}{player.userId === roomDoc?.data.hostId ? ' (Host)' : ''}</li>)}
          </ul>
          {isHost ? (
            <Button data-testid="host-start-button" disabled={!state.connected} onClick={next} className="arcade-btn font-pixel bg-amber-400 font-bold text-slate-950 hover:bg-amber-300">Start</Button>
          ) : <p className="text-sm text-muted-foreground">Waiting for the host to start.</p>}
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="room-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4"
    >
      {header}

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

      {sessionExpired && <div role="status" data-testid="session-expired">Your session expired — sign in again</div>}

      {/* Spectator Sign-In Banner */}
      {isSpectator && (
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
          {state.lastReject?.reason === 'not_signed_in' && isSpectator && (
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
            word={state.round?.word}
            onPlace={handlePlace}
            onHoverCell={handleHoverCell}
          >
            <PlayerCursors peers={peers} width={state.width} height={state.height} />

            {/* Win / Timeout Intermission Overlay */}
            {showOverlay && state.round && (
              <div
                ref={overlayDialogRef}
                data-testid="round-overlay"
                role="dialog"
                aria-modal="false"
                aria-labelledby="overlay-heading"
                tabIndex={-1}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && state.round?.id) {
                    e.stopPropagation()
                    setDismissedOverlayRoundId(state.round.id)
                  }
                }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center backdrop-blur-xs focus:outline-none"
              >
                <div className="arcade-card flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border-2 border-amber-400 bg-[#1b1530] p-5 shadow-2xl">
                  {outcome === 'won' ? (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-400">
                        <Trophy className="h-6 w-6 text-emerald-400" aria-hidden />
                      </div>
                      <span
                        id="overlay-heading"
                        className="font-pixel rounded bg-emerald-500/20 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-widest text-emerald-300"
                      >
                        AI Guessed It!
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 ring-2 ring-amber-400">
                        <Clock className="h-6 w-6 text-amber-400" aria-hidden />
                      </div>
                      <span
                        id="overlay-heading"
                        className="font-pixel rounded bg-amber-500/20 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-widest text-amber-300"
                      >
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
                    {contributorInfo.names.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {contributorInfo.names.map((name, idx) => (
                          <span
                            key={`${name}-${idx}`}
                            className="font-pixel rounded bg-secondary px-2 py-0.5 text-xs font-bold text-foreground"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="font-pixel text-xs text-foreground">
                        {contributorInfo.fallbackText}
                      </p>
                    )}
                  </div>

                  <div className="mt-1 flex w-full flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-pixel">
                      Next word in {intermissionRemainingSec}s…
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        data-testid="overlay-dismiss"
                        onClick={() => state.round?.id && setDismissedOverlayRoundId(state.round.id)}
                        className="arcade-btn font-pixel h-8 gap-1 px-2.5 text-xs font-bold"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        View Canvas
                      </Button>
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
              <span className="font-pixel">1000-Pt Scoring Formula</span>
            </div>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">50% Pixel Economy (up to 500 pts):</strong>{' '}
                Fewer non-empty pixels on the 32×32 grid (1,024 cells) when the AI guesses right means a higher economy score.
              </li>
              <li>
                <strong className="text-foreground">50% Speed (up to 500 pts):</strong>{' '}
                Faster wins against the 5-minute round clock earn the remaining half of the 1,000 points.
              </li>
              <li>
                <strong className="text-foreground">Shared Victory:</strong>{' '}
                Every contributor whose pixels remain on the final winning canvas receives the full round score.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}
