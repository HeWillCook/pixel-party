import { timelineLabel } from '../../game/daily/timeline-labels'
import type { AutoWindowView } from '../../server/daily-service'
import { DAILY } from '../../game/config'

export function AutoGradeTimeline({ windows, now, startedAt, manualUsed }: { windows: AutoWindowView[]; now: number; startedAt?: number | null; manualUsed?: number }) {
  const rows = windows.length ? windows : startedAt == null ? [] : DAILY.autoWindowsMs.map((offset, index): AutoWindowView => ({ index, dueAt: startedAt + offset, status: 'pending', score: null, late: false }))
  return (
    <section className="pp-panel bg-card p-4" data-testid="daily-auto-timeline" aria-label="Auto-grade timeline">
      <h2 className="text-lg text-[var(--sunset-1)]">Auto-grades</h2>
      <ol className="mt-2 space-y-1 text-base text-muted-foreground">
        {rows.map(window => <li key={window.index}>{timelineLabel(window, now)}</li>)}
        {manualUsed !== undefined && <li className="play-manual">Manual grades: {manualUsed} of 3 used</li>}
      </ol>
    </section>
  )
}
