import { DAILY } from '../config'
import type { AutoWindowView } from '../../server/daily-service'

function timeLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** The halfway judgement's row. */
export function timelineLabel(window: AutoWindowView, now: number): string {
  const time = timeLabel(DAILY.autoWindowsMs[window.index] / 1_000)
  switch (window.status) {
    case 'graded': return window.score === null ? `${time} · graded` : `${time} · ${window.score}${window.late ? ' (late)' : ''}`
    case 'skipped_unchanged': return `${time} skipped: no changes since your last judgement`
    case 'skipped_blank': return `${time} skipped: nothing drawn yet`
    case 'missed': return `${time} missed: tab was closed`
    case 'not_reached': return `${time} not reached: the attempt ended`
    case 'pending': return window.dueAt > now ? `${time} in ${timeLabel(Math.ceil((window.dueAt - now) / 1_000))}` : `${time} judging…`
  }
}

/** The final verdict's row: always the last thing on the timeline. */
export function finalVerdictLabel({ startedAt, finalUsed, ended, now }: { startedAt?: number | null; finalUsed: boolean; ended: boolean; now: number }): string {
  const time = timeLabel(DAILY.attemptMs / 1_000)
  if (ended || finalUsed) return `${time} · final verdict`
  if (startedAt == null) return `${time} final verdict`
  const dueAt = startedAt + DAILY.attemptMs
  return dueAt > now ? `${time} in ${timeLabel(Math.ceil((dueAt - now) / 1_000))}` : `${time} judging…`
}
