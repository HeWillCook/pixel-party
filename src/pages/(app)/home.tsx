import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, useQuery } from 'deepspace'
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
import { DailyTimer } from '../../components/daily/DailyTimer'
import { Leaderboard } from '../../components/daily/Leaderboard'
import { GradePanel } from '../../components/daily/GradePanel'
import { AutoGradeTimeline } from '../../components/daily/AutoGradeTimeline'
import { ExitDailyButton } from '../../components/daily/ExitDailyButton'
import { Palette } from '../../components/game/Palette'
import { PixelCanvas } from '../../components/game/PixelCanvas'
import { Badge, Button } from '../../components/ui'
import { canAskDaily, canPaintDaily } from '../../game/daily/client-schedule'
import { decodeCells } from '../../game/grid'
import { useDaily } from '../../hooks/DailyAttemptProvider'
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
    if (decoded.every((c) => c <= 15)) return decoded
  } catch {
    // Ignore invalid base64
  }
  return fallback
}

export default function DailyHomePage() {
  const { isLoaded, isSignedIn, user } = useAuthProfileReady({ requireUser: false })
  const { state, cells, paint, start, askNow, done } = useDaily()
  const { muted, toggleMute } = useDailySounds(state)
  const boardRef = useRef<HTMLDivElement>(null)
  const paletteRef = useRef<HTMLDivElement>(null)
  const [boardBox, setBoardBox] = useState({ width: 320, height: 600 })

  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const measure = () => {
      const top = board.getBoundingClientRect().top + (board.closest('main')?.scrollTop ?? 0)
      const paletteHeight = paletteRef.current?.getBoundingClientRect().height ?? 0
      const width = board.clientWidth
      const height = Math.max(200, window.innerHeight - top - paletteHeight - 48)
      setBoardBox(previous => previous.width === width && previous.height === height ? previous : { width, height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(board)
    if (paletteRef.current) observer.observe(paletteRef.current)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [state.status, isSignedIn])

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

  const [activeColor, setActiveColor] = useState<number>(4)
  const [starting, setStarting] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [now, setNow] = useState<number>(() => Date.now())

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
    setStarting(true)
    try {
      await start()
    } finally {
      setStarting(false)
    }
  }

  return (
    <div
      data-testid="daily-page"
      className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-4 sm:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="pp-logo text-3xl">Daily Challenge</span>
        <Button type="button" variant="secondary" size="sm" onClick={toggleMute} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} className="pp-chip gap-2 text-base">
          {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
          {muted ? 'Sound off' : 'Sound on'}
        </Button>
      </div>
      {isSignedIn && !state.loaded && <div data-testid="daily-loading" className="pp-panel p-6" aria-live="polite">Setting up your easel…</div>}
      {/* Signed out view */}
      {isLoaded && !isSignedIn && (
        <div className="flex flex-col gap-6">
          <section
            data-testid="daily-signed-out"
            className="pp-panel relative overflow-hidden border-2 border-border p-5 sm:p-8"
          >
            <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div className="max-w-xl space-y-2.5">
                <div className="pp-chip inline-flex items-center gap-2 px-3 py-1 text-base">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  <span className="uppercase tracking-wider">
                    Solo Daily Pixel Challenge
                  </span>
                </div>
                <h1 className="text-2xl uppercase tracking-tight text-foreground sm:text-4xl">
                  One Prompt. 10 Minutes. Judged by Haiku.
                </h1>
                <p className="text-lg text-muted-foreground sm:text-xl">
                  Everyone gets the same daily scene on a 32×32 canvas. You have 10 minutes, auto-grades every 2 minutes, and 3 manual grades. Your highest-scoring snapshot goes on today&apos;s leaderboard!
                </p>
              </div>

              <div className="flex flex-col items-stretch gap-3 sm:flex-row lg:flex-col">
                <Button
                  type="button"
                  data-testid="daily-sign-in-button"
                  onClick={() => setShowAuthModal(true)}
                  className="pp-btn inline-flex items-center justify-center gap-2.5 bg-secondary px-6 py-3.5 text-lg uppercase tracking-wider text-primary-foreground hover:bg-secondary sm:text-xl"
                >
                  <LogIn className="h-5 w-5" aria-hidden />
                  Sign in to play
                </Button>
                <Link
                  to="/party"
                  className="pp-btn inline-flex items-center justify-center gap-2 bg-secondary px-5 py-2.5 text-base uppercase tracking-wider text-foreground hover:bg-secondary/80"
                >
                  <Users className="h-4 w-4 text-[var(--sunset-1)]" aria-hidden />
                  Party mode
                </Link>
              </div>
            </div>
          </section>

          <Leaderboard day={state.day} ended={false} />
        </div>
      )}

      {/* Signed in: Not started */}
      {isSignedIn && state.loaded && state.status === 'not_started' && (
        <section
          data-testid="daily-not-started"
          className="pp-panel mx-auto flex w-full max-w-2xl flex-col gap-5 border-2 border-border p-6 sm:p-8"
        >
          <div className="space-y-2">
            <div className="pp-chip inline-flex items-center gap-2 px-3 py-1 text-base">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="uppercase tracking-wider">
                Daily Challenge • {state.day}
              </span>
            </div>
            <h1 className="text-2xl uppercase tracking-tight text-foreground sm:text-3xl">
              Ready for Today&apos;s Prompt?
            </h1>
            <p className="text-lg text-muted-foreground">
              Today&apos;s prompt is hidden until you start. Once you press Start, your 10-minute clock begins immediately.
            </p>
          </div>

          <ul className="space-y-2 border border-border/60 bg-background/50 p-4 text-base text-muted-foreground sm:text-lg">
            <li>Matches the prompt: up to 500</li>
            <li>Easy to recognise: up to 400</li>
            <li>Speed: up to 100</li>
            <li>Auto-grades at 2, 4, 6 and 8 minutes · 3 manual grades · your best grade counts · Submit ends it</li>
          </ul>

          {state.lastError && (
            <p role="status" className="text-base text-[var(--sunset-1)]">
              {state.lastError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button
              type="button"
              data-testid="daily-start-button"
              disabled={starting}
              onClick={handleStart}
              className="pp-btn inline-flex items-center gap-2.5 bg-secondary px-6 py-3.5 text-lg uppercase tracking-wider text-primary-foreground hover:bg-secondary sm:text-xl"
            >
              <Play className="h-5 w-5 fill-current" aria-hidden />
              {starting ?'Starting…' : 'Start Daily Challenge'}
            </Button>

            <Link
              to="/party"
              className="text-base uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Or play Party mode →
            </Link>
          </div>
        </section>
      )}

      {/* Signed in: Playing */}
      {isSignedIn && state.loaded && state.status === 'playing' && (
        <div data-testid="daily-playing" className="flex flex-col gap-4">
          {/* Top Bar: Prompt + Timer + Best */}
          <div className="pp-panel flex flex-wrap items-center justify-between gap-3 bg-card px-4 py-3">
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
              <ExitDailyButton />
            </div>
          </div>

          {/* Main Stage */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            {/* Left: Canvas + Palette */}
            <div ref={boardRef} className="flex min-w-0 flex-col gap-4">
              <PixelCanvas
                width={32}
                height={32}
                availWidth={boardBox.width}
                availHeight={boardBox.height}
                cells={cells}
                activeColor={activeColor}
                canDraw={canDraw}
                word={state.prompt}
                onPlace={paint}
              />

              <div ref={paletteRef}>
                <Palette
                  activeColor={activeColor}
                  onSelectColor={setActiveColor}
                  disabled={!canDraw}
                />
              </div>
            </div>

            {/* Right: Controls + GradePanel */}
            <div className="flex min-w-0 flex-col gap-4">
              {state.notice && <div role="status" className="pp-panel p-4">{state.notice}</div>}
              <AutoGradeTimeline windows={state.windows} now={now + state.clockOffsetMs} />
              <GradePanel
                latest={state.latest}
                best={state.best}
                grading={state.grading}
                lastError={state.lastError}
              />

              <div className="pp-panel flex flex-col gap-3 bg-card p-4">
                <div className="flex flex-wrap items-center gap-2.5">
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
            </div>
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
