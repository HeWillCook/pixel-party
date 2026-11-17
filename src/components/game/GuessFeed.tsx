import { Sparkles, CheckCircle2, HelpCircle, Moon } from 'lucide-react'
import type { ZoneId } from '../../game/config'
import { JUDGE } from '../../game/config'
import type { ZoneGuess } from '../../game/client-state'
import { cn } from '../../lib/utils'

export interface GuessFeedProps {
  guesses: Record<ZoneId, ZoneGuess | undefined>
  aiResting: boolean
  roundId?: string
}

export function GuessFeed({ guesses, aiResting }: GuessFeedProps) {
  const zoneGuess = guesses.all ?? guesses.red ?? guesses.blue
  const items = zoneGuess?.guesses ?? []
  const confidence = zoneGuess?.confidence ?? 0
  const matched = zoneGuess?.matched ?? false
  const animKey = items.join('|') || 'empty'

  return (
    <div
      data-testid="guess-feed"
      aria-live="polite"
      className={cn(
        'arcade-card relative overflow-hidden rounded-lg p-3 sm:p-4 transition-colors',
        matched
          ? 'border-emerald-400 bg-emerald-950/60'
          : aiResting
            ? 'border-amber-500/50 bg-amber-950/30'
            : 'border-pink-500/60 bg-[#1c1532]',
      )}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {aiResting ? (
            <Moon className="h-4 w-4 text-amber-400" aria-hidden />
          ) : matched ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4 text-pink-400 animate-pulse" aria-hidden />
          )}
          <span className="font-pixel text-xs font-bold uppercase tracking-wider text-pink-300">
            The AI thinks:
          </span>
        </div>

        {zoneGuess && !aiResting && (
          <span
            data-testid="guess-confidence"
            className={cn(
              'font-pixel rounded px-2 py-0.5 text-[11px] font-bold',
              matched
                ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/50'
                : 'bg-pink-500/20 text-pink-200 ring-1 ring-pink-400/40',
            )}
          >
            {Math.round(confidence * 100)}% sure
          </span>
        )}
      </div>

      {aiResting ? (
        <p
          data-testid="ai-resting-banner"
          className="font-pixel text-sm font-medium text-amber-200"
        >
          The AI is resting — back tomorrow
        </p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
          <HelpCircle className="h-4 w-4 shrink-0 text-pink-400/70" aria-hidden />
          <span>Place some pixels! Claude Haiku checks the canvas every {JUDGE.tickMs / 1000}s or when you press Ask.</span>
        </div>
      ) : (
        <div
          key={animKey}
          data-testid="guess-list"
          className="flex flex-wrap items-center gap-2"
        >
          {items.map((guess, idx) => (
            <span
              key={`${guess}-${idx}`}
              style={{ animationDelay: `${idx * 65}ms` }}
              className={cn(
                'animate-guess-pop font-pixel inline-flex items-center gap-1 rounded-md border-2 px-2.5 py-1 text-xs font-bold sm:text-sm',
                matched && idx === 0
                  ? 'border-emerald-300 bg-emerald-500 text-slate-950 shadow-[0_2px_0_0_rgba(0,0,0,0.5)]'
                  : idx === 0
                    ? 'border-amber-300 bg-amber-400/20 text-amber-200 shadow-[0_2px_0_0_rgba(0,0,0,0.4)]'
                    : 'border-pink-400/40 bg-pink-950/60 text-pink-100',
              )}
            >
              {guess}?
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
