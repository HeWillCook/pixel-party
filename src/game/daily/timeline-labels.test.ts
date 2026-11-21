import { describe, expect, it } from 'vitest'
import { timelineLabel } from './timeline-labels'
import type { AutoWindowView } from '../../server/daily-service'

const windowAt = (index: number, status: AutoWindowView['status'], score: number | null = null, late = false): AutoWindowView => ({ index, dueAt: 1_000_000 + (index + 1) * 60_000, status, score, late })

describe('timelineLabel', () => {
  it('labels graded windows, including late and unknown scores', () => {
    expect(timelineLabel(windowAt(0, 'graded', 655), 0)).toBe('1:00 · 655')
    expect(timelineLabel(windowAt(0, 'graded', 655, true), 0)).toBe('1:00 · 655 (late)')
    expect(timelineLabel(windowAt(0, 'graded'), 0)).toBe('1:00 · graded')
    expect(timelineLabel(windowAt(0, 'graded', null, true), 0)).toBe('1:00 · graded')
  })
  it('labels skips, missed and not reached', () => {
    expect(timelineLabel(windowAt(1, 'skipped_unchanged'), 0)).toBe('2:00 skipped: no changes since your last grade')
    expect(timelineLabel(windowAt(0, 'skipped_blank'), 0)).toBe('1:00 skipped: nothing drawn yet')
    expect(timelineLabel(windowAt(2, 'missed'), 0)).toBe('3:00 missed: tab was closed')
    expect(timelineLabel(windowAt(2, 'not_reached'), 0)).toBe('3:00 not reached: you submitted')
  })
  it('labels pending windows with countdown or grading', () => {
    const pending = windowAt(2, 'pending')
    expect(timelineLabel(pending, pending.dueAt - 42_000)).toBe('3:00 in 0:42')
    expect(timelineLabel(pending, pending.dueAt)).toBe('3:00 grading…')
  })
})
