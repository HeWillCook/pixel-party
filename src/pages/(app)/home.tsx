import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay, signOut, useAuthProfileReady, useQuery } from 'deepspace'
import {
  Bot,
  CheckCircle2,
  LogIn,
  Play,
  Sparkles,
  Users,
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
import { Palette } from '../../components/game/Palette'
import { PixelCanvas } from '../../components/game/PixelCanvas'
import { ToolBar } from '../../components/game/ToolBar'
import { PlayLayout } from '../../components/play/PlayLayout'
import { HoverEasel } from '../../components/play/HoverEasel'
import { ScoreCard } from '../../components/play/ScoreCard'
import { PlayBackdrop, type PlayTransition } from '../../components/play/PlayBackdrop'
import { Badge, Button } from '../../components/ui'
import { MAX_COLOR } from '../../game/config'
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
  const [boardBox, setBoardBox] = useState({ width: 320, height: 600 })
  const [resultDay, setResultDay] = useState('')

  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const measure = () => {
      const top = board.getBoundingClientRect().top + (board.closest('main')?.scrollTop ?? 0)
      const paletteHeight = paletteRef.current?.getBoundingClientRect().height ?? 0
      const width = board.clientWidth
      const height = Math.max(200, window.innerHeight - top - paletteHeight - (state.status === 'playing' ? 10 : 0))
      setBoardBox(previous => previous.width === width && previous.height === height ? previous : { width, height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(board)
    if (paletteRef.current) observer.observe(paletteRef.current)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [state.status, isSignedIn, resultDay])

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
  const [showPorch, setShowPorch] = useState(false)
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
    () => decodeSnapshotOrFallback(bestDrawingDoc?.cells ?? state.lastCells, cells),
    [bestDrawingDoc?.cells, state.lastCells, cells],
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
      await start()
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
        <PorchScene easelState={signedOut ? 'signin' : ended ? 'finished' : 'cover'} easelLabel={signedOut ? 'Sign in to paint' : ended ? 'View result' : 'Start Daily Challenge'}
          easelTestId={signedOut ? 'daily-sign-in-button' : ended ? undefined : 'daily-start-button'} easelDisabled={starting}
          easelText={signedOut ? <span className="porch-easel-action">Sign in to paint</span> : ended ? <span className="porch-easel-action">View your painting</span> : <><strong>Today’s prompt</strong><span>10 minutes · your best grade counts</span><span className="porch-easel-action">{showPorch ? 'Resume painting' : 'Start painting'}</span></>}
          signedIn={!!isSignedIn} galleryHref={`/u/${encodeURIComponent(userId)}`} topThree={topThree} muted={muted}
          onEasel={() => { if (signedOut) setShowAuthModal(true); else if (ended) setResultDay(state.day); else void handleStart() }}
          onAccount={() => { if (signedOut) setShowAuthModal(true); else setShowAccount(true) }} onToggleMute={toggleMute}>
          {state.lastError && <p className="porch-error pp-panel" role="status">{state.lastError}</p>}
        </PorchScene>
      </section>
      {signedOut && <Leaderboard day={state.day} ended={false} />}
      {showAccount && <div role="dialog" aria-label="Account menu" className="porch-account pp-panel"><Link to={`/u/${encodeURIComponent(userId)}`}>My gallery</Link><Link to="/settings">Settings</Link><button onClick={() => signOut()}>Sign out</button><button onClick={() => setShowAccount(false)}>Close</button></div>}
      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </div>
  }

  return (
    <div
      data-testid="daily-page"
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-4 sm:px-6"
    >
      {state.status !== 'playing' && <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="pp-logo text-3xl">Daily Challenge</span>
        <Button type="button" variant="secondary" size="sm" onClick={toggleMute} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} className="pp-chip gap-2 text-base">
          {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
          {muted ? 'Sound off' : 'Sound on'}
        </Button>
      </div>}
      {isSignedIn && !state.loaded && <div data-testid="daily-loading" className="pp-panel p-6" aria-live="polite">Setting up your easel…</div>}
      {/* Signed in: Playing */}
      {isSignedIn && state.loaded && state.status === 'playing' && (
        <div data-testid="daily-playing" className="daily-play">
          <PlayBackdrop phase={playTransition} onTransitionEnd={finishPlayTransition} />
          <div className={playTransition === 'active' ? 'play-controls' : 'play-controls play-controls--transition'}>
          <PlayLayout top={<div className="pp-panel flex flex-wrap items-center justify-between gap-3 bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base uppercase tracking-wider text-muted-foreground">
                Prompt:
              </span>
              <span
                data-testid="daily-prompt"
                className="pp-word text-2xl uppercase tracking-wide text-[var(--sunset-1)] sm:text-3xl"
              >
                {state.prompt}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <DailyTimer startedAt={state.startedAt} endsAt={state.endsAt} clockOffsetMs={state.clockOffsetMs} />
              <ExitDailyButton onExit={() => setPlayTransition('leaving')} />
            </div>
          </div>} left={
              <ToolBar
                tools={DAILY_TOOLS}
                active={tool}
                onSelect={setTool}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={!strokeActive && history.past.length > 0}
                canRedo={!strokeActive && history.future.length > 0}
                disabled={!canDraw}
              />
          } canvas={<div ref={boardRef} className="flex w-full min-w-0 justify-center">
              <HoverEasel>
              <PixelCanvas
                width={32}
                height={32}
                availWidth={Math.max(32, boardBox.width - 56)}
                availHeight={Math.min(596, Math.max(32, boardBox.height - 50))}
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
            </div>} right={<div className="flex min-w-0 flex-col gap-4">
              {state.notice && <div role="status" className="pp-panel p-4">{state.notice}</div>}
              <ScoreCard
                latest={state.latest}
                best={state.best}
                grading={state.grading}
                lastError={state.lastError}
              />
              <AutoGradeTimeline windows={state.windows} now={now + state.clockOffsetMs} startedAt={state.startedAt} />

              <div className="pp-panel flex flex-col gap-3 bg-card p-4">
                <div className="play-actions">
                  <Button
                    type="button"
                    data-testid="daily-ask-button"
                    disabled={!canAsk}
                    onClick={() => void askNow()}
                    className="pp-btn flex-1 gap-2 bg-secondary px-4 py-2.5 text-base uppercase tracking-wider text-white hover:bg-secondary disabled:opacity-60 sm:text-lg"
                  >
                    <Bot className="h-4 w-4 shrink-0" aria-hidden />
                    <span>Grade now ({asksLeft} left)</span>
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="daily-done-button"
                    disabled={state.stale || state.grading || (state.finalizing && !state.endFailed)}
                    onClick={() => void done()}
                    className="pp-btn gap-1.5 px-4 py-2.5 text-base uppercase tracking-wider sm:text-lg"
                  >
                    <CheckCircle2 className="h-4 w-4 text-[var(--sunset-1)]" aria-hidden />
                    <span>
                      {state.endFailed
                        ?'Retry submit'
                        : state.finalizing
                          ?'Finishing…'
                          : 'Submit & finish'}
                    </span>
                  </Button>
                </div>

                <p className="text-base text-muted-foreground">
                  Grade now keeps you drawing. Submit locks in your best score; earlier means more speed points.
                </p>
              </div>
            </div>} bottom={<div ref={paletteRef} className="pp-panel p-3"><Palette activeColor={activeColor} onSelectColor={setActiveColor} disabled={!canDraw} /></div>} />
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
