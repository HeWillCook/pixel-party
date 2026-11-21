import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker } from 'react-router-dom'
import { signOut, useAuthProfileReady, useQuery } from 'deepspace'
import {
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useDailySounds } from '../../components/daily/useDailySounds'
import { NeutralPorchLoading, PorchScene } from '../../components/porch/PorchScene'
import { EaselFaceText } from '../../components/porch/EaselFace'
import { OwnGalleryWall } from '../../components/gallery/OwnGalleryWall'
import { dispatchSceneNavigation, enableNavMotion, isPrimaryClick, requestSignIn, SCENE_NAV_EVENT, setZoomHandoff, type PorchChainDest, type SceneNavKind } from '../../components/porch/returnFlag'
import type { Camera } from '../../scene/camera'
import { readCameraTransform, REST_CAMERA, SCENE_ZOOM_CHAIN_MS, SCENE_ZOOM_MS, zoomHandoffAt } from '../../scene/zoom'
import { DailyTimer } from '../../components/daily/DailyTimer'
import { GradePanel } from '../../components/daily/GradePanel'
import { AutoGradeTimeline } from '../../components/daily/AutoGradeTimeline'
import { TempRetryDailyButton } from '../../components/daily/TempRetryDailyButton'
import { Haiku, type HaikuState } from '../../components/haiku/Haiku'
import { Palette } from '../../components/game/Palette'
import { PixelCanvas } from '../../components/game/PixelCanvas'
import { ToolBar } from '../../components/game/ToolBar'
import { PlayLayout } from '../../components/play/PlayLayout'
import { HoverEasel } from '../../components/play/HoverEasel'
import { ScoreCard } from '../../components/play/ScoreCard'
import { StudioSprite } from '../../components/play/StudioSprite'
import { PainterTray } from '../../components/game/PainterTray'
import { PlayBackdrop, type PlayTransition } from '../../components/play/PlayBackdrop'
import { studioSprites } from '../../scene/studio/sprites'
import { untransformedRect, useSceneRegistration } from '../../scene/registration'
import { porchEaselBoardRect } from '../../scene/porch/layout'
import { Badge, Button, Modal } from '../../components/ui'
import { DAILY, MAX_COLOR } from '../../game/config'
import { canAskDaily, canPaintDaily } from '../../game/daily/client-schedule'
import { decodeCells } from '../../game/grid'
import { emptyHistory, record, redo, undo, type History } from '../../game/history'
import { DAILY_TOOLS, floodFill, pickAt, type Tool } from '../../game/tools'
import { useDaily } from '../../hooks/DailyAttemptProvider'
import { useToolShortcuts } from '../../hooks/useToolShortcuts'
import type { GradeView } from '../../server/daily-service'

interface DailyDrawingRecord {
  day: string
  userId: string
  displayName: string
  prompt: string
  cells: string
  guess: string
  reason: string
  score: number
  visibility: 'public' |'private'
}

interface DailyScoreRecord {
  day: string
  userId: string
  displayName: string
  avatarUrl: string
  score: number
  fit: number
  recognition: number
  speed: number
  bestElapsedMs: number
  ended: number
  medal: number
}

