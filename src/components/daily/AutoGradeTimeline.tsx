import { finalVerdictLabel, timelineLabel } from '../../game/daily/timeline-labels'
import type { AutoWindowView } from '../../server/daily-service'
import { DAILY } from '../../game/config'

export function AutoGradeTimeline({
  windows,
  now,
  startedAt,
  finalUsed = false,
  ended = false,
  embedded = false,
}: {
  windows: AutoWindowView[]
  now: number
  startedAt?: number | null
  finalUsed?: boolean
  ended?: boolean
  embedded?: boolean
}) {
  const rows = windows.length
    ? windows
    : startedAt == null
      ? []
      : DAILY.autoWindowsMs.map(
          (offset, index): AutoWindowView => ({
            index,
            dueAt: startedAt + offset,
            status: 'pending',
            score: null,
            late: false,
          }),
        )
  return (
    <section
      className={embedded ? 'daily-clipboard__timeline' : 'pp-panel bg-card p-4'}
      data-testid="daily-auto-timeline"
      aria-label="Judgement timeline"
    >
      <h2 className={embedded ? 'daily-clipboard__subhead' : 'text-lg text-[var(--sunset-1)]'}>
        Judgements
      </h2>
      <ol className={embedded ? 'daily-clipboard__rows' : 'mt-2 space-y-1 text-base text-muted-foreground'}>
        {rows.map(window => (
          <li key={window.index}>{timelineLabel(window, now)}</li>
        ))}
        <li data-testid="daily-final-verdict-row">
          {finalVerdictLabel({ startedAt, finalUsed, ended, now })}
        </li>
      </ol>
    </section>
  )
}
