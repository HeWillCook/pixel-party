import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay, signOut, useAuthProfileReady, useQuery } from 'deepspace'
import {
  CheckCircle2,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useDailySounds } from '../../components/daily/useDailySounds'
import { NeutralPorchLoading, PorchScene } from '../../components/porch/PorchScene'
import { rankScores } from '../../game/daily/rank'
import { DailyTimer } from '../../components/daily/DailyTimer'
import { Leaderboard } from '../../components/daily/Leaderboard'
import { GradePanel } from '../../components/daily/GradePanel'
import { AutoGradeTimeline } from '../../components/daily/AutoGradeTimeline'
import { ExitDailyButton } from '../../components/daily/ExitDailyButton'
import { Haiku, type HaikuState } from '../../components/haiku/Haiku'
import { Palette } from '../../components/game/Palette'
import { PixelCanvas } from '../../components/game/PixelCanvas'
import { ToolBar } from '../../components/game/ToolBar'
import { PlayLayout } from '../../components/play/PlayLayout'
import { HoverEasel } from '../../components/play/HoverEasel'
import { ScoreCard } from '../../components/play/ScoreCard'
import { PainterTray } from '../../components/game/PainterTray'
import { PlayBackdrop, type PlayTransition } from '../../components/play/PlayBackdrop'
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

