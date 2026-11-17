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
  Trophy,
  Users,
  XCircle,
} from 'lucide-react'
import { DeleteRoomButton } from '../../../components/game/DeleteRoomButton'
import { AskAiButton } from '../../../components/game/AskAiButton'
import { GuessFeed } from '../../../components/game/GuessFeed'
import { MuteButton } from '../../../components/game/MuteButton'
import { Palette } from '../../../components/game/Palette'
import { PixelCanvas } from '../../../components/game/PixelCanvas'
import { PlayerCursors } from '../../../components/game/PlayerCursors'
import { PlayersPanel } from '../../../components/game/PlayersPanel'
import { RoundBar } from '../../../components/game/RoundBar'
import { ToolBar } from '../../../components/game/ToolBar'
import { useGameSounds } from '../../../components/game/useGameSounds'
import { Button } from '../../../components/ui'
import { effectiveCooldownUntil, roomAccessView, type RejectMsg } from '../../../game/client-state'
import { contributorLabel } from '../../../game/contributor-label'
import { cooldownMs } from '../../../game/rules'
import { PARTY_TOOLS, pickAt, type Tool } from '../../../game/tools'
import { usePixelRoom } from '../../../hooks/usePixelRoom'
import { useToolShortcuts } from '../../../hooks/useToolShortcuts'

interface RoomRecord {
  name: string
  mode: 'coop' | 'team'
  visibility: 'public' | 'private'
  joinCode: string
  hostId: string
  status: 'lobby' | 'playing' | 'intermission' | 'paused' | 'closed'
  isDefaultBoard: boolean
}

