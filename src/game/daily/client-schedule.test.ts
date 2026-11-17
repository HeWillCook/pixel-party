import { describe, expect, it } from 'vitest'
import type { DailyStateView, GradeView } from '../../server/daily-service'
import {
  dailyReducer,
  initialDailyClientState,
  nextAutoAt,
  shouldFinalGrade,
  type DailyClientState,
} from './client-schedule'

const baseState: DailyStateView = {
  day: '2026-11-17',
  status: 'playing',
  prompt: 'a lighthouse in a storm',
  startedAt: 1_000_000,
  endsAt: 1_600_000,
  autoUsed: 0,
  asksUsed: 0,
  finalUsed: false,
  best: 400,
}

const sampleGrade: GradeView = {
  guess: 'a lighthouse',
  reason: 'Clear tower and beam.',
  fit: 400,
  recognition: 320,
  speed: 80,
  total: 800,
  elapsedMs: 120_000,
}

describe('client-schedule', () => {
  it('computes nextAutoAt from startedAt, autoUsed, and lastGradeAt', () => {
    const s = 1_000_000
    expect(nextAutoAt(s, 0, null)).toBe(s + 120_000)
    expect(nextAutoAt(s, 1, s + 120_000)).toBe(s + 240_000)
    expect(nextAutoAt(s, 4, s + 480_000)).toBeNull()
    // Enforces minimum gap of 100_000ms after a recent grade
    expect(nextAutoAt(s, 1, s + 180_000)).toBe(s + 280_000)
  })

  it('computes shouldFinalGrade when attempt window is reached', () => {
    const s = 1_000_000
    expect(shouldFinalGrade(s + 599_999, s)).toBe(false)
    expect(shouldFinalGrade(s + 600_000, s)).toBe(true)
    expect(shouldFinalGrade(s + 650_000, s)).toBe(true)
  })

  it('updates latest and best = max on grade_ok', () => {
    const initial: DailyClientState = {
      ...initialDailyClientState('2026-11-17'),
      ...baseState,
      grading: true,
      lastError: 'Previous error',
    }
    const afterFirst = dailyReducer(initial, {
      type: 'grade_ok',
      grade: sampleGrade,
      state: { ...baseState, asksUsed: 1, best: 700 },
    })
    expect(afterFirst.latest).toEqual(sampleGrade)
    expect(afterFirst.best).toBe(800)
    expect(afterFirst.grading).toBe(false)
    expect(afterFirst.lastError).toBeNull()

    // A lower subsequent grade keeps best at the max
    const lowerGrade: GradeView = { ...sampleGrade, total: 550 }
    const afterSecond = dailyReducer(afterFirst, {
      type: 'grade_ok',
      grade: lowerGrade,
      state: { ...baseState, asksUsed: 2, best: 800 },
    })
    expect(afterSecond.latest).toEqual(lowerGrade)
    expect(afterSecond.best).toBe(800)
  })

  it('handles grade_rejected with judge_resting and silent rejections', () => {
    const initial: DailyClientState = {
      ...initialDailyClientState('2026-11-17'),
      ...baseState,
      best: 620,
      grading: true,
    }
    const resting = dailyReducer(initial, {
      type: 'grade_rejected',
      reason: 'judge_resting',
      state: { ...baseState, best: 620 },
    })
    expect(resting.lastError).toBe('Judge is resting, keep drawing')
    expect(resting.best).toBe(620)
    expect(resting.grading).toBe(false)

    // unchanged and too_soon are silent
    const unchanged = dailyReducer(resting, {
      type: 'grade_rejected',
      reason: 'unchanged',
    })
    expect(unchanged.lastError).toBeNull()
    expect(unchanged.best).toBe(620)

    const tooSoon = dailyReducer(resting, {
      type: 'grade_rejected',
      reason: 'too_soon',
    })
    expect(tooSoon.lastError).toBeNull()
    expect(tooSoon.best).toBe(620)
  })
})
