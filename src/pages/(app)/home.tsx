import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, useQuery } from 'deepspace'
import {
  Bot,
  CheckCircle2,
  LogIn,
  Play,
  Sparkles,
  Users,
} from 'lucide-react'
import { DailyTimer } from '../../components/daily/DailyTimer'
import { Leaderboard } from '../../components/daily/Leaderboard'
import { GradePanel } from '../../components/daily/GradePanel'
import { Palette } from '../../components/game/Palette'
import { PixelCanvas } from '../../components/game/PixelCanvas'
import { Badge, Button } from '../../components/ui'
import { DAILY } from '../../game/config'
import { canAskDaily, canPaintDaily } from '../../game/daily/client-schedule'
import { decodeCells } from '../../game/grid'
import { useDailyAttempt } from '../../hooks/useDailyAttempt'
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
  visibility: 'public' | 'private'
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
  const { state, cells, paint, start, askNow, done } = useDailyAttempt()

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

  const asksLeft = Math.max(0, DAILY.maxAsks - state.asksUsed)
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
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8"
    >
      {/* Signed out view */}
      {isLoaded && !isSignedIn && (
        <div className="flex flex-col gap-6">
          <section
            data-testid="daily-signed-out"
            className="arcade-card relative overflow-hidden rounded-xl border-2 border-amber-400/80 bg-gradient-to-br from-[#231b42] via-[#171426] to-[#2d1636] p-5 sm:p-8"
          >
            <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div className="max-w-xl space-y-2.5">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  <span className="font-pixel uppercase tracking-wider">
                    Solo Daily Pixel Challenge
                  </span>
                </div>
                <h1 className="font-pixel text-2xl font-extrabold uppercase tracking-tight text-foreground sm:text-4xl">
                  One Prompt. 10 Minutes. Judged by Haiku.
                </h1>
                <p className="text-sm text-muted-foreground sm:text-base">
                  Everyone gets the same daily scene on a 32×32 canvas. You have 10 minutes, auto-grades every 2 minutes, and 3 Ask-nows. Your highest-scoring snapshot goes on today&apos;s leaderboard!
                </p>
              </div>

              <div className="flex flex-col items-stretch gap-3 sm:flex-row lg:flex-col">
                <Button
                  type="button"
                  data-testid="daily-sign-in-button"
                  onClick={() => setShowAuthModal(true)}
                  className="arcade-btn font-pixel inline-flex items-center justify-center gap-2.5 rounded-lg bg-amber-400 px-6 py-3.5 text-sm font-extrabold uppercase tracking-wider text-slate-950 hover:bg-amber-300 sm:text-base"
                >
                  <LogIn className="h-5 w-5" aria-hidden />
                  Sign in to play
                </Button>
                <Link
                  to="/party"
                  className="arcade-btn font-pixel inline-flex items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-secondary/80"
                >
                  <Users className="h-4 w-4 text-cyan-400" aria-hidden />
                  Party mode
                </Link>
              </div>
            </div>
          </section>

          <Leaderboard day={state.day} ended={false} />
        </div>
      )}

      {/* Signed in: Not started */}
      {isSignedIn && state.status === 'not_started' && (
        <section
          data-testid="daily-not-started"
          className="arcade-card mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-xl border-2 border-amber-400/80 bg-gradient-to-br from-[#231b42] via-[#171426] to-[#2d1636] p-6 sm:p-8"
        >
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="font-pixel uppercase tracking-wider">
                Daily Challenge • {state.day}
              </span>
            </div>
            <h1 className="font-pixel text-2xl font-extrabold uppercase tracking-tight text-foreground sm:text-3xl">
              Ready for Today&apos;s Prompt?
            </h1>
            <p className="text-sm text-muted-foreground">
              Today&apos;s prompt is hidden until you start. Once you press Start, your 10-minute clock begins immediately.
            </p>
          </div>

          <ul className="space-y-2 rounded-lg border border-border/60 bg-background/50 p-4 text-xs text-muted-foreground sm:text-sm">
            <li>
              <strong className="font-pixel text-foreground">10 minutes:</strong>{' '}
              One solo attempt per UTC day on a 32×32 pixel grid.
            </li>
            <li>
              <strong className="font-pixel text-foreground">Grades every 2 minutes:</strong>{' '}
              Claude Haiku automatically checks your drawing at 2, 4, 6, and 8 minutes.
            </li>
            <li>
              <strong className="font-pixel text-foreground">3 Ask-nows:</strong>{' '}
              Request an immediate judge check up to 3 times whenever your drawing reads well.
            </li>
            <li>
              <strong className="font-pixel text-foreground">Best score kept:</strong>{' '}
              Scored out of 1,000 (500 fit + 400 blind recognition + 100 speed). Your highest grade is saved!
            </li>
          </ul>

          {state.lastError && (
            <p role="status" className="text-xs font-medium text-amber-300">
              {state.lastError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button
              type="button"
              data-testid="daily-start-button"
              disabled={starting}
              onClick={handleStart}
              className="arcade-btn font-pixel inline-flex items-center gap-2.5 rounded-lg bg-amber-400 px-6 py-3.5 text-sm font-extrabold uppercase tracking-wider text-slate-950 hover:bg-amber-300 sm:text-base"
            >
              <Play className="h-5 w-5 fill-current" aria-hidden />
              {starting ? 'Starting…' : 'Start Daily Challenge'}
            </Button>

            <Link
              to="/party"
              className="font-pixel text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Or play Party mode →
            </Link>
          </div>
        </section>
      )}

      {/* Signed in: Playing */}
      {isSignedIn && state.status === 'playing' && (
        <div data-testid="daily-playing" className="flex flex-col gap-4">
          {/* Top Bar: Prompt + Timer + Best */}
          <div className="arcade-card flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-pixel text-xs uppercase tracking-wider text-muted-foreground">
                Prompt:
              </span>
              <span
                data-testid="daily-prompt"
                className="font-pixel rounded-md border-2 border-amber-400/80 bg-amber-400/15 px-3 py-1 text-sm font-extrabold uppercase tracking-wider text-amber-300 sm:text-base"
              >
                {state.prompt}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <DailyTimer startedAt={state.startedAt} endsAt={state.endsAt} />
            </div>
          </div>

          {/* Main Stage */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
            {/* Left: Canvas + Palette */}
            <div className="flex flex-col gap-3 lg:col-span-7">
              <PixelCanvas
                width={32}
                height={32}
                cells={cells}
                activeColor={activeColor}
                canDraw={canDraw}
                word={state.prompt}
                onPlace={paint}
              />

              <Palette
                activeColor={activeColor}
                onSelectColor={setActiveColor}
                disabled={!canDraw}
              />
            </div>

            {/* Right: Controls + GradePanel */}
            <div className="flex flex-col gap-3 lg:col-span-5">
              <GradePanel
                latest={state.latest}
                best={state.best}
                grading={state.grading}
                lastError={state.lastError}
              />

              <div className="arcade-card flex flex-col gap-3 rounded-lg bg-card p-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button
                    type="button"
                    data-testid="daily-ask-button"
                    disabled={!canAsk}
                    onClick={() => void askNow()}
                    className="arcade-btn font-pixel flex-1 gap-2 bg-pink-600 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-pink-500 disabled:opacity-60 sm:text-sm"
                  >
                    <Bot className="h-4 w-4 shrink-0" aria-hidden />
                    <span>Ask now ({asksLeft} left)</span>
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="daily-done-button"
                    disabled={state.grading || (state.finalizing && !state.endFailed)}
                    onClick={() => void done()}
                    className="arcade-btn font-pixel gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider sm:text-sm"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
                    <span>
                      {state.endFailed
                        ? 'Retry Done'
                        : state.finalizing
                          ? 'Finishing…'
                          : 'Done'}
                    </span>
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Auto-grades run at 2, 4, 6, and 8 minutes ({state.autoUsed}/{DAILY.maxAuto} used). Pressing Done runs one final grade and locks in your best score.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signed in: Ended */}
      {isSignedIn && state.status === 'ended' && (
        <div data-testid="daily-ended" className="flex flex-col gap-6">
          <div className="arcade-card flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default" className="font-pixel uppercase">
                Attempt Complete
              </Badge>
              {(state.prompt ?? bestDrawingDoc?.prompt) && (
                <span
                  data-testid="daily-prompt"
                  className="font-pixel text-sm font-extrabold uppercase tracking-wider text-amber-300 sm:text-base"
                >
                  {state.prompt ?? bestDrawingDoc?.prompt}
                </span>
              )}
            </div>
            <span className="font-pixel text-xs font-bold text-emerald-300">
              Best: {endedBestScore} / 1000
            </span>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
            <div className="flex flex-col gap-3 lg:col-span-7">
              <PixelCanvas
                width={32}
                height={32}
                cells={endedCells}
                activeColor={activeColor}
                canDraw={false}
                word={state.prompt ?? bestDrawingDoc?.prompt}
                onPlace={paint}
              />
            </div>

            <div className="flex flex-col gap-3 lg:col-span-5">
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
