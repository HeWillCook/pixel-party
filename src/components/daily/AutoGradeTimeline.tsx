import { timelineLabel } from '../../game/daily/timeline-labels'
import type { AutoWindowView } from '../../server/daily-service'

export function AutoGradeTimeline({ windows, now }: { windows: AutoWindowView[]; now: number }) {
  return (
    <section className="pp-panel bg-card p-4" data-testid="daily-auto-timeline" aria-label="Auto-grade timeline">
      <h2 className="text-lg text-[var(--sunset-1)]">Auto-grades</h2>
      <ol className="mt-2 space-y-1 text-base text-muted-foreground">
        {windows.map(window => <li key={window.index}>{timelineLabel(window, now)}</li>)}
      </ol>
    </section>
  )
}
