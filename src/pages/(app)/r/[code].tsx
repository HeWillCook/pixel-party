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
  ChevronDown,
  Clock,
  Copy,
  Eye,
  FastForward,
  LogIn,
  Trash2,
  Trophy,
  Users,
  WifiOff,
} from 'lucide-react'
import { AskAiButton } from '../../../components/game/AskAiButton'
import { DeleteRoomDialog } from '../../../components/game/DeleteRoomButton'
import { MuteButton } from '../../../components/game/MuteButton'
import { PainterTray } from '../../../components/game/PainterTray'
import { Palette } from '../../../components/game/Palette'
import { PixelCanvas } from '../../../components/game/PixelCanvas'
import { PlayerCursors } from '../../../components/game/PlayerCursors'
import { PlayersPanel } from '../../../components/game/PlayersPanel'
import { ToolBar } from '../../../components/game/ToolBar'
import { useGameSounds } from '../../../components/game/useGameSounds'
import { CriticBubble } from '../../../components/play/CriticBubble'
import { HoverEasel } from '../../../components/play/HoverEasel'
import { PartyScoreNote } from '../../../components/play/PartyScoreNote'
import { PlayLayout } from '../../../components/play/PlayLayout'
import '../../../components/play/room-play.css'
import { StudioBackdrop } from '../../../components/play/StudioBackdrop'
import { StudioSprite } from '../../../components/play/StudioSprite'
import { NeutralPorchLoading } from '../../../components/porch/PorchScene'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui'
import { effectiveCooldownUntil, roomAccessView, type RejectMsg } from '../../../game/client-state'
import { MODES } from '../../../game/config'
import { contributorLabel } from '../../../game/contributor-label'
import { cooldownMs } from '../../../game/rules'
import { coopScoreParts } from '../../../game/scoring'
import { PARTY_TOOLS, pickAt, type Tool } from '../../../game/tools'
import { usePixelRoom } from '../../../hooks/usePixelRoom'
import { useToolShortcuts } from '../../../hooks/useToolShortcuts'
import { studioSprites } from '../../../scene/studio/sprites'

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

// Vertical chrome inside HoverEasel + grid gap + bottom margin (already excluding PixelCanvas's own 20px inset).
const EASEL_AND_TRAY_GAP_PX = 60
const EASEL_HORIZONTAL_CHROME_PX = 40

