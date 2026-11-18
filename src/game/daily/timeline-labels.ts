import { DAILY } from '../config'
import type { AutoWindowView } from '../../server/daily-service'

function timeLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function timelineLabel(window: AutoWindowView, now: number): string {
  const time = timeLabel(DAILY.autoWindowsMs[window.index] / 1_000)
  switch (window.status) {
    case 'graded': return window.score === null ? `${time} · graded` : `${time} · ${window.score}${window.late ? ' (late)' : ''}`
    case 'skipped_unchanged': return `${time} skipped: no changes since your last grade`
    case 'skipped_blank': return `${time} skipped: nothing drawn yet`
    case 'missed': return `${time} missed: tab was closed`
    case 'not_reached': return `${time} not reached: you submitted`
    case 'pending': return window.dueAt > now ? `${time} in ${timeLabel(Math.ceil((window.dueAt - now) / 1_000))}` : `${time} grading…`
  }
}
