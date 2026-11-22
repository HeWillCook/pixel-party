import { CheckCircle2, HelpCircle, Moon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ZoneId } from '../../game/config'
import { JUDGE } from '../../game/config'
import type { GuessLogEntry, ZoneGuess } from '../../game/client-state'
import { cn } from '../../lib/utils'

export interface GuessFeedProps {
  guesses: Record<ZoneId, ZoneGuess | undefined>
  guessLog: GuessLogEntry[]
  aiResting: boolean
  roundId?: string
  /** The board has paint on it (the empty feed must not say "place some pixels" over a painted canvas). */
  hasPixels?: boolean
  /** The round has ended (the empty feed must not promise guesses that are no longer coming). */
  roundOver?: boolean
  children?: ReactNode
}

function formatRoundClock(atMs: number): string {
  const totalSec = Math.max(0, Math.floor(atMs / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function GuessFeed({ guesses, guessLog, aiResting, hasPixels = false, roundOver = false, children }: GuessFeedProps) {
  const zoneGuess = guesses.all ?? guesses.red ?? guesses.blue
  const confidence = zoneGuess?.confidence ?? 0
  const matched = (zoneGuess?.matched ?? false) || guessLog.some((e) => e.matched)

  return (
    <div
      data-testid="guess-feed"
      aria-live="polite"
      className="pp-panel flex flex-col gap-2 px-3 py-2.5 text-[19px] leading-[1.15]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {aiResting ? (
            <Moon className="h-4 w-4 text-[var(--sunset-1)]" aria-hidden />
          ) : matched ? (
            <CheckCircle2 className="h-4 w-4 text-[var(--sunset-1)]" aria-hidden />
          ) : null}
          <h4 className="m-0 text-[22px] uppercase text-[var(--sunset-2)]">
            Haiku says
          </h4>
        </div>

        {zoneGuess && !aiResting && (
          <span
            data-testid="guess-confidence"
            className="pp-chip px-2 py-0.5 text-sm"
          >
            {Math.round(confidence * 100)}% sure
          </span>
        )}
      </div>

      {aiResting ? (
        <p
          data-testid="ai-resting-banner"
          className="text-base text-[var(--sunset-1)]"
        >
          Haiku&apos;s napping, back tomorrow
        </p>
      ) : guessLog.length === 0 ? (
        <div className="flex items-center gap-2 py-1 text-base text-muted-foreground">
          <HelpCircle className="h-4 w-4 shrink-0 text-[var(--sunset-3)]" aria-hidden />
          <span data-testid="guess-empty">
            {roundOver
              ? 'Haiku did not get a guess in this round.'
              : hasPixels
                ? `Haiku is studying the canvas. A guess lands within ${JUDGE.tickMs / 1000}s, or ring the bell.`
                : `Place some pixels! Haiku checks every ${JUDGE.tickMs / 1000}s. Draw it — no letters, words or numbers.`}
          </span>
        </div>
      ) : (
        <div
          data-testid="guess-list"
          className="max-h-48 space-y-1.5 overflow-y-auto pr-1"
        >
          {guessLog.map((entry) => (
            <p
              key={entry.id}
              data-testid={entry.text ? 'guess-text-notice' : undefined}
              className={cn(
                'm-0 leading-snug',
                entry.matched
                  ? 'border border-[var(--sunset-1)] bg-secondary/80 px-1.5 py-0.5 text-[var(--sunset-1)]'
                  : entry.text
                    ? 'border border-dashed border-[var(--sunset-3)] px-1.5 py-0.5 text-[var(--sunset-2)]'
                    : 'text-foreground',
              )}
            >
              <span className="mr-1.5 text-[var(--sunset-3)]">
                {formatRoundClock(entry.atMs)}
              </span>
              <span>{entry.text ? 'Haiku spotted letters — no spelling, draw it!' : entry.guesses.join(', ')}</span>
            </p>
          ))}
        </div>
      )}

      {children && <div className="mt-1">{children}</div>}
    </div>
  )
}
