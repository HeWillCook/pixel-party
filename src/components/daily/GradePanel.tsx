import { AlertCircle, Award, Bot, Sparkles } from 'lucide-react'
import type { GradeView } from '../../server/daily-service'
import { cn } from '../../lib/utils'

export interface GradePanelProps {
  latest: GradeView | null
  best: number
  grading: boolean
  lastError: string | null
  ended?: boolean
}

export function GradePanel({
  latest,
  best,
  grading,
  lastError,
  ended = false,
}: GradePanelProps) {
  return (
    <div
      data-testid="grade-panel"
      aria-live="polite"
      className={cn(
        'arcade-card flex flex-col gap-3 rounded-lg p-3.5 sm:p-4 transition-colors',
        lastError
          ? 'border-amber-500/50 bg-amber-950/30'
          : 'border-pink-500/60 bg-[#1c1532]',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles
            className={cn('h-4 w-4 text-pink-400', grading && 'animate-spin')}
            aria-hidden
          />
          <span className="font-pixel text-xs font-bold uppercase tracking-wider text-pink-300">
            {grading ? 'Judging canvas…' : ended ? 'Final Verdict' : 'Judge Verdict'}
          </span>
        </div>

        <span
          data-testid="daily-best-score"
          className="font-pixel inline-flex items-center gap-1.5 rounded bg-emerald-500/20 px-2.5 py-0.5 text-xs font-extrabold text-emerald-300 ring-1 ring-emerald-400/50"
        >
          <Award className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          Best: {best} / 1000
        </span>
      </div>

      {lastError && (
        <div
          data-testid="daily-grade-error"
          role="status"
          className="flex items-center gap-2 rounded-md border border-amber-400/50 bg-amber-950/60 px-3 py-2 text-xs font-medium text-amber-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
          <span>{lastError}</span>
        </div>
      )}

      {latest ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-pink-400/30 bg-background/50 p-3">
            <p
              data-testid="daily-latest-guess"
              className="font-pixel text-sm font-extrabold text-amber-300 sm:text-base"
            >
              Haiku thinks: {latest.guess || '—'}
            </p>
            {latest.reason && (
              <p
                data-testid="daily-latest-reason"
                className="mt-1 text-xs text-muted-foreground"
              >
                {latest.reason}
              </p>
            )}
          </div>

          <div
            data-testid="daily-score-breakdown"
            className="grid grid-cols-4 gap-2 rounded-lg bg-background/60 p-2.5 text-center text-xs"
          >
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Fit
              </span>
              <span
                data-testid="grade-fit"
                className="font-pixel mt-0.5 font-bold text-foreground"
              >
                {latest.fit} / 500
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Recognition
              </span>
              <span
                data-testid="grade-recognition"
                className="font-pixel mt-0.5 font-bold text-foreground"
              >
                {latest.recognition} / 400
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Speed
              </span>
              <span
                data-testid="grade-speed"
                className="font-pixel mt-0.5 font-bold text-foreground"
              >
                {latest.speed} / 100
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total
              </span>
              <span
                data-testid="grade-total"
                className="font-pixel mt-0.5 font-extrabold text-emerald-400"
              >
                {latest.total}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground sm:text-sm">
          <Bot className="h-4 w-4 shrink-0 text-pink-400/70" aria-hidden />
          <span>
            {ended
              ? `Final best score: ${best} / 1000.`
              : 'No grade yet — Haiku auto-grades every 2 minutes, or press Ask now whenever you want a check!'}
          </span>
        </div>
      )}
    </div>
  )
}