function decodeSnapshotOrFallback(encoded: string | undefined, fallback: Uint8Array): Uint8Array {
  if (!encoded) return fallback
  try {
    const decoded = decodeCells(encoded, 1024)
    if (decoded.every((c) => c <= MAX_COLOR)) return decoded
  } catch {
    // Ignore invalid base64
  }
  return fallback
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// The panels around the board that slide out from behind it as the camera lands (and back in as it leaves).
const PANEL_SELECTOR = '.play-layout__left > *, .play-layout__right > *, .play-layout__bottom > *, .play-layout__mobile-top > *, .play-layout__mobile-footer > *'

// The porch easel card / chalkboard overlay fades out over this long before the view swaps.
const PORCH_TEXT_FADE_MS = 120

export default function DailyHomePage() {
  const { isLoaded, isSignedIn, user } = useAuthProfileReady({ requireUser: false })
  const { state, cells, paint, replaceCells, start, askNow, done } = useDaily()
  const { muted, toggleMute } = useDailySounds(state)
  // A callback ref (not a mutable ref) so the measuring effect re-runs the first time the
  // board actually mounts. It mounts a commit after `state.status` flips to 'playing' (the
  // porch fade still owns that commit), and a `[]`-effect would leave this at its initial
  // placeholder size, which the entry camera then zooms into — the tiny-canvas bug.
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [boardNode, setBoardNode] = useState<HTMLDivElement | null>(null)
  const attachBoard = useCallback((node: HTMLDivElement | null) => {
    boardRef.current = node
    setBoardNode(node)
  }, [])
  const paletteRef = useRef<HTMLDivElement>(null)
  const mobileFooterRef = useRef<HTMLDivElement>(null)
  const mobileHaikuTriggerRef = useRef<HTMLButtonElement>(null)
  const [boardBox, setBoardBox] = useState(() => ({
    width: 320,
    height: 600,
    mobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  }))
  // The day whose close-up (playing or graded result) is open on the easel; '' means the porch is showing.
  const [resultDay, setResultDay] = useState('')
  const [pendingChain, setPendingChain] = useState<PorchChainDest | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const registerRef = useRef<HTMLDivElement>(null)
  // The registered board is the canvas itself: its settled layout rect is where the camera lands.
  const boardAnchor = useMemo(() => ({
    get current() { return boardRef.current?.querySelector<HTMLElement>('[data-testid="pixel-canvas"]') ?? null },
  }), [])
  const [mobileScoreOpen, setMobileScoreOpen] = useState(false)
  const [mobileHaikuOpen, setMobileHaikuOpen] = useState(false)

  useEffect(() => {
    if (state.status !== 'playing') {
      setMobileScoreOpen(false)
      setMobileHaikuOpen(false)
    }
  }, [state.status])

  // Once an attempt starts the player stays on the easel until it is submitted or time runs out:
  // every scene-nav request is swallowed, and browser back is a no-op.
  const locked = Boolean(isSignedIn) && state.loaded && state.status === 'playing'
  const blocker = useBlocker(locked)
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker])

  useEffect(() => {
    const inEndedView = state.status === 'ended' && resultDay === state.day
    const onReturn = () => {
      if (locked) return
      setPendingChain(null)
      if (inEndedView) setPhase('leaving')
    }
    const onSceneNav = (event: Event) => {
      if (!locked && !inEndedView) return
      const detail = (event as CustomEvent<{ kind: SceneNavKind; path: string }>).detail
      if (!detail || detail.kind === 'signin') return
      event.preventDefault()
      if (locked) return
      if (detail.kind === 'porch') {
        onReturn()
        return
      }
      setPendingChain({ kind: detail.kind, path: detail.path })
      setPhase('leaving')
    }
    window.addEventListener('pixel:return-porch', onReturn)
    window.addEventListener(SCENE_NAV_EVENT, onSceneNav)
    return () => {
      window.removeEventListener('pixel:return-porch', onReturn)
      window.removeEventListener(SCENE_NAV_EVENT, onSceneNav)
    }
  }, [locked, state.status, state.day, resultDay])

  useEffect(() => {
    if (!mobileHaikuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileHaikuOpen(false)
        mobileHaikuTriggerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileHaikuOpen])

  useIsomorphicLayoutEffect(() => {
    const board = boardNode
    if (!board) return
    const measure = () => {
      const mobile = window.innerWidth < 768
      // Layout heights (`offsetHeight`), not boxes: while the camera flies the tray and footer are scaled by the registration.
      const paletteHeight = paletteRef.current?.offsetHeight ?? 0
      const footerHeight = mobileFooterRef.current?.offsetHeight ?? 0
      const width = board.clientWidth
      if (mobile && state.status === 'playing') {
        const boardTop = untransformedRect(board).y
        const height = Math.max(200, window.innerHeight - boardTop - paletteHeight - footerHeight - 24)
        setBoardBox(previous =>
          previous.width === width && previous.height === height && previous.mobile === mobile
            ? previous
            : { width, height, mobile },
        )
        return
      }
      const layout = state.status === 'playing' && !mobile ? board.closest('.play-layout') : null
      // The close-up is glued (scaled and moved) onto the small easel while the camera flies: measure its settled layout, never the glue.
      const top = untransformedRect((layout ?? board) as HTMLElement).y + (board.closest('main')?.scrollTop ?? 0)
      const height = Math.max(200, window.innerHeight - top - paletteHeight - (state.status === 'playing' ? 10 : 0))
      setBoardBox(previous =>
        previous.width === width && previous.height === height && previous.mobile === mobile
          ? previous
          : { width, height, mobile },
      )
    }
    measure()
    let raf = 0
    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    const media = window.matchMedia('(min-width: 768px)')
    const observer = new ResizeObserver(measure)
    observer.observe(board)
    const layout = board.closest('.play-layout')
    if (layout) observer.observe(layout)
    if (paletteRef.current) observer.observe(paletteRef.current)
    if (mobileFooterRef.current) observer.observe(mobileFooterRef.current)
    window.addEventListener('resize', onResize)
    media.addEventListener('change', onResize)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', onResize)
      media.removeEventListener('change', onResize)
    }
  }, [boardNode, state.status, state.loaded, isSignedIn, resultDay])

  const userId = user?.id ?? ''
  const queryDay = state.day || '__none__'
  const queryUserId = userId || '__none__'

  const { records: myDrawings } = useQuery<DailyDrawingRecord>('dailyDrawings', {
    where: { day: queryDay, userId: queryUserId },
    limit: 1,
  })
  const { records: myScores } = useQuery<DailyScoreRecord>('dailyScores', {
    where: { day: queryDay, userId: queryUserId },
    limit: 1,
  })

  const bestDrawingDoc = myDrawings[0]?.data
  const bestScoreDoc = myScores[0]?.data

  // What Haiku (the porch cat) can tell you when you say hello: today's top score and your painting from yesterday. The first query is
  // the very one the chalkboard already makes, so it costs nothing more.
  const yesterdayDay = useMemo(() => {
    const date = new Date(`${state.day}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return '__none__'
    date.setUTCDate(date.getUTCDate() - 1)
    return date.toISOString().slice(0, 10)
  }, [state.day])
  const { records: todaysScores } = useQuery<DailyScoreRecord>('dailyScores', { where: { day: queryDay }, limit: 1000 })
  const { records: yesterdaysScores } = useQuery<DailyScoreRecord>('dailyScores', { where: { day: yesterdayDay, userId: queryUserId }, limit: 1 })
  const haikuFacts = useMemo(() => ({
    best: state.status === 'ended' ? Math.max(state.best, bestScoreDoc?.score ?? 0) : 0,
    top: todaysScores.reduce((top, record) => Math.max(top, typeof record.data?.score === 'number' ? record.data.score : 0), 0),
    yesterday: yesterdaysScores[0]?.data?.score ?? 0,
  }), [state.status, state.best, bestScoreDoc?.score, todaysScores, yesterdaysScores])

  const [activeColor, setActiveColor] = useState<number>(4)
  const [tool, setTool] = useState<Tool>('paint')
  const [history, setHistory] = useState<History>(() => emptyHistory())
  const [strokeActive, setStrokeActive] = useState(false)
  const [starting, setStarting] = useState(false)
  // One camera move for both the playing and the graded close-up: entering zooms onto the easel, leaving zooms back out.
  const [phase, setPhase] = useState<PlayTransition>('active')
  // While the camera is moving the whole close-up is glued to the porch easel's board and the panels slide out
  // from behind it; at rest the transforms are cleared and the layout is exact.
  useSceneRegistration({ host: backdropRef, root: registerRef, anchor: boardAnchor, focus: porchEaselBoardRect, active: phase !== 'active', panelSelector: PANEL_SELECTOR })
  // The porch easel card fades out before the view swaps instead of vanishing in the first frame.
  const [porchLeaving, setPorchLeaving] = useState(false)
  const [now, setNow] = useState<number>(() => Date.now())

  const cellsRef = useRef(cells)
  const historyRef = useRef(history)
  const strokeActiveRef = useRef(false)
  const strokeSnapshotRef = useRef<Uint8Array | null>(null)

  useEffect(() => {
    cellsRef.current = cells
  }, [cells])

  useEffect(() => {
    historyRef.current = history
  }, [history])

  useEffect(() => {
    const reset = emptyHistory()
    historyRef.current = reset
    setHistory(reset)
    strokeSnapshotRef.current = null
    strokeActiveRef.current = false
    setStrokeActive(false)
  }, [state.day, state.startedAt])

  useEffect(() => {
    if (state.status !== 'playing') return
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 250)
    return () => clearInterval(interval)
  }, [state.status])

  const asksLeft = state.asksLeft
  const canDraw = isSignedIn && canPaintDaily(state, now)
  const canAsk = isSignedIn && canAskDaily(state, now)

  useEffect(() => {
    if (canDraw) return
    strokeSnapshotRef.current = null
    if (strokeActiveRef.current) {
      strokeActiveRef.current = false
      setStrokeActive(false)
    }
  }, [canDraw])

  const handleStrokeStart = useCallback(() => {
    if (!canDraw) return
    strokeSnapshotRef.current = new Uint8Array(cellsRef.current)
    strokeActiveRef.current = true
    setStrokeActive(true)
  }, [canDraw])

  const handleStrokeEnd = useCallback(() => {
    strokeSnapshotRef.current = null
    if (!strokeActiveRef.current) return
    strokeActiveRef.current = false
    setStrokeActive(false)
  }, [])

  const handlePlace = useCallback(
    (x: number, y: number, color: number) => {
      if (!canDraw) return
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= 32 || y < 0 || y >= 32) return
      if (!Number.isInteger(color) || color < 0 || color > MAX_COLOR) return
      const idx = y * 32 + x
      if (cellsRef.current[idx] === color) return
      if (strokeSnapshotRef.current) {
        const nextHistory = record(historyRef.current, strokeSnapshotRef.current)
        historyRef.current = nextHistory
        setHistory(nextHistory)
        strokeSnapshotRef.current = null
      }
      const next = cellsRef.current.slice()
      next[idx] = color
      cellsRef.current = next
      paint(x, y, color)
    },
    [canDraw, paint],
  )

  const handleFill = useCallback(
    (x: number, y: number) => {
      if (!canDraw) return
      const next = floodFill(cellsRef.current, 32, 32, x, y, activeColor)
      if (next === cellsRef.current) return
      const nextHistory = record(historyRef.current, cellsRef.current)
      historyRef.current = nextHistory
      setHistory(nextHistory)
      cellsRef.current = next
      replaceCells(next)
    },
    [canDraw, activeColor, replaceCells],
  )

  const handlePick = useCallback((x: number, y: number) => {
    const picked = pickAt(cellsRef.current, 32, x, y)
    if (picked.tool === 'erase') {
      setTool('erase')
    } else {
      setActiveColor(picked.color)
      setTool('paint')
    }
  }, [])

  const handleUndo = useCallback(() => {
    if (!canDraw || strokeActiveRef.current) return
    const result = undo(historyRef.current, cellsRef.current)
    if (!result) return
    historyRef.current = result.history
    setHistory(result.history)
    cellsRef.current = result.cells
    replaceCells(result.cells)
  }, [canDraw, replaceCells])

  const handleRedo = useCallback(() => {
    if (!canDraw || strokeActiveRef.current) return
    const result = redo(historyRef.current, cellsRef.current)
    if (!result) return
    historyRef.current = result.history
    setHistory(result.history)
    cellsRef.current = result.cells
    replaceCells(result.cells)
  }, [canDraw, replaceCells])

  useToolShortcuts({
    tools: DAILY_TOOLS,
    onSelect: setTool,
    onUndo: strokeActive ? undefined : handleUndo,
    onRedo: strokeActive ? undefined : handleRedo,
    enabled: isSignedIn && state.loaded && state.status === 'playing' && canDraw,
  })

  const endedBestScore = Math.max(
    state.best,
    bestScoreDoc?.score ?? 0,
    bestDrawingDoc?.score ?? 0,
  )

  const endedCells = useMemo(
    () => decodeSnapshotOrFallback(bestDrawingDoc?.cells ?? state.bestCells ?? state.lastCells, cells),
    [bestDrawingDoc?.cells, state.bestCells, state.lastCells, cells],
  )

  const endedGrade = useMemo((): GradeView | null => {
    if (bestScoreDoc || bestDrawingDoc) {
      const fit = bestScoreDoc?.fit ?? (state.latest?.total === endedBestScore ? state.latest.fit : 0)
      const recognition =
        bestScoreDoc?.recognition ??
        (state.latest?.total === endedBestScore ? state.latest.recognition : 0)
      const speed =
        bestScoreDoc?.speed ?? (state.latest?.total === endedBestScore ? state.latest.speed : 0)
      const total = bestScoreDoc?.score ?? bestDrawingDoc?.score ?? endedBestScore
      const guess =
        bestDrawingDoc?.guess ||
        (state.latest?.total === endedBestScore ? state.latest.guess : '')
      const reason =
        bestDrawingDoc?.reason ||
        (state.latest?.total === endedBestScore ? state.latest.reason : '')
      const elapsedMs =
        bestScoreDoc?.bestElapsedMs ??
        (state.latest?.total === endedBestScore ? state.latest.elapsedMs : 0)

      if (total > 0 || Boolean(guess) || Boolean(reason)) {
        return {
          guess,
          reason,
          fit,
          recognition,
          speed,
          total,
          elapsedMs,
        }
      }
    }
    if (state.latest && state.latest.total >= state.best) {
      return state.latest
    }
    return null
  }, [bestScoreDoc, bestDrawingDoc, state.latest, state.best, endedBestScore])

  const handleStart = async () => {
    enableNavMotion()
    setStarting(true)
    // Reduced motion stays instant: no fade to wait for.
    const fadeMs = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : PORCH_TEXT_FADE_MS
    if (fadeMs) setPorchLeaving(true)
    try {
      const [started] = await Promise.all([start(), new Promise(resolve => setTimeout(resolve, fadeMs))])
      if (started) setResultDay(state.day)
      setPhase(started ? 'entering' : 'active')
    } catch {
      setPhase('active')
    } finally {
      setPorchLeaving(false)
      setStarting(false)
    }
  }

  const openEnded = async () => {
    enableNavMotion()
    const fadeMs = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : PORCH_TEXT_FADE_MS
    if (fadeMs) setPorchLeaving(true)
    await new Promise(resolve => setTimeout(resolve, fadeMs))
    setPhase('entering')
    setResultDay(state.day)
    setPorchLeaving(false)
  }

  // Submitting (or running out of time) leaves the player on the easel: the board stays where it is and the
  // playing panels become the graded result. Mirrors the day onto `resultDay` while the attempt is running.
  useEffect(() => {
    if (state.status === 'playing' && state.loaded && resultDay !== state.day) setResultDay(state.day)
  }, [state.status, state.loaded, state.day, resultDay])

  // Leaving the graded result for the studio below: the porch (and its floor pan) takes over while the zoom-out is
  // still running, so the two are one camera path. The porch continues the same curve from here.
  const leaveFrom = useRef<Camera | null>(null)
  useIsomorphicLayoutEffect(() => {
    if (phase !== 'leaving' || pendingChain?.kind !== 'party') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const cameraEl = backdropRef.current?.querySelector('.pixel-scene__camera') ?? null
    leaveFrom.current = readCameraTransform(cameraEl)
    const timer = setTimeout(() => {
      const from = leaveFrom.current
      if (from) setZoomHandoff(zoomHandoffAt(cameraEl, from, REST_CAMERA, SCENE_ZOOM_MS))
      setResultDay('')
      setPhase('active')
    }, SCENE_ZOOM_CHAIN_MS)
    return () => clearTimeout(timer)
  }, [phase, pendingChain])

  const finishTransition = useCallback(() => {
    // Zooming back out lands on the porch: the close-up is dropped and the porch scene takes over.
    if (phase === 'leaving') setResultDay('')
    setPhase('active')
  }, [phase])

  if (!isLoaded || (isSignedIn && !state.loaded)) {
    return <div data-testid="daily-page" className="porch-home"><NeutralPorchLoading /></div>
  }

  const inCloseup = Boolean(isSignedIn) && !porchLeaving && (state.status === 'playing' || (state.status === 'ended' && resultDay === state.day))
  if (!inCloseup) {
    const ended = isSignedIn && state.status === 'ended'
    const signedOut = !isSignedIn
    return <div data-testid="daily-page" className="porch-home">
      <section className={porchLeaving ? 'porch-home__scene porch-home__scene--leaving' : 'porch-home__scene'} data-testid={signedOut ? 'daily-signed-out' : ended ? 'daily-ended' : 'daily-not-started'}>
        <PorchScene easelState={signedOut ? 'signin' : ended ? 'finished' : 'cover'} easelLabel={signedOut ? 'Sign in to paint' : ended ? 'View result' : 'Start Daily Challenge'}
          easelTestId={signedOut ? 'daily-sign-in-button' : ended ? undefined : 'daily-start-button'} easelDisabled={starting}
          easelCells={ended ? endedCells : undefined}
          easelText={<EaselFaceText mode={signedOut ? 'signin' : ended ? 'finished' : 'cover'} best={endedBestScore} />}
          signedIn={!!isSignedIn} galleryHref={`/u/${encodeURIComponent(userId)}`} muted={muted} haikuFacts={haikuFacts}
          wall={isSignedIn && userId ? <OwnGalleryWall userId={userId} /> : undefined}
          pendingChain={pendingChain}
          onConsumePendingChain={() => setPendingChain(null)}
          onEasel={() => { if (signedOut) requestSignIn(); else if (ended) void openEnded(); else void handleStart() }}
          onSignOut={() => signOut()} onToggleMute={toggleMute}>
          {state.lastError && <p className="porch-error pp-panel" role="status">{state.lastError}</p>}
          {/* DEV ONLY (__DEBUG_TOOLS__) */}
          {__DEBUG_TOOLS__ && isSignedIn && state.loaded && ended && (
            <div className="porch-retry-debug">
              <TempRetryDailyButton autoStart={false} onAfterReset={() => void handleStart()} />
            </div>
          )}
        </PorchScene>
      </section>
    </div>
  }

  const serverNow = now + state.clockOffsetMs
  const pendingWindow = (state.windows.length
    ? state.windows
    : state.startedAt == null
      ? []
      : DAILY.autoWindowsMs.map((offset, index) => ({
          index,
          dueAt: state.startedAt! + offset,
          status: 'pending' as const,
          score: null,
          late: false,
        }))
  ).find(w => w.status === 'pending')
  const nextAutoAt = pendingWindow?.dueAt ?? state.nextAutoAt
  const nextAutoSec = nextAutoAt != null ? Math.max(0, Math.ceil((nextAutoAt - serverNow) / 1000)) : null
  const nextAutoLabel = state.grading
    ? 'Looking…'
    : nextAutoSec != null
      ? `Next ${Math.floor(nextAutoSec / 60)}:${String(nextAutoSec % 60).padStart(2, '0')}`
      : 'Grades done'

  const haikuState: HaikuState = state.grading
    ? 'thinking'
    : state.lastError && state.lastError.includes('napping')
      ? 'resting'
      : state.latest
        ? state.latest.total >= 700
          ? 'correct'
          : state.latest.total >= 350
            ? 'guess'
            : 'idle'
        : 'idle'

  const guessWord = state.latest?.guess?.trim()
  const isBlankGuess = Boolean(
    state.latest &&
    state.latest.total === 0 &&
    (!guessWord || /^(nothing|blank|empty|blank canvas|empty canvas|no drawing)$/i.test(guessWord)),
  )
  const guessLine = isBlankGuess
    ? 'Nothing drawn yet!'
    : guessWord
      ? /^(an?)\b/i.test(guessWord)
        ? `Looks like ${guessWord}!`
        : `Looks like a ${guessWord}!`
      : 'Scored!'

  const haikuBubble = state.grading ? (
    'Hmm…'
  ) : state.lastError ? (
    <span className="daily-haiku__speech">
      <strong className="daily-haiku__headline">Oops!</strong>
      <span className="daily-haiku__reason">{state.lastError}</span>
    </span>
  ) : state.latest ? (
    <span className="daily-haiku__speech">
      <strong className="daily-haiku__headline">
        {guessLine}&nbsp;&middot;&nbsp;{state.latest.total}
      </strong>
      {state.latest.reason && (
        <span className="daily-haiku__reason">{state.latest.reason}</span>
      )}
    </span>
  ) : state.notice && state.notice.toLowerCase().includes('nothing drawn') ? (
    <span className="daily-haiku__speech">
      <strong className="daily-haiku__headline">Nothing drawn yet!</strong>
      <span className="daily-haiku__reason">Paint a little first so I can have a look.</span>
    </span>
  ) : (
    <span className="daily-haiku__speech">
      <strong className="daily-haiku__headline">Paint away!</strong>
      <span className="daily-haiku__reason">Tap Grade when you want a look.</span>
    </span>
  )

  const ended = state.status === 'ended'
  const closeupPrompt = state.prompt ?? bestDrawingDoc?.prompt
  const exitCloseup = () => { enableNavMotion(); setPhase('leaving') }
  // DEV ONLY (__DEBUG_TOOLS__)
  const retryButton = __DEBUG_TOOLS__ ? (
    <TempRetryDailyButton compact autoStart={false} onAfterReset={() => void handleStart()} className="w-full" />
  ) : null

  return (
    <div
      data-testid="daily-page"
      className="daily-page daily-page--playing mx-auto flex w-full max-w-[1400px] flex-col gap-2 px-1 py-1 md:px-5 md:py-1"
    >
      {/* One easel close-up for the whole attempt: the same board and the same camera while playing and, after
          submitting, while the result is graded, so nothing moves when the attempt ends. */}
      <div
        data-testid={ended ? 'daily-ended' : 'daily-playing'}
        data-play-phase={phase}
        data-nav-animate={phase === 'active' ? undefined : ''}
        className={ended ? 'daily-play daily-play--ended' : 'daily-play'}
      >
        <PlayBackdrop
          hostRef={backdropRef}
          phase={phase}
          onTransitionEnd={finishTransition}
          boardKey={`${boardBox.width}x${boardBox.height}:${boardBox.mobile ? 1 : 0}`}
          soundOn={!muted}
          signedIn={Boolean(isSignedIn)}
          easelState={ended ? 'finished' : 'cover'}
          easelCells={ended ? endedCells : undefined}
          onDismiss={ended && phase === 'active' ? exitCloseup : undefined}
        />
        <div className="play-controls">
          <div ref={registerRef} className="play-register" data-registered="">
            <PlayLayout
              variant="daily"
              prompt={
                <div className="play-prompt daily-clipboard__prompt">
                  {ended ? (
                    <Badge variant="default" className="uppercase">Attempt Complete</Badge>
                  ) : (
                    <span className="play-prompt__heading">Today’s prompt</span>
                  )}
                  <span
                    data-testid="daily-prompt"
                    className="pp-word text-2xl uppercase tracking-wide text-[var(--sunset-1)] sm:text-3xl"
                  >
                    {closeupPrompt}
                  </span>
                  {ended
                    ? <span className="text-base text-[var(--sunset-1)]">Best: {endedBestScore} / 1000</span>
                    : <DailyTimer startedAt={state.startedAt} endsAt={state.endsAt} clockOffsetMs={state.clockOffsetMs} />}
                </div>
              }
              timeline={
                <AutoGradeTimeline
                  embedded
                  windows={state.windows}
                  now={serverNow}
                  startedAt={state.startedAt}
                  manualUsed={state.asksUsed}
                />
              }
              exit={
                <>
                  {ended && (
                    <>
                      <Button type="button" variant="secondary" size="sm" onClick={toggleMute} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} className="pp-chip w-full gap-2 text-base">
                        {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
                        <span className="inline-block min-w-[9ch] text-left">{muted ? 'Sound off' : 'Sound on'}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        data-testid="daily-ended-porch-button"
                        aria-label="Back to porch"
                        onClick={exitCloseup}
                        className="daily-porch-sign"
                      >
                        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>Porch</span>
                      </Button>
                    </>
                  )}
                  {retryButton}
                </>
              }
              mobileTop={
                <div className="daily-mobile-top">
                  <div className="daily-mobile-top__prompt">
                    <span className="daily-mobile-top__label">{ended ? 'Complete' : 'Prompt'}</span>
                    <span data-testid="daily-prompt" className="pp-word daily-mobile-top__word">
                      {closeupPrompt}
                    </span>
                  </div>
                  <div className="daily-mobile-top__right">
                    {ended
                      ? <span className="text-base text-[var(--sunset-1)]">{endedBestScore} / 1000</span>
                      : <DailyTimer startedAt={state.startedAt} endsAt={state.endsAt} clockOffsetMs={state.clockOffsetMs} />}
                  </div>
                </div>
              }
              canvas={
                <div ref={attachBoard} className="flex w-full min-w-0 justify-center">
                  <HoverEasel>
                    <PixelCanvas
                      width={32}
                      height={32}
                      availWidth={boardBox.mobile ? Math.max(32, boardBox.width + 6) : Math.max(32, boardBox.width - 56)}
                      availHeight={boardBox.mobile ? Math.max(32, boardBox.height) : Math.min(596, Math.max(32, boardBox.height - 50))}
                      cells={ended ? endedCells : cells}
                      activeColor={activeColor}
                      tool={tool}
                      canDraw={ended ? false : canDraw}
                      word={closeupPrompt}
                      onPlace={handlePlace}
                      onFill={handleFill}
                      onPick={handlePick}
                      onStrokeStart={handleStrokeStart}
                      onStrokeEnd={handleStrokeEnd}
                    />
                  </HoverEasel>
                </div>
              }
              score={
                ended ? (
                  <div className="daily-right-stage">
                    <GradePanel latest={endedGrade} best={endedBestScore} grading={state.grading} lastError={state.lastError} ended />
                  </div>
                ) : (
                  <div className="daily-right-stage">
                    <div className="daily-haiku-perch">
                      <div className="daily-haiku-perch__stool" aria-hidden="true">
                        <StudioSprite sprite={studioSprites.criticStool} scale={3} />
                      </div>
                      <div className="daily-haiku-perch__cat">
                        <Haiku state={haikuState} bubble={haikuBubble} scale={3} />
                      </div>
                    </div>
                    <ScoreCard
                      latest={state.latest}
                      best={state.best}
                      grading={state.grading}
                      lastError={state.lastError}
                      notice={state.notice}
                      actions={
                        <div className="play-actions daily-plaques">
                          <Button
                            type="button"
                            data-testid="daily-ask-button"
                            disabled={!canAsk}
                            onClick={() => void askNow()}
                            className="pp-btn daily-plaque daily-plaque--ask gap-2 px-3 py-1.5 text-base uppercase tracking-wider"
                          >
                            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                            <span>Grade now ({asksLeft} left)</span>
                          </Button>
                          <div className="daily-chalkboard__chains daily-chalkboard__chains--between" aria-hidden="true">
                            <span />
                            <span />
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            data-testid="daily-done-button"
                            disabled={state.stale || state.grading || (state.finalizing && !state.endFailed)}
                            onClick={() => void done()}
                            className="pp-btn daily-plaque daily-plaque--submit gap-1.5 px-3 py-1.5 text-base uppercase tracking-wider"
                          >
                            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                            <span>{state.endFailed ? 'Retry submit' : state.finalizing ? 'Finishing…' : 'Submit & finish'}</span>
                          </Button>
                        </div>
                      }
                    />
                  </div>
                )
              }
              actions={null}
              bottom={
                <PainterTray
                  trayRef={paletteRef}
                  activeColor={activeColor}
                  tool={tool}
                  tools={
                    <ToolBar
                      tools={DAILY_TOOLS}
                      compactPick
                      active={tool}
                      onSelect={setTool}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      canUndo={!strokeActive && history.past.length > 0}
                      canRedo={!strokeActive && history.future.length > 0}
                      disabled={!canDraw}
                    />
                  }
                  palette={
                    <Palette
                      activeColor={activeColor}
                      onSelectColor={color => {
                        setActiveColor(color)
                        if (tool === 'erase' || tool === 'pick') setTool('paint')
                      }}
                      disabled={!canDraw}
                    />
                  }
                />
              }
              mobileFooter={ended ? (
                <div ref={mobileFooterRef} className="daily-mobile-footer">
                  <div className="daily-mobile-strip">
                    <span data-testid="daily-best-score" className="daily-mobile-strip__best">Best {endedBestScore}/1000</span>
                    <Button type="button" variant="secondary" data-testid="daily-ended-porch-button" aria-label="Back to porch" onClick={exitCloseup} className="pp-btn daily-mobile-strip__btn">
                      <span>Porch</span>
                    </Button>
                    <Button type="button" onClick={() => setMobileScoreOpen(true)} className="pp-btn daily-mobile-strip__btn daily-mobile-strip__btn--ask">
                      <span>Grades</span>
                    </Button>
                  </div>
                  <Modal open={mobileScoreOpen} onClose={() => setMobileScoreOpen(false)} aria-label="How you were scored" hideClose className="daily-chalk-sheet-modal">
                    <div className="daily-chalk-sheet">
                      <GradePanel latest={endedGrade} best={endedBestScore} grading={state.grading} lastError={state.lastError} ended />
                      <AutoGradeTimeline embedded windows={state.windows} now={serverNow} startedAt={state.startedAt} manualUsed={state.asksUsed} />
                      <button type="button" onClick={() => setMobileScoreOpen(false)} className="pp-btn daily-chalk-sheet__close" aria-label="Close score breakdown">Close</button>
                    </div>
                  </Modal>
                </div>
              ) : (
                <div ref={mobileFooterRef} className="daily-mobile-footer">
                  {mobileHaikuOpen && (
                    <div
                      id="daily-mobile-haiku-popover"
                      role="dialog"
                      aria-modal="false"
                      aria-label="Haiku's message"
                      data-testid="daily-mobile-haiku-popover"
                      className="daily-mobile-haiku-popover"
                    >
                      <div
                        role="status"
                        aria-live="polite"
                        aria-atomic="true"
                        className="daily-mobile-haiku-popover__content"
                      >
                        {haikuBubble}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMobileHaikuOpen(false)
                          mobileHaikuTriggerRef.current?.focus()
                        }}
                        className="daily-mobile-haiku-popover__close"
                        aria-label="Close Haiku message"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div className="daily-mobile-strip">
                    <button
                      ref={mobileHaikuTriggerRef}
                      type="button"
                      data-testid="daily-mobile-haiku"
                      data-haiku-state={haikuState}
                      aria-expanded={mobileHaikuOpen}
                      aria-controls={mobileHaikuOpen ? 'daily-mobile-haiku-popover' : undefined}
                      aria-haspopup="dialog"
                      aria-label={mobileHaikuOpen ? "Hide Haiku's message" : "View Haiku's message"}
                      onClick={() => {
                        setMobileScoreOpen(false)
                        setMobileHaikuOpen(open => !open)
                      }}
                      className="daily-mobile-strip__haiku"
                    >
                      <Haiku state={haikuState} bubble={false} scale={1.65} data-testid="daily-mobile-haiku-sprite" />
                      {(state.grading || state.latest || state.lastError) && (
                        <span className="daily-mobile-strip__haiku-dot" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      data-testid="daily-mobile-score-trigger"
                      aria-expanded={mobileScoreOpen}
                      aria-label="Open scores and grading breakdown"
                      onClick={() => {
                        setMobileHaikuOpen(false)
                        setMobileScoreOpen(true)
                      }}
                      className="daily-mobile-strip__score"
                    >
                      <span data-testid="daily-best-score" className="daily-mobile-strip__best">
                        Best {state.best}/1000
                      </span>
                      <span className="daily-mobile-strip__auto">{nextAutoLabel}</span>
                    </button>
                    <Button
                      type="button"
                      data-testid="daily-ask-button"
                      disabled={!canAsk}
                      onClick={() => void askNow()}
                      className="pp-btn daily-mobile-strip__btn daily-mobile-strip__btn--ask"
                    >
                      <span>{state.grading ? 'Looking…' : `Grade (${asksLeft})`}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      data-testid="daily-done-button"
                      disabled={state.stale || state.grading || (state.finalizing && !state.endFailed)}
                      onClick={() => void done()}
                      className="pp-btn daily-mobile-strip__btn daily-mobile-strip__btn--submit"
                    >
                      <span>{state.endFailed ? 'Retry' : state.finalizing ? 'Saving…' : 'Submit'}</span>
                    </Button>
                  </div>
                  <Modal
                    open={mobileScoreOpen}
                    onClose={() => setMobileScoreOpen(false)}
                    aria-label="How you're scored"
                    hideClose
                    className="daily-chalk-sheet-modal"
                  >
                    <div className="daily-chalk-sheet">
                      <div className="daily-chalk-sheet__head">
                        <Haiku state={haikuState} bubble={haikuBubble} scale={2} />
                        <button
                          type="button"
                          onClick={() => setMobileScoreOpen(false)}
                          className="pp-btn daily-chalk-sheet__close"
                          aria-label="Close score breakdown"
                        >
                          Close
                        </button>
                      </div>
                      <ScoreCard
                        sheet
                        latest={state.latest}
                        best={state.best}
                        grading={state.grading}
                        lastError={state.lastError}
                        notice={state.notice}
                      />
                      <AutoGradeTimeline
                        embedded
                        windows={state.windows}
                        now={serverNow}
                        startedAt={state.startedAt}
                        manualUsed={state.asksUsed}
                      />
                      {/* DEV ONLY (__DEBUG_TOOLS__) */}
                      {__DEBUG_TOOLS__ && <TempRetryDailyButton compact onAfterReset={() => setMobileScoreOpen(false)} />}
                    </div>
                  </Modal>
                </div>
              )}
            />
          </div>
        </div>
      </div>

    </div>
  )
}