export default function DailyHomePage() {
  const { isLoaded, isSignedIn, user } = useAuthProfileReady({ requireUser: false })
  const { state, cells, paint, replaceCells, start, askNow, done } = useDaily()
  const { muted, toggleMute } = useDailySounds(state)
  const boardRef = useRef<HTMLDivElement>(null)
  const paletteRef = useRef<HTMLDivElement>(null)
  const mobileFooterRef = useRef<HTMLDivElement>(null)
  const [boardBox, setBoardBox] = useState({ width: 320, height: 600, mobile: false })
  const [resultDay, setResultDay] = useState('')
  const [showPorch, setShowPorch] = useState(false)
  const [mobileScoreOpen, setMobileScoreOpen] = useState(false)
  const [mobileHaikuOpen, setMobileHaikuOpen] = useState(false)

  useEffect(() => {
    if (state.status !== 'playing') {
      setMobileScoreOpen(false)
      setMobileHaikuOpen(false)
    }
  }, [state.status])

  useEffect(() => {
    if (!mobileHaikuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileHaikuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileHaikuOpen])

  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const measure = () => {
      const mobile = window.innerWidth < 768
      const paletteHeight = paletteRef.current?.getBoundingClientRect().height ?? 0
      const footerHeight = mobileFooterRef.current?.getBoundingClientRect().height ?? 0
      const width = board.clientWidth
      if (mobile && state.status === 'playing') {
        const boardTop = board.getBoundingClientRect().top
        const height = Math.max(200, window.innerHeight - boardTop - paletteHeight - footerHeight - 24)
        setBoardBox(previous =>
          previous.width === width && previous.height === height && previous.mobile === mobile
            ? previous
            : { width, height, mobile },
        )
        return
      }
      const layout = state.status === 'playing' && !mobile ? board.closest('.play-layout') : null
      const top = (layout ?? board).getBoundingClientRect().top + (board.closest('main')?.scrollTop ?? 0)
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
  }, [state.status, state.loaded, isSignedIn, resultDay, showPorch])

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
  const { records: todayScores } = useQuery<DailyScoreRecord>('dailyScores', {
    where: { day: queryDay }, limit: 1000,
  })

  const bestDrawingDoc = myDrawings[0]?.data
  const bestScoreDoc = myScores[0]?.data

  const [activeColor, setActiveColor] = useState<number>(4)
  const [tool, setTool] = useState<Tool>('paint')
  const [history, setHistory] = useState<History>(() => emptyHistory())
  const [strokeActive, setStrokeActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [playTransition, setPlayTransition] = useState<PlayTransition>('active')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
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
    enabled: isSignedIn && state.loaded && state.status === 'playing' && canDraw && !showAuthModal,
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
    setPlayTransition('entering')
    if (showPorch && state.status === 'playing') { setShowPorch(false); return }
    setStarting(true)
    try {
      if (!await start()) setPlayTransition('active')
    } catch {
      setPlayTransition('active')
    } finally {
      setStarting(false)
    }
  }

  const finishPlayTransition = useCallback(() => {
    if (playTransition === 'leaving') setShowPorch(true)
    setPlayTransition('active')
  }, [playTransition])

  if (!isLoaded || (isSignedIn && !state.loaded)) {
    return <div data-testid="daily-page" className="porch-home"><NeutralPorchLoading /></div>
  }

  if (!isSignedIn || state.status === 'not_started' || (state.status === 'playing' && showPorch) || (state.status === 'ended' && resultDay !== state.day)) {
    const scores = todayScores.map(record => record.data)
    const topThree = rankScores(scores).slice(0, 5).map(({ userId: scoreUserId }) => {
      const score = scores.find(item => item.userId === scoreUserId)!
      return { name: score.displayName || 'Player', score: score.score }
    })
    const ended = isSignedIn && state.status === 'ended'
    const signedOut = !isSignedIn
    return <div data-testid="daily-page" className="porch-home">
      <section className="porch-home__scene" data-testid={signedOut ? 'daily-signed-out' : ended ? 'daily-ended' : 'daily-not-started'}>
        <PorchScene easelState={signedOut ? 'signin' : ended ? 'finished' : 'cover'} easelLabel={signedOut ? 'Sign in to paint' : ended ? 'View result' : showPorch ? 'Resume painting' : 'Start Daily Challenge'}
          easelTestId={signedOut ? 'daily-sign-in-button' : ended ? undefined : 'daily-start-button'} easelDisabled={starting}
          easelCells={ended ? endedCells : undefined}
          easelText={signedOut ? <span className="porch-easel-action">Sign in to paint</span> : ended ? <span className="porch-easel-tag" data-testid="porch-easel-tag">Today&apos;s painting · {endedBestScore}/1000</span> : <><strong>Today’s prompt</strong><span>10 minutes · your best grade counts</span><span className="porch-easel-action">{showPorch ? 'Resume painting' : 'Start painting'}</span></>}
          signedIn={!!isSignedIn} galleryHref={`/u/${encodeURIComponent(userId)}`} topThree={topThree} muted={muted}
          onEasel={() => { if (signedOut) setShowAuthModal(true); else if (ended) setResultDay(state.day); else void handleStart() }}
          onAccount={() => { if (signedOut) setShowAuthModal(true); else setShowAccount(true) }} onToggleMute={toggleMute}>
          {state.lastError && <p className="porch-error pp-panel" role="status">{state.lastError}</p>}
        </PorchScene>
      </section>
      {signedOut && <Leaderboard day={state.day} ended={false} />}
      <Modal open={showAccount} onClose={() => setShowAccount(false)} aria-label="Account menu"><Link to={`/u/${encodeURIComponent(userId)}`}>My gallery</Link><Link to="/settings">Settings</Link><button type="button" onClick={() => signOut()}>Sign out</button><button type="button" onClick={() => setShowAccount(false)}>Close</button></Modal>
      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
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
    : state.latest
      ? state.latest.total >= 700
        ? 'correct'
        : state.latest.total >= 350
          ? 'guess'
          : 'idle'
      : 'idle'

  const guessWord = state.latest?.guess?.trim()
  const guessLine = guessWord
    ? /^(an?)\b/i.test(guessWord)
      ? `Looks like ${guessWord}!`
      : `Looks like a ${guessWord}!`
    : 'Scored!'

  const haikuBubble = state.grading ? (
    'Hmm…'
  ) : state.latest ? (
    <span className="daily-haiku__speech">
      <strong className="daily-haiku__headline">
        {guessLine}&nbsp;&middot;&nbsp;{state.latest.total}
      </strong>
      {state.latest.reason && (
        <span className="daily-haiku__reason">{state.latest.reason}</span>
      )}
    </span>
  ) : (
    <span className="daily-haiku__speech">
      <strong className="daily-haiku__headline">Paint away!</strong>
      <span className="daily-haiku__reason">Tap Grade when you want a look.</span>
    </span>
  )

  return (
    <div
      data-testid="daily-page"
      className={
        state.status === 'playing'
          ? 'daily-page daily-page--playing mx-auto flex w-full max-w-[1400px] flex-col gap-2 px-1 py-1 md:px-4 md:py-4'
          : 'mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-4 sm:px-6'
      }
    >
      {state.status !== 'playing' && <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="pp-logo text-3xl">Daily Challenge</span>
        <Button type="button" variant="secondary" size="sm" onClick={toggleMute} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} className="pp-chip gap-2 text-base">
          {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
          {muted ? 'Sound off' : 'Sound on'}
        </Button>
      </div>}
      {/* Signed in: Playing */}
      {isSignedIn && state.loaded && state.status === 'playing' && (
        <div data-testid="daily-playing" className="daily-play">
          <PlayBackdrop phase={playTransition} onTransitionEnd={finishPlayTransition} />
          <div className={playTransition === 'active' ? 'play-controls' : 'play-controls play-controls--transition'}>
            <PlayLayout
              variant="daily"
              prompt={
                <div className="play-prompt daily-clipboard__prompt">
                  <span className="play-prompt__heading">Today’s prompt</span>
                  <span
                    data-testid="daily-prompt"
                    className="pp-word text-2xl uppercase tracking-wide text-[var(--sunset-1)] sm:text-3xl"
                  >
                    {state.prompt}
                  </span>
                  <DailyTimer startedAt={state.startedAt} endsAt={state.endsAt} clockOffsetMs={state.clockOffsetMs} />
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
              exit={<ExitDailyButton onExit={() => setPlayTransition('leaving')} />}
              mobileTop={
                <div className="daily-mobile-top">
                  <div className="daily-mobile-top__prompt">
                    <span className="daily-mobile-top__label">Prompt</span>
                    <span data-testid="daily-prompt" className="pp-word daily-mobile-top__word">
                      {state.prompt}
                    </span>
                  </div>
                  <div className="daily-mobile-top__right">
                    <DailyTimer startedAt={state.startedAt} endsAt={state.endsAt} clockOffsetMs={state.clockOffsetMs} />
                    <ExitDailyButton compact onExit={() => setPlayTransition('leaving')} />
                  </div>
                </div>
              }
              canvas={
                <div ref={boardRef} className="flex w-full min-w-0 justify-center">
                  <HoverEasel>
                    <PixelCanvas
                      width={32}
                      height={32}
                      availWidth={boardBox.mobile ? Math.max(32, boardBox.width + 6) : Math.max(32, boardBox.width - 56)}
                      availHeight={boardBox.mobile ? Math.max(32, boardBox.height) : Math.min(596, Math.max(32, boardBox.height - 50))}
                      cells={cells}
                      activeColor={activeColor}
                      tool={tool}
                      canDraw={canDraw}
                      word={state.prompt}
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
                <div className="daily-right-stage">
                  <div className="daily-haiku-perch">
                    <div className="daily-haiku-perch__cat">
                      <Haiku state={haikuState} bubble={haikuBubble} scale={3} />
                    </div>
                    <div className="daily-haiku-perch__crate" aria-hidden="true" />
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
              mobileFooter={
                <div ref={mobileFooterRef} className="daily-mobile-footer">
                  {mobileHaikuOpen && (
                    <div
                      role="dialog"
                      aria-label="Haiku's message"
                      data-testid="daily-mobile-haiku-popover"
                      className="daily-mobile-haiku-popover"
                    >
                      <div className="daily-mobile-haiku-popover__content">{haikuBubble}</div>
                      <button
                        type="button"
                        onClick={() => setMobileHaikuOpen(false)}
                        className="daily-mobile-haiku-popover__close"
                        aria-label="Close Haiku message"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div className="daily-mobile-strip">
                    <button
                      type="button"
                      data-testid="daily-mobile-haiku"
                      data-haiku-state={haikuState}
                      aria-expanded={mobileHaikuOpen}
                      aria-label={mobileHaikuOpen ? "Hide Haiku's message" : "View Haiku's message"}
                      onClick={() => {
                        setMobileScoreOpen(false)
                        setMobileHaikuOpen(open => !open)
                      }}
                      className="daily-mobile-strip__haiku"
                    >
                      <Haiku state={haikuState} bubble={false} scale={1.65} data-testid="daily-mobile-haiku-sprite" />
                      {(state.grading || state.latest) && (
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
                    </div>
                  </Modal>
                </div>
              }
            />
          </div>
        </div>
      )}

      {/* Signed in: Ended */}
      {isSignedIn && state.loaded && state.status === 'ended' && (
        <div data-testid="daily-ended" className="flex flex-col gap-6">
          <div className="pp-panel flex flex-wrap items-center justify-between gap-3 bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default" className="uppercase">
                Attempt Complete
              </Badge>
              {(state.prompt ?? bestDrawingDoc?.prompt) && (
                <span
                  data-testid="daily-prompt"
                  className="text-lg uppercase tracking-wider text-[var(--sunset-1)] sm:text-xl"
                >
                  {state.prompt ?? bestDrawingDoc?.prompt}
                </span>
              )}
            </div>
            <span className="text-base text-[var(--sunset-1)]">
              Best: {endedBestScore} / 1000
            </span>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div ref={boardRef} className="flex min-w-0 flex-col gap-4">
              <PixelCanvas
                width={32}
                height={32}
                availWidth={boardBox.width}
                availHeight={boardBox.height}
                cells={endedCells}
                activeColor={activeColor}
                canDraw={false}
                word={state.prompt ?? bestDrawingDoc?.prompt}
                onPlace={paint}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <AutoGradeTimeline windows={state.windows} now={now + state.clockOffsetMs} />
              <p>Manual grades: {state.asksUsed} of 3 used</p>
              <GradePanel
                latest={endedGrade}
                best={endedBestScore}
                grading={state.grading}
                lastError={state.lastError}
                ended
              />
            </div>
          </div>

          <Leaderboard day={state.day} ended={state.status === 'ended'} />
        </div>
      )}

      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </div>
  )
}