// Space for the canvas/palette gap, frame shadow and page bottom padding.
const CANVAS_BOTTOM_CHROME_PX = 24

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
      return 'The host starts the next round while connected.'
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
      <span
        data-testid="room-code"
        className="pp-chip px-2.5 py-0.5 text-lg tracking-widest"
        aria-label={`Room code ${code}`}
      >
        {code}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="pp-btn h-8 gap-1.5 px-3 text-base uppercase"
        data-testid="copy-room-link"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              new URL(`/r/${encodeURIComponent(code)}`, window.location.origin).href,
            )
            setCopyStatus('Copied!')
          } catch {
            setCopyStatus('Could not copy')
          }
        }}
      >
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
  const { muted, toggleMute } = useGameSounds(state)
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
  const [tool, setTool] = useState<Tool>('paint')
  const [now, setNow] = useState<number>(() => Date.now())
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [dismissedOverlayRoundId, setDismissedOverlayRoundId] = useState<string | null>(null)
  const lastPresenceSentRef = useRef<number>(0)
  const trailingCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayDialogRef = useRef<HTMLDivElement | null>(null)

  const roomPageRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const centerColRef = useRef<HTMLDivElement | null>(null)
  const roundBarWrapRef = useRef<HTMLDivElement | null>(null)
  const canvasSlotRef = useRef<HTMLDivElement | null>(null)
  const paletteWrapRef = useRef<HTMLDivElement | null>(null)
  const [availBox, setAvailBox] = useState<{ width: number; height: number }>({
    width: 640,
    height: 600,
  })

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

  const isSpectator = state.snapshotLoaded ? !state.you.userId : !isSignedIn
  const roundPlaying = state.round?.state === 'playing'
  const canDraw = Boolean(state.you.userId) && Boolean(roundPlaying)
  const cooldownTotalMs = cooldownMs(Math.max(1, state.players))
  const cooldownRemainingMs = Math.max(0, effectiveCooldownUntil(state) - now)
  const friendlyReject = rejectMessage(state.lastReject, now)

  useEffect(() => {
    const measure = () => {
      const col = centerColRef.current
      if (!col) return
      const colWidth = col.clientWidth || Math.max(280, window.innerWidth - 32)
      const slot = canvasSlotRef.current
      // The app shell locks document scrolling; main is the sole scroll container.
      const topOffset = slot
        ? slot.getBoundingClientRect().top + (slot.closest('main')?.scrollTop ?? 0)
        : 140
      const paletteH = paletteWrapRef.current
        ? paletteWrapRef.current.getBoundingClientRect().height
        : 36
      const usedHeight = topOffset + paletteH + CANVAS_BOTTOM_CHROME_PX
      const availHeight = Math.max(200, window.innerHeight - usedHeight)
      setAvailBox((prev) =>
        prev.width === colWidth && prev.height === availHeight
          ? prev
          : { width: colWidth, height: availHeight },
      )
    }

    measure()
    const ro = new ResizeObserver(measure)
    if (roomPageRef.current) ro.observe(roomPageRef.current)
    if (centerColRef.current) ro.observe(centerColRef.current)
    if (headerRef.current) ro.observe(headerRef.current)
    if (roundBarWrapRef.current) ro.observe(roundBarWrapRef.current)
    if (paletteWrapRef.current) ro.observe(paletteWrapRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [
    state.snapshotLoaded,
    state.round?.state,
    isSpectator,
    Boolean(friendlyReject),
    sessionExpired,
    roomDoc?.data.name,
  ])

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

  const hostConnected = state.roster.some(player => player.userId === roomDoc?.data.hostId)
  const canStart = Boolean(state.connected && state.you.userId) && (
    joinCode === 'play' || isHost || (Boolean(roomDoc?.data.hostId) && !hostConnected)
  )

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

  const handlePick = useCallback(
    (x: number, y: number) => {
      if (!canDraw) return
      const picked = pickAt(state.cells, state.width, x, y)
      if (picked.tool === 'erase') {
        setTool('erase')
      } else {
        setActiveColor(picked.color)
        setTool('paint')
      }
    },
    [canDraw, state.cells, state.width],
  )

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

  const showOverlay =
    state.round?.state === 'intermission' &&
    state.round.result != null &&
    dismissedOverlayRoundId !== state.round.id
  const outcome = state.round?.result?.outcome

  useToolShortcuts({
    tools: PARTY_TOOLS,
    onSelect: setTool,
    enabled: canDraw && !showOverlay && !showAuthModal,
  })

  useEffect(() => {
    if (showOverlay) {
      overlayDialogRef.current?.focus()
    }
  }, [showOverlay])

  const accessView = roomAccessView(state)
  if (accessView === 'loading') {
    return (
      <div
        role="status"
        data-testid="room-loading"
        className="mx-auto max-w-2xl px-4 py-10 text-center text-muted-foreground"
      >
        Connecting…
      </div>
    )
  }

  // Terminal connection states (401 private room, 404 unknown room, 410 closed room)
  if (state.connectError) {
    return (
      <div
        data-testid="room-page"
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10 sm:px-6"
      >
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/party"
            className="inline-flex items-center gap-1.5 text-base uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to Lobby
          </Link>
          <MuteButton muted={muted} onToggle={toggleMute} />
        </div>

        {state.connectError === 'unauthorized' && (
          <div
            data-testid="room-error-unauthorized"
            className="pp-panel flex flex-col items-center gap-4 p-6 text-center"
          >
            <div className="pp-chip flex h-12 w-12 items-center justify-center">
              <Lock className="h-6 w-6 text-[var(--sunset-1)]" aria-hidden />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl uppercase text-[var(--sunset-2)]">
                Private Room — Sign In Required
              </h1>
              <p className="text-base text-muted-foreground">
                Invite room <span className="text-[var(--sunset-1)]">{joinCode}</span> is private.
                Sign in with your account to join the board.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                type="button"
                data-testid="room-error-sign-in"
                onClick={() => setShowAuthModal(true)}
                className="pp-btn px-5 text-lg uppercase"
              >
                <LogIn className="mr-2 h-4 w-4" aria-hidden />
                Sign in to join
              </Button>
              <Link
                to="/party"
                className="pp-chip inline-flex h-10 items-center justify-center px-4 text-base uppercase hover:bg-secondary"
              >
                Back to Lobby
              </Link>
            </div>
          </div>
        )}

        {state.connectError === 'not_found' && (
          <div
            data-testid="room-error-not-found"
            className="pp-panel flex flex-col items-center gap-4 p-6 text-center"
          >
            <div className="pp-chip flex h-12 w-12 items-center justify-center">
              <SearchX className="h-6 w-6 text-[var(--sunset-3)]" aria-hidden />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl uppercase text-[var(--sunset-2)]">
                Room Not Found
              </h1>
              <p className="text-base text-muted-foreground">
                No room exists for code <span className="text-[var(--sunset-3)]">{joinCode}</span>.
                Check the invite code or jump into an active board from the lobby.
              </p>
            </div>
            <Link
              to="/party"
              className="pp-btn inline-flex h-10 items-center justify-center px-5 text-lg uppercase"
            >
              Back to Lobby
            </Link>
          </div>
        )}

        {state.connectError === 'closed' && (
          <div
            data-testid="room-error-closed"
            className="pp-panel flex flex-col items-center gap-4 p-6 text-center"
          >
            <div className="pp-chip flex h-12 w-12 items-center justify-center">
              <XCircle className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl uppercase text-[var(--sunset-2)]">
                {state.closedByHost ? 'This room was closed by the host' : 'This Room Has Closed'}
              </h1>
              <p className="text-base text-muted-foreground">
                Room <span className="text-[var(--sunset-1)]">{joinCode}</span> has ended. Head
                back to the lobby to join the main board or start a new room.
              </p>
            </div>
            <Link
              to="/party"
              className="pp-btn inline-flex h-10 items-center justify-center px-5 text-lg uppercase"
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
    <div
      ref={headerRef}
      className="flex flex-wrap items-center justify-between gap-2 leading-none"
    >
      <div className="flex flex-wrap items-baseline gap-3">
        <Link
          to="/party"
          className="inline-flex items-center gap-1 text-base uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Lobby
        </Link>
        <span className="pp-logo text-[28px] leading-none sm:text-[32px]">
          Pixel Party
        </span>
        {roomDoc?.data.name &&
          roomDoc.data.name.trim() !== '' &&
          roomDoc.data.name.trim().toLowerCase() !== 'pixel party' && (
            <span
              data-testid="room-name"
              className="text-xl uppercase text-[var(--soft-text)]"
            >
              {roomDoc.data.name}
            </span>
          )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-base">
        {roomDoc?.data.visibility === 'private' || state.round?.state === 'lobby' ? (
          <InviteBadge code={roomDoc?.data.joinCode ?? joinCode} />
        ) : (
          <span
            data-testid="room-code"
            className="pp-chip uppercase"
            aria-label={`Room code ${roomDoc?.data.joinCode ?? joinCode}`}
          >
            ROOM {roomDoc?.data.joinCode ?? joinCode}
          </span>
        )}
        <span className="pp-chip uppercase">
          {state.players} {state.players === 1 ? 'PLAYER' : 'PLAYERS'}
        </span>
        {isHost && <DeleteRoomButton joinCode={joinCode} />}
        {canStart && state.round?.state !== 'lobby' && (state.round?.state === 'intermission' || isHost) && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="host-next-button"
            onClick={next}
            className="pp-btn h-8 gap-1.5 px-3 text-base uppercase"
          >
            <FastForward className="h-3.5 w-3.5 text-[var(--sunset-1)]" aria-hidden />
            {state.round?.state === 'intermission' ? 'New game' : 'Skip Round'}
          </Button>
        )}
        <MuteButton muted={muted} onToggle={toggleMute} />
      </div>
    </div>
  )

  if (state.round?.state === 'lobby') {
    return (
      <div
        data-testid="room-page"
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6"
      >
        {header}
        <div data-testid="room-lobby" className="pp-panel space-y-4 p-5">
          <h1 className="text-2xl uppercase text-[var(--sunset-2)]">
            {roomDoc?.data.name ?? 'Waiting room'}
          </h1>
          <p className="text-base text-muted-foreground">
            Share the room link and start whenever you’re ready.
          </p>
          <h2 data-testid="round-players" className="text-xl text-[var(--sunset-1)]">
            {state.players} {state.players === 1 ? 'painter' : 'painters'}
          </h2>
          <ul className="space-y-2" aria-label="Connected players">
            {state.roster.map((player) => (
              <li
                key={player.userId}
                className="border border-border bg-secondary px-3 py-2 text-base"
              >
                &gt; {player.name}
                {player.userId === roomDoc?.data.hostId ? ' (Host)' : ''}
              </li>
            ))}
          </ul>
          <p data-testid="round-watching" className="text-base text-muted-foreground">
            {state.watching} watching
          </p>
          {canStart ? (
            <Button
              data-testid="host-start-button"
              disabled={!state.connected}
              onClick={next}
              className="pp-btn px-6 py-2 text-xl uppercase"
            >
              Start
            </Button>
          ) : (
            <p className="text-base text-muted-foreground">
              Waiting for the host to start.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={roomPageRef}
      data-testid="room-page"
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-1.5 px-3 py-2 sm:px-5"
    >
      {header}

      {sessionExpired && (
        <div
          role="status"
          data-testid="session-expired"
          className="pp-panel px-3 py-1.5 text-base text-[var(--sunset-1)]"
        >
          Your session expired — sign in again
        </div>
      )}

      {/* Spectator Sign-In Banner */}
      {isSpectator && (
        <div
          data-testid="spectator-banner"
          className="pp-panel flex flex-wrap items-center justify-between gap-2 px-3 py-1.5"
        >
          <div className="flex items-center gap-2 text-base">
            <LogIn className="h-4 w-4 shrink-0 text-[var(--sunset-1)]" aria-hidden />
            <span className="text-foreground">
              You are watching in <span className="text-[var(--sunset-1)]">Spectator Mode</span>. Sign in to place pixels and ask the AI!
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            data-testid="spectator-sign-in-button"
            onClick={() => setShowAuthModal(true)}
            className="pp-btn h-7 px-3 text-base uppercase"
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
          className="pp-panel flex items-center justify-between gap-2 px-3 py-1.5 text-base text-[var(--sunset-1)]"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-[var(--sunset-2)]" aria-hidden />
            <span>{friendlyReject}</span>
          </div>
          {state.lastReject?.reason === 'not_signed_in' && isSpectator && (
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="underline hover:text-foreground"
            >
              Sign in
            </button>
          )}
        </div>
      )}

      {/* Main Game Stage:
          Desktop (>=1024px): PlayersPanel | Center Column (RoundBar, Canvas, Palette) | GuessFeed + AskAiButton
          Mobile (<1024px): Center Column (RoundBar, Canvas, Palette), GuessFeed + AskAiButton, PlayersPanel */}
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[220px_minmax(0,1fr)_280px] xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        {/* Center Column: RoundBar + PixelCanvas + Palette (order-1 on mobile, order-2 on lg) */}
        <div
          ref={centerColRef}
          className="order-1 flex min-w-0 flex-col items-center gap-2 lg:order-2"
        >
          <div ref={roundBarWrapRef} className="w-full">
            <RoundBar
              round={state.round}
              connected={state.connected}
              now={now}
              joinCode={joinCode}
              pixelsCount={pixelsCount}
            />
          </div>

          <div ref={canvasSlotRef} className="flex items-center justify-center">
            <PixelCanvas
              width={state.width}
              height={state.height}
              cells={state.cells}
              activeColor={activeColor}
              tool={tool}
              canDraw={canDraw}
              cooldownRemainingMs={cooldownRemainingMs}
              availWidth={availBox.width}
              availHeight={availBox.height}
              word={state.round?.word}
              onPlace={handlePlace}
              onPick={handlePick}
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
                  className="pp-results absolute inset-0 z-20 flex flex-col items-center overflow-hidden bg-background/90 p-4 text-center focus:outline-none"
                >
                  <div className="pp-panel my-auto flex max-h-full min-h-0 w-full max-w-sm flex-col overflow-hidden">
                    <div className="pp-results-body flex min-h-0 flex-col items-center gap-3 overflow-y-auto p-5">
                      {outcome === 'won' ? (
                        <>
                          <div className="pp-results-icon pp-chip flex h-12 w-12 shrink-0 items-center justify-center">
                            <Trophy className="h-6 w-6 text-[var(--sunset-1)]" aria-hidden />
                          </div>
                          <span
                            id="overlay-heading"
                            className="pp-chip px-2.5 py-0.5 text-base uppercase tracking-widest"
                          >
                            AI Guessed It!
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="pp-results-icon pp-chip flex h-12 w-12 shrink-0 items-center justify-center">
                            <Clock className="h-6 w-6 text-[var(--sunset-2)]" aria-hidden />
                          </div>
                          <span
                            id="overlay-heading"
                            className="pp-chip px-2.5 py-0.5 text-base uppercase tracking-widest"
                          >
                            Time&apos;s Up!
                          </span>
                        </>
                      )}

                      <div>
                        <p className="text-sm uppercase tracking-wider text-muted-foreground">
                          The word was
                        </p>
                        <h2
                          data-testid="overlay-word"
                          className="pp-results-word pp-word mt-0.5 text-3xl uppercase"
                        >
                          {state.round.word}
                        </h2>
                      </div>

                      <div className="grid w-full shrink-0 grid-cols-2 gap-2 border border-border bg-background/60 p-2.5 text-base">
                        <div className="flex flex-col items-center">
                          <span className="text-muted-foreground">Score</span>
                          <span
                            data-testid="overlay-score"
                            className="mt-0.5 flex items-center gap-1 text-xl text-[var(--sunset-1)]"
                          >
                            <Award className="h-4 w-4" aria-hidden />
                            {state.round.result?.score ?? 0} pts
                          </span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-muted-foreground">Pixels Used</span>
                          <span className="mt-0.5 text-xl text-foreground">
                            {currentRoundDoc?.data.pixelsUsed ?? pixelsCount} px
                          </span>
                        </div>
                      </div>

                      <div
                        data-testid="overlay-contributors"
                        className="w-full shrink-0 border border-border bg-background/40 px-3 py-2 text-left"
                      >
                        <div className="mb-1 flex items-center gap-1.5 text-sm uppercase tracking-wider text-[var(--sunset-2)]">
                          <Users className="h-3.5 w-3.5" aria-hidden />
                          <span>Contributors</span>
                        </div>
                        {contributorInfo.names.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {contributorInfo.names.map((name, idx) => (
                              <span
                                key={`${name}-${idx}`}
                                className="pp-chip px-2 py-0.5 text-sm"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-foreground">
                            {contributorInfo.fallbackText}
                          </p>
                        )}
                      </div>

                    </div>
                    <div className="pp-results-footer flex w-full shrink-0 flex-col items-center gap-2 border-t border-border bg-card p-3 text-sm text-muted-foreground">
                      <span>{canStart ? 'Ready when you are.' : 'Waiting for the host to start a new game.'}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          data-testid="overlay-dismiss"
                          onClick={() =>
                            state.round?.id && setDismissedOverlayRoundId(state.round.id)
                          }
                          className="pp-chip h-8 gap-1 px-2.5 text-sm uppercase hover:bg-secondary"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden />
                          View Canvas
                        </Button>
                        {canStart && (
                          <Button
                            type="button"
                            size="sm"
                            data-testid="overlay-next"
                            onClick={next}
                            className="pp-btn h-8 px-3 text-sm uppercase"
                          >
                            New game
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </PixelCanvas>
          </div>

          <div ref={paletteWrapRef} className="w-full">
            <Palette
              activeColor={activeColor}
              onSelectColor={setActiveColor}
              disabled={isSpectator}
              cooldownRemainingMs={cooldownRemainingMs}
              cooldownTotalMs={cooldownTotalMs}
            />
          </div>
        </div>

        {/* Right Column on lg, 2nd on mobile: GuessFeed with AskAiButton */}
        <div className="order-2 flex flex-col gap-3 lg:order-3">
          <GuessFeed
            guesses={state.guesses}
            guessLog={state.guessLog}
            aiResting={state.aiResting}
            roundId={state.round?.id}
          >
            <AskAiButton
              askAvailableAt={state.round?.askAvailableAt ?? 0}
              now={now}
              isSpectator={isSpectator}
              aiResting={state.aiResting}
              roundPlaying={Boolean(roundPlaying)}
              onAsk={ask}
            />
          </GuessFeed>
        </div>

        {/* Left Column on lg, 3rd on mobile: ToolBar + PlayersPanel */}
        <div className="order-3 flex flex-col gap-3 lg:order-1">
          <ToolBar
            tools={PARTY_TOOLS}
            active={tool}
            onSelect={setTool}
            disabled={isSpectator}
          />
          <PlayersPanel
            players={state.players}
            roster={state.roster}
            watching={state.watching}
          />
        </div>
      </div>

      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}
