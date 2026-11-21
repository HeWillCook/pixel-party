import { AlertCircle, Award, Cat, FlaskConical, Sparkles } from 'lucide-react'
import type { GradeView } from '../../server/daily-service'
import type { VerdictStage } from '../../hooks/useDailyAttempt'
import { cn } from '../../lib/utils'

declare const __DAILY_JUDGE__: 'fake' | 'local' | 'real' | undefined

/**
 * Build-time judge mode. Never import this from the server module — that would
 * pull worker code into the client bundle. `fake` means the deterministic
 * canned guesser is running (dev/tests), so the wording must not be mistaken
 * for real Haiku vision.
 */
export function simulatedJudge(): boolean {
  return typeof __DAILY_JUDGE__ !== 'undefined' && __DAILY_JUDGE__ === 'fake'
}

export interface GradePanelProps {
  latest: GradeView | null
  best: number
  grading: boolean
  lastError: string | null
  ended?: boolean
  /** The final verdict reveal: suspense line, then the guess, then the score. */
  stage?: VerdictStage | null
}

export function GradePanel({
  latest,
  best,
  grading,
  lastError,
  ended = false,
  stage = null,
}: GradePanelProps) {
  const showScore = stage === null || stage === 'score'
  const showGuess = stage === null || stage === 'guess' || stage === 'score'
  return (
    <div
      data-testid="grade-panel"
      aria-live="polite"
      className={cn(
        'pp-panel flex flex-col gap-3 p-3.5 sm:p-4 transition-colors',
        lastError ? 'border-border bg-secondary' : 'border-border bg-card',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles
            className={cn('h-4 w-4 text-[var(--sunset-1)]', grading && 'animate-spin')}
            aria-hidden
          />
          <span className="text-base uppercase tracking-wider text-[var(--sunset-1)]">
            {grading ? 'Haiku is looking…' : ended ? 'Final Verdict' : "Haiku's Verdict"}
          </span>
          {simulatedJudge() && (
            <span
              data-testid="daily-simulated-judge"
              title="Canned dev/test judge — not real Haiku vision"
              className="inline-flex items-center gap-1 border border-border bg-secondary px-1.5 py-0.5 text-xs uppercase tracking-wider text-muted-foreground"
            >
              <FlaskConical className="h-3 w-3" aria-hidden />
              Simulated dev judge
            </span>
          )}
        </div>

        <span
          data-testid="daily-best-score"
          className="inline-flex items-center gap-1.5 bg-secondary px-2.5 py-0.5 text-base text-[var(--sunset-1)] ring-1 ring-ring"
        >
          <Award className="h-3.5 w-3.5 text-[var(--sunset-1)]" aria-hidden />
          Best: {best} / 1000
        </span>
      </div>

      {lastError && (
        <div
          data-testid="daily-grade-error"
          role="status"
          className="flex items-center gap-2 border border-border bg-secondary px-3 py-2 text-base text-[var(--sunset-1)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-[var(--sunset-1)]" aria-hidden />
          <span>{lastError}</span>
        </div>
      )}

      {latest ? (
        <div className="space-y-3">
          {showGuess && (
            <div className="border border-border bg-background/50 p-3">
              <p
                data-testid="daily-latest-guess"
                className="text-lg text-[var(--sunset-1)] sm:text-2xl"
              >
                Haiku thinks: {latest.guess || '—'}
              </p>
              {latest.reason && (
                <p
                  data-testid="daily-latest-reason"
                  className="mt-1 text-base text-muted-foreground"
                >
                  {latest.reason}
                </p>
              )}
            </div>
          )}

          {showScore && (
            <div
              data-testid="daily-score-breakdown"
              className="flex flex-col gap-3 bg-background/60 p-2.5 text-base"
            >
              {[
                { label: 'Matches the prompt', value: latest.matchPoints, max: 500, id: 'grade-match' },
                { label: 'Art quality bonus', value: latest.qualityBonus, max: 500, id: 'grade-quality' },
              ].map(part => (
                <div key={part.id}>
                  <div className="flex justify-between gap-2">
                    <span>{part.label}</span>
                    <span data-testid={part.id}>{part.value} / {part.max}</span>
                  </div>
                  <progress aria-label={part.label} value={part.value} max={part.max} className="h-2 w-full accent-[var(--sunset-1)]" />
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                The art quality bonus only grows with how well the drawing matches the prompt.
              </p>
              <div className="flex justify-between gap-2">
                <span>Total</span>
                <span data-testid="grade-total" className="text-[var(--sunset-1)]">{latest.total} / 1000</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1 text-base text-muted-foreground sm:text-lg">
          <Cat className="h-4 w-4 shrink-0 text-[var(--sunset-1)]" aria-hidden />
          <span>
            {ended
              ? `Final best score: ${best} / 1000.`
              : 'No judgement yet — Haiku looks at 2:30 and delivers the final verdict at 5:00.'}
          </span>
        </div>
      )}
    </div>
  )
}
