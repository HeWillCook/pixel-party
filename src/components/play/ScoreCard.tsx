import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import type { GradeView } from '../../server/daily-service'

export interface ScoreCardProps {
  latest: GradeView | null
  best: number
  grading: boolean
  lastError: string | null
  ended?: boolean
  notice?: string | null
  sheet?: boolean
  actions?: ReactNode
}

export function ScoreCard({ latest, best, grading, lastError, notice, sheet = false, actions }: ScoreCardProps) {
  const parts = [
    { label: 'Matches the prompt', value: latest?.fit ?? 0, max: 500, id: 'grade-fit', color: 'sun' },
    { label: 'Easy to recognise', value: latest?.recognition ?? 0, max: 400, id: 'grade-recognition', color: 'sea' },
    { label: 'Speed', value: latest?.speed ?? 0, max: 100, id: 'grade-speed', color: 'peach' },
  ] as const

  return (
    <section
      aria-label="How you're scored"
      className={sheet ? 'play-score-card daily-chalkboard daily-chalkboard--sheet' : 'play-score-card daily-chalkboard'}
    >
      <div className="daily-chalkboard__frame">
        <div className="daily-chalkboard__slate" data-testid="grade-panel" aria-live="polite">
          <div className="daily-chalkboard__head">
            <h2>How you&rsquo;re scored</h2>
            <span data-testid={sheet ? undefined : 'daily-best-score'} className="daily-chalkboard__best">
              Best: {best} / 1000
            </span>
          </div>

          {notice && (
            <div role="status" className="daily-chalkboard__notice">
              {notice}
            </div>
          )}

          {lastError && (
            <div data-testid="daily-grade-error" role="status" className="daily-chalkboard__error">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              <span>{lastError}</span>
            </div>
          )}

          {latest ? (
            <div className="daily-chalkboard__body">
              <div className="daily-chalkboard__total-row">
                <span className="daily-chalkboard__total-label">Score</span>
                <span data-testid="grade-total" className="daily-chalkboard__total">
                  {latest.total} / 1000
                </span>
              </div>

              <div data-testid="daily-score-breakdown" className="daily-chalkboard__bars">
                {parts.map(part => {
                  const pct = Math.max(0, Math.min(100, Math.round((part.value / part.max) * 100)))
                  return (
                    <div key={part.id} className="daily-chalkboard__row">
                      <div className="daily-chalkboard__row-labels">
                        <span>{part.label}</span>
                        <span data-testid={part.id}>
                          {part.value} / {part.max}
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={part.label}
                        aria-valuenow={part.value}
                        aria-valuemin={0}
                        aria-valuemax={part.max}
                        className="daily-chalk-bar"
                      >
                        <span
                          className={`daily-chalk-bar__fill daily-chalk-bar__fill--${part.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="daily-chalkboard__note">
                <p data-testid="daily-latest-guess" className="daily-chalkboard__guess">
                  Haiku thinks: {latest.guess || '—'}
                </p>
                {latest.reason && (
                  <p data-testid="daily-latest-reason" className="daily-chalkboard__reason">
                    &ldquo;{latest.reason}&rdquo;
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="daily-chalkboard__body">
              <p className="daily-chalkboard__status">
                {grading ? 'Haiku is looking…' : 'No grade yet — paint to get a score'}
              </p>
              <div data-testid="daily-score-breakdown" className="daily-chalkboard__bars">
                {parts.map(part => (
                  <div key={part.label} className="daily-chalkboard__row">
                    <div className="daily-chalkboard__row-labels">
                      <span>{part.label}</span>
                      <span>— / {part.max}</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${part.label}, not graded yet`}
                      aria-valuenow={0}
                      aria-valuemin={0}
                      aria-valuemax={part.max}
                      className="daily-chalk-bar"
                    >
                      <span className="daily-chalk-bar__fill" style={{ width: '0%' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!sheet && (
            <p className="daily-chalkboard__hint" data-testid="daily-chalkboard-hint">
              Grade now keeps you drawing &middot; Submit locks your best score &amp; speed
            </p>
          )}
        </div>
      </div>

      {!sheet && (
        <>
          <div className="daily-chalkboard__ledge" aria-hidden="true">
            <span className="daily-chalkboard__chalk daily-chalkboard__chalk--white" />
            <span className="daily-chalkboard__chalk daily-chalkboard__chalk--warm" />
            <span className="daily-chalkboard__chalk daily-chalkboard__chalk--teal" />
          </div>
          {actions && (
            <div className="daily-chalkboard__hanging" data-testid="daily-plaques-hanging">
              <div className="daily-chalkboard__chains" aria-hidden="true">
                <span />
                <span />
              </div>
              {actions}
            </div>
          )}
        </>
      )}
    </section>
  )
}
