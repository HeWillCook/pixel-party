import { describe, expect, it } from 'vitest'
import { finalVerdictLabel, timelineLabel } from './timeline-labels'
import type { AutoWindowView } from '../../server/daily-service'

const windowAt = (index: number, status: AutoWindowView['status'], score: number | null = null, late = false): AutoWindowView => ({ index, dueAt: 1_000_000 + (index + 1) * 150_000, status, score, late })

describe('timelineLabel', () => {
  it('labels the halfway judgement at 2:30, including late and unknown scores', () => {
    expect(timelineLabel(windowAt(0, 'graded', 655), 0)).toBe('2:30 · 655')
    expect(timelineLabel(windowAt(0, 'graded', 655, true), 0)).toBe('2:30 · 655 (late)')
    expect(timelineLabel(windowAt(0, 'graded'), 0)).toBe('2:30 · graded')
    expect(timelineLabel(windowAt(0, 'graded', null, true), 0)).toBe('2:30 · graded')
  })
  it('labels skips, missed and not reached', () => {
    expect(timelineLabel(windowAt(0, 'skipped_unchanged'), 0)).toBe('2:30 skipped: no changes since your last judgement')
    expect(timelineLabel(windowAt(0, 'skipped_blank'), 0)).toBe('2:30 skipped: nothing drawn yet')
    expect(timelineLabel(windowAt(0, 'missed'), 0)).toBe('2:30 missed: tab was closed')
    expect(timelineLabel(windowAt(0, 'not_reached'), 0)).toBe('2:30 not reached: the attempt ended')
  })
  it('labels a pending judgement with a countdown or grading', () => {
    const pending = windowAt(0, 'pending')
    expect(timelineLabel(pending, pending.dueAt - 42_000)).toBe('2:30 in 0:42')
    expect(timelineLabel(pending, pending.dueAt)).toBe('2:30 judging…')
  })
})

describe('finalVerdictLabel', () => {
  const startedAt = 1_000_000
  it('shows the final verdict once the attempt is over', () => {
    expect(finalVerdictLabel({ startedAt, finalUsed: false, ended: true, now: 1_100_000 })).toBe('5:00 · final verdict')
    expect(finalVerdictLabel({ startedAt, finalUsed: true, ended: false, now: 1_100_000 })).toBe('5:00 · final verdict')
  })
  it('counts down to the verdict, then shows it in flight', () => {
    expect(finalVerdictLabel({ startedAt, finalUsed: false, ended: false, now: startedAt + 60_000 })).toBe('5:00 in 4:00')
    expect(finalVerdictLabel({ startedAt: null, finalUsed: false, ended: false, now: startedAt })).toBe('5:00 final verdict')
    expect(finalVerdictLabel({ startedAt, finalUsed: false, ended: false, now: startedAt + 300_000 })).toBe('5:00 judging…')
  })
})