function formatTimer(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function rejectMessage(reject: RejectMsg | null, now: number): string | null {
  if (!reject) return null
  switch (reject.reason) {
    case 'not_signed_in':
      return 'Sign in to place pixels or ask Haiku.'
    case 'rate_limited':
      return 'Painting too quickly — try again in a moment.'
    case 'cooldown': {
      const wait = reject.retryAt ? Math.max(0.1, (reject.retryAt - now) / 1000) : 0.2
      return `Brush cooling down — ready in ${wait.toFixed(1)}s`
    }
    case 'ask_too_soon': {
      const wait = reject.retryAt ? Math.max(1, Math.ceil((reject.retryAt - now) / 1000)) : 5
      return `Hold on! You can ask Haiku again in ${wait}s.`
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
    <div className="room-invite-ticket">
      <span
        data-testid="room-code"
        className="room-invite-ticket__code uppercase"
        aria-label={`Room code ${code}`}
      >
        {code}
      </span>
      <button
        type="button"
        className="room-invite-ticket__copy inline-flex cursor-pointer items-center gap-1.5 text-base uppercase"
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
        <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span aria-live="polite">{copyStatus}</span>
      </button>
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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [dismissedOverlayRoundId, setDismissedOverlayRoundId] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const askingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastGuessCountRef = useRef<number>(state.guessLog.length)
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
    width: 600,
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
      if (askingTimerRef.current) {
        clearTimeout(askingTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (state.guessLog.length !== lastGuessCountRef.current) {
      lastGuessCountRef.current = state.guessLog.length
      if (asking) {
        setAsking(false)
        if (askingTimerRef.current) {
          clearTimeout(askingTimerRef.current)
          askingTimerRef.current = null
        }
      }
    }
  }, [asking, state.guessLog.length])

  useEffect(() => {
    if (!asking) return
    if (state.aiResting || state.round?.state !== 'playing' || state.lastReject) {
      setAsking(false)
      if (askingTimerRef.current) {
        clearTimeout(askingTimerRef.current)
        askingTimerRef.current = null
      }
    }
  }, [asking, state.aiResting, state.lastReject, state.round?.state])

  const handleAsk = useCallback(() => {
    setAsking(true)
    if (askingTimerRef.current) clearTimeout(askingTimerRef.current)
    askingTimerRef.current = setTimeout(() => {
      setAsking(false)
      askingTimerRef.current = null
    }, 5000)
    ask()
  }, [ask])

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
      const availWidth = Math.max(200, colWidth - EASEL_HORIZONTAL_CHROME_PX)
      const slot = canvasSlotRef.current
      // The app shell locks document scrolling; main is the sole scroll container.
      const topOffset = slot
        ? slot.getBoundingClientRect().top + (slot.closest('main')?.scrollTop ?? 0)
        : 120
      const paletteH = paletteWrapRef.current
        ? paletteWrapRef.current.getBoundingClientRect().height
        : 104
      const wide = window.innerWidth >= 768
      const availHeight = wide
        ? Math.max(200, window.innerHeight - topOffset - paletteH - EASEL_AND_TRAY_GAP_PX)
        : Math.max(288, availWidth)
      setAvailBox((prev) =>
        prev.width === availWidth && prev.height === availHeight
          ? prev
          : { width: availWidth, height: availHeight },
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
    state.connected,
    isSpectator,
    Boolean(friendlyReject),
    sessionExpired,
    roomDoc?.data.name,
    cooldownRemainingMs > 0,
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

  const confirmedPixelsCount = useMemo(() => {
    let count = 0
    for (let i = 0; i < state.cells.length; i++) {
      const value = state.pending.has(i) ? state.pending.get(i)! : state.cells[i]
      if (value !== 0) count++
    }
    return count
  }, [state.cells, state.pending])

  const isHost =
    Boolean(user?.id) &&
    Boolean(roomDoc?.data.hostId) &&
    !roomDoc?.data.isDefaultBoard &&
    joinCode !== 'play' &&
    roomDoc?.data.hostId === user?.id

  const hostConnected = state.roster.some((player) => player.userId === roomDoc?.data.hostId)
  const canStart =
    Boolean(state.connected && state.you.userId) &&
    (joinCode === 'play' || isHost || (Boolean(roomDoc?.data.hostId) && !hostConnected))

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
    const usedPx = currentRoundDoc?.data.pixelsUsed ?? confirmedPixelsCount
    if (usedPx > 0) {
      const painterCount =
        state.round?.result?.contributorCount ?? currentRoundDoc?.data.contributorIds?.length
      return {
        names: [] as string[],
        fallbackText: contributorLabel(painterCount, usedPx),
      }
    }
    return {
      names: [] as string[],
      fallbackText: 'No pixels placed this round.',
    }
  }, [currentRoundDoc, getName, confirmedPixelsCount, state.round?.result?.contributorCount, user])

  const showOverlay =
    state.round?.state === 'intermission' &&
    state.round.result != null &&
    dismissedOverlayRoundId !== state.round.id
  const outcome = state.round?.result?.outcome

  const roundPixelsUsed = currentRoundDoc?.data.pixelsUsed ?? confirmedPixelsCount
  const roundDurationMs = useMemo(() => {
    if (currentRoundDoc?.data.durationMs != null) return currentRoundDoc.data.durationMs
    const round = state.round
    if (!round) return MODES[state.mode].capMs
    if (round.endedAt != null) return Math.max(0, round.endedAt - round.startedAt)
    return MODES[state.mode].capMs
  }, [currentRoundDoc?.data.durationMs, state.mode, state.round])

  const baseParts = useMemo(() => {
    if (outcome !== 'won') return { pixels: 0, time: 0, total: 0 }
    return coopScoreParts({
      pixelsUsed: roundPixelsUsed,
      totalCells: state.width * state.height,
      durationMs: roundDurationMs,
      capMs: MODES[state.mode].capMs,
    })
  }, [outcome, roundPixelsUsed, roundDurationMs, state.mode, state.width, state.height])

  const shownTotal =
    outcome === 'won'
      ? (state.round?.result?.score ?? baseParts.total)
      : (state.round?.result?.score ?? 0)

  const scoreParts = useMemo(() => {
    if (outcome !== 'won') return { pixels: 0, time: 0, total: shownTotal }
    if (shownTotal === baseParts.total) return baseParts
    const pixels = Math.max(
      Math.max(0, shownTotal - 500),
      Math.min(500, Math.min(shownTotal, baseParts.pixels)),
    )
    return { pixels, time: shownTotal - pixels, total: shownTotal }
  }, [outcome, shownTotal, baseParts])

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
      <div className="porch-home">
        <NeutralPorchLoading testId="room-loading" />
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
            className="pp-chip inline-flex items-center gap-1.5 text-base uppercase tracking-wider hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Studio
          </Link>
          <MuteButton muted={muted} onToggle={toggleMute} />
        </div>

        {state.connectError === 'unauthorized' && (
          <div
            data-testid="room-error-unauthorized"
            className="pp-panel flex flex-col items-center gap-4 p-6 text-center"
          >
            <div className="pp-chip flex items-center justify-center p-2">
              <StudioSprite sprite={studioSprites.errorLocked} scale={3} />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl uppercase text-[var(--sunset-2)]">
                Private Studio Room — Sign In Required
              </h1>
              <p className="text-base text-muted-foreground">
                Invite room <span className="text-[var(--sunset-1)]">{joinCode}</span> is locked behind the studio door.
                Sign in with your account to pull up a stool.
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
                data-testid="room-exit"
                className="pp-chip inline-flex h-10 items-center justify-center gap-1.5 px-4 text-base uppercase hover:bg-secondary"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back downstairs to the studio
              </Link>
            </div>
          </div>
        )}

        {state.connectError === 'not_found' && (
          <div
            data-testid="room-error-not-found"
            className="pp-panel flex flex-col items-center gap-4 p-6 text-center"
          >
            <div className="pp-chip flex items-center justify-center p-2">
              <StudioSprite sprite={studioSprites.errorNotFound} scale={3} />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl uppercase text-[var(--sunset-2)]">
                Easel Not Found
              </h1>
              <p className="text-base text-muted-foreground">
                No studio easel exists for code <span className="text-[var(--sunset-3)]">{joinCode}</span>.
                Check the ticket code or head back downstairs to the studio.
              </p>
            </div>
            <Link
              to="/party"
              data-testid="room-exit"
              className="pp-btn inline-flex h-10 items-center justify-center gap-1.5 px-5 text-lg uppercase"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back downstairs to the studio
            </Link>
          </div>
        )}

        {state.connectError === 'closed' && (
          <div
            data-testid="room-error-closed"
            className="pp-panel flex flex-col items-center gap-4 p-6 text-center"
          >
            <div className="pp-chip flex items-center justify-center p-2">
              <StudioSprite sprite={studioSprites.errorClosed} scale={3} />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl uppercase text-[var(--sunset-2)]">
                {state.closedByHost ? 'This room was closed by the host' : 'This Room Has Closed'}
              </h1>
              <p className="text-base text-muted-foreground">
                Room <span className="text-[var(--sunset-1)]">{joinCode}</span> has been packed up. Head
                back downstairs to the studio to join another easel or set up a new one.
              </p>
            </div>
            <Link
              to="/party"
              data-testid="room-exit"
              className="pp-btn inline-flex h-10 items-center justify-center gap-1.5 px-5 text-lg uppercase"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back downstairs to the studio
            </Link>
          </div>
        )}

        {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
      </div>
    )
  }

  const customRoomName =
    roomDoc?.data.name &&
    roomDoc.data.name.trim() !== '' &&
    roomDoc.data.name.trim().toLowerCase() !== 'pixel party'
      ? roomDoc.data.name
      : null

  const effectiveCode = roomDoc?.data.joinCode ?? joinCode
  const inviteTicket =
    effectiveCode !== 'play' ? (
      <InviteBadge code={effectiveCode} />
    ) : (
      <span
        data-testid="room-code"
        className="pp-chip uppercase"
        aria-label={`Room code ${effectiveCode}`}
      >
        ROOM {effectiveCode}
      </span>
    )

  const showIntermissionNext = canStart && state.round?.state === 'intermission'
  const showPlayingSkip =
    canStart && (state.round?.state === 'playing' || state.round?.state === 'paused')

  const roomControls = (
    <div className="flex items-center gap-2 text-base">
      {showIntermissionNext && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="host-next-button"
          onClick={next}
          className="pp-btn h-8 gap-1.5 px-3 text-base uppercase"
        >
          <FastForward className="h-3.5 w-3.5 text-[var(--sunset-1)]" aria-hidden />
          New game
        </Button>
      )}
      {isHost && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid="host-menu-button"
                  className="pp-chip h-8 gap-1 px-2.5 text-base uppercase text-foreground hover:bg-secondary"
                >
                  Host
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-[10.5rem]">
              {showPlayingSkip && (
                <>
                  <DropdownMenuItem
                    data-testid="host-next-button"
                    onClick={next}
                    className="cursor-pointer gap-2 text-base uppercase"
                  >
                    <FastForward className="h-3.5 w-3.5 text-[var(--sunset-1)]" aria-hidden />
                    Skip round
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                variant="destructive"
                data-testid="delete-room-button"
                onClick={() => setDeleteOpen(true)}
                className="pp-danger cursor-pointer gap-2 text-base uppercase"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete room
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteRoomDialog joinCode={joinCode} open={deleteOpen} onOpenChange={setDeleteOpen} />
        </>
      )}
      <MuteButton muted={muted} onToggle={toggleMute} />
    </div>
  )

  if (state.round?.state === 'lobby') {
    return (
      <div
        data-testid="room-page"
        className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6"
      >
        <div className="pp-panel room-top-bar">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/party"
              data-testid="room-exit"
              className="pp-chip inline-flex items-center gap-1.5 text-base uppercase tracking-wider hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back downstairs to the studio
            </Link>
            {inviteTicket}
            {customRoomName && (
              <span data-testid="room-name" className="text-xl uppercase text-[var(--soft-text)]">
                {customRoomName}
              </span>
            )}
          </div>
          {roomControls}
        </div>

        <div data-testid="room-lobby" className="pp-panel room-lobby-card space-y-4 p-5">
          <div className="room-lobby-stage">
            <div className="room-lobby-easel">
              <StudioSprite sprite={studioSprites.lobbyEasel} scale={3} />
              <div className="space-y-1">
                <h1 className="text-2xl uppercase text-[var(--sunset-2)]">
                  {roomDoc?.data.name ?? 'Studio Waiting Area'}
                </h1>
                <p className="text-base text-muted-foreground">
                  Share the room link and start painting whenever your crew is seated.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <h2 data-testid="round-players" className="text-xl text-[var(--sunset-1)]">
                    {state.players} {state.players === 1 ? 'painter' : 'painters'}
                  </h2>
                  <span data-testid="round-watching" className="text-base text-muted-foreground">
                    {state.watching} watching
                  </span>
                </div>
              </div>
            </div>

            {canStart ? (
              <Button
                data-testid="host-start-button"
                disabled={!state.connected}
                onClick={next}
                className="pp-btn px-6 py-2 text-xl uppercase"
              >
                Start painting
              </Button>
            ) : (
              <p className="text-base text-muted-foreground">
                Waiting for the host to start.
              </p>
            )}
          </div>

          <ul className="room-lobby-stools" aria-label="Connected players">
            {state.roster.map((player) => (
              <li
                key={player.userId}
                data-testid="lobby-stool"
                className="room-lobby-stool"
              >
                <StudioSprite sprite={studioSprites.stool} scale={3} />
                <span className="room-lobby-stool__name">
                  {player.name}
                  {player.userId === roomDoc?.data.hostId ? ' (Host)' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  const remainingMs =
    state.round?.endsAt != null && state.round.state === 'playing'
      ? Math.max(0, state.round.endsAt - now)
      : 0

  const topSlot = (
    <>
      <div ref={headerRef} className="pp-panel room-top-bar">
        <div className="flex flex-wrap items-center gap-2.5">
          {inviteTicket}
          {customRoomName ? (
            <span data-testid="room-name" className="text-xl uppercase text-[var(--soft-text)]">
              {customRoomName}
            </span>
          ) : (
            <span className="text-xl uppercase text-[var(--soft-text)]">Public Studio Board</span>
          )}
        </div>
        {roomControls}
      </div>

      {sessionExpired && (
        <div
          role="status"
          data-testid="session-expired"
          className="pp-panel px-3 py-1 text-base text-[var(--sunset-1)]"
        >
          Your session expired — sign in again
        </div>
      )}

      {isSpectator && (
        <div
          data-testid="spectator-banner"
          className="pp-panel flex flex-wrap items-center justify-between gap-2 px-3 py-1"
        >
          <div className="flex items-center gap-2 text-base">
            <LogIn className="h-4 w-4 shrink-0 text-[var(--sunset-1)]" aria-hidden />
            <span className="text-foreground">
              You are watching in <span className="text-[var(--sunset-1)]">Spectator Mode</span>. Sign in to place pixels and ask Haiku!
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

      {friendlyReject && (
        <div
          data-testid="reject-notice"
          role="status"
          className="pp-panel flex items-center justify-between gap-2 px-3 py-1 text-base text-[var(--sunset-1)]"
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
    </>
  )

  const promptSlot = (
    <div ref={roundBarWrapRef} data-testid="round-bar" className="pp-panel play-prompt">
      <div className="flex w-full items-center justify-between gap-2">
        <span className="play-prompt__heading">Draw</span>
        {!state.connected && (
          <span
            data-testid="round-reconnecting"
            className="pp-chip inline-flex items-center gap-1 text-sm uppercase"
          >
            <WifiOff className="h-3.5 w-3.5 text-[var(--sunset-2)]" aria-hidden />
            Reconnecting…
          </span>
        )}
      </div>
      <span
        data-testid="round-word"
        className="pp-word text-[30px] uppercase leading-none"
      >
        {state.round ? state.round.word : 'LOADING…'}
      </span>
      <div className="flex w-full items-center justify-between gap-2 border-t-2 border-[#d1b5a3] pt-1.5 text-lg leading-none text-[var(--soft-text)]">
        {state.round?.state === 'paused' ? (
          <span data-testid="round-timer" className="uppercase text-[var(--sunset-1)]">
            PAUSED
          </span>
        ) : state.round?.state === 'intermission' ? (
          <span data-testid="round-timer" className="uppercase text-[var(--sunset-3)]">
            ROUND OVER
          </span>
        ) : (
          <span data-testid="round-timer" title="Time remaining in round">
            {state.round ? formatTimer(remainingMs) : '--:--'}
          </span>
        )}
        <span data-testid="round-pixels" className="uppercase">
          {pixelsCount} PX
        </span>
      </div>
    </div>
  )

  const timelineSlot = (
    <PlayersPanel
      players={state.players}
      roster={state.roster}
      watching={state.watching}
    />
  )

  const exitSlot = (
    <Link
      to="/party"
      data-testid="room-exit"
      className="room-exit room-exit--full"
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
      <span>Back downstairs to the studio</span>
    </Link>
  )

  const canvasSlot = (
    <div ref={centerColRef} className="flex w-full min-w-0 justify-center">
      <div ref={canvasSlotRef} className="flex items-center justify-center">
        <HoverEasel>
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
                className="pp-results absolute inset-0 z-20 flex flex-col items-center overflow-hidden bg-background/90 p-3 text-center focus:outline-none"
              >
                <div className="pp-panel room-results-frame my-auto flex max-h-full min-h-0 w-full max-w-sm flex-col overflow-hidden">
                  <div className="pp-results-body flex min-h-0 flex-col items-center gap-2 overflow-y-auto p-4">
                    {outcome === 'won' ? (
                      <>
                        <div className="pp-results-icon pp-chip flex h-10 w-10 shrink-0 items-center justify-center">
                          <Trophy className="h-5 w-5 text-[var(--sunset-1)]" aria-hidden />
                        </div>
                        <span
                          id="overlay-heading"
                          className="pp-chip px-2.5 py-0.5 text-sm uppercase tracking-widest"
                        >
                          Haiku Guessed It!
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="pp-results-icon pp-chip flex h-10 w-10 shrink-0 items-center justify-center">
                          <Clock className="h-5 w-5 text-[var(--sunset-2)]" aria-hidden />
                        </div>
                        <span
                          id="overlay-heading"
                          className="pp-chip px-2.5 py-0.5 text-sm uppercase tracking-widest"
                        >
                          Time&apos;s Up!
                        </span>
                      </>
                    )}

                    <div>
                      <p className="room-results-label-word text-xs uppercase tracking-wider text-muted-foreground">
                        The word was
                      </p>
                      <h2
                        data-testid="overlay-word"
                        className="pp-results-word pp-word mt-0.5 text-2xl uppercase"
                      >
                        {state.round.word}
                      </h2>
                    </div>

                    <div className="room-results-stats text-sm">
                      <div className="room-results-stat">
                        <span className="text-muted-foreground">Score</span>
                        <span
                          data-testid="overlay-score"
                          className="mt-0.5 flex items-center gap-1 text-lg text-[var(--sunset-1)]"
                        >
                          <Award className="h-4 w-4" aria-hidden />
                          {scoreParts.total} pts
                        </span>
                      </div>
                      <div className="room-results-stat">
                        <span className="text-muted-foreground">Pixels Used</span>
                        <span className="mt-0.5 text-lg text-foreground">
                          {roundPixelsUsed} px
                        </span>
                      </div>
                      <div className="col-span-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 border-t border-[#d1b5a3] pt-1 text-xs text-[var(--soft-text)]">
                        <span>Pixels saved: {scoreParts.pixels}/500</span>
                        <span>Time saved: {scoreParts.time}/500</span>
                      </div>
                    </div>

                    <div
                      data-testid="overlay-contributors"
                      className="w-full shrink-0 border border-border bg-background/40 px-2.5 py-1.5 text-left"
                    >
                      <div className="mb-0.5 flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--sunset-2)]">
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        <span>Contributors</span>
                      </div>
                      {contributorInfo.names.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {contributorInfo.names.map((name, idx) => (
                            <span
                              key={`${name}-${idx}`}
                              className="pp-chip px-1.5 py-0.5 text-xs"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-foreground">
                          {contributorInfo.fallbackText}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="pp-results-footer flex w-full shrink-0 flex-col items-center gap-1.5 border-t border-border p-2.5 text-xs text-muted-foreground">
                    <span>
                      {canStart ? 'Ready when you are.' : 'Waiting for the host to start a new game.'}
                    </span>
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
        </HoverEasel>
      </div>
    </div>
  )

  const scoreSlot = (
    <div className="flex min-w-0 flex-col">
      <CriticBubble
        guesses={state.guesses}
        guessLog={state.guessLog}
        aiResting={state.aiResting}
        roundId={state.round?.id}
        roundState={state.round?.state}
        outcome={outcome}
        asking={asking}
      />
      <PartyScoreNote />
    </div>
  )

  const actionsSlot = (
    <div className="room-bell-shelf">
      <div className="play-actions">
        <AskAiButton
          askAvailableAt={state.round?.askAvailableAt ?? 0}
          now={now}
          isSpectator={isSpectator}
          aiResting={state.aiResting}
          roundPlaying={Boolean(roundPlaying)}
          onAsk={handleAsk}
        />
      </div>
    </div>
  )

  const bottomSlot = (
    <PainterTray
      trayRef={paletteWrapRef}
      activeColor={activeColor}
      tool={tool}
      tools={
        <ToolBar
          tools={PARTY_TOOLS}
          active={tool}
          onSelect={setTool}
          disabled={isSpectator}
          compactPick
        />
      }
      palette={
        <Palette
          activeColor={activeColor}
          onSelectColor={(color) => {
            setActiveColor(color)
            if (tool === 'erase' || tool === 'pick') setTool('paint')
          }}
          disabled={isSpectator}
          cooldownRemainingMs={cooldownRemainingMs}
          cooldownTotalMs={cooldownTotalMs}
        />
      }
    />
  )

  return (
    <div
      ref={roomPageRef}
      data-testid="room-page"
      className="room-play mx-auto flex w-full max-w-[1400px] flex-col px-3 py-1 sm:px-5"
    >
      <StudioBackdrop />
      <div className="play-controls">
        <PlayLayout
          top={topSlot}
          prompt={promptSlot}
          timeline={timelineSlot}
          exit={exitSlot}
          canvas={canvasSlot}
          score={scoreSlot}
          actions={actionsSlot}
          bottom={bottomSlot}
          rightSummary="Haiku &amp; painters"
        />
      </div>

      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}
