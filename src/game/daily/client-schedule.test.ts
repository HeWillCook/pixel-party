import { describe, expect, it } from 'vitest'
import type { DailyStateView, GradeView } from '../../server/daily-service'
import {
  canAskDaily,
  canPaintDaily,
  dailyReducer,
  initialDailyClientState,
  nextAutoAt,
  shouldFireAutoGrade,
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

  it('does not permanently suppress auto-grades after unchanged, too_soon, judge_resting, or error', () => {
    const s = 1_000_000
    let st: DailyClientState = {
      ...initialDailyClientState('2026-11-17'),
      ...baseState,
      startedAt: s,
      endsAt: s + 600_000,
      nextAutoAt: s + 120_000,
    }

    // At 2:00, auto-grade should fire
    expect(shouldFireAutoGrade(st, s + 120_000, 'hash-a')).toBe(true)

    // 1) Suppose auto-grade was rejected with 'unchanged' on 'hash-a'
    st = dailyReducer(st, {
      type: 'grade_rejected',
      reason: 'unchanged',
      kind: 'auto',
      cellsHash: 'hash-a',
      now: s + 120_000,
      state: { ...baseState, startedAt: s, endsAt: s + 600_000, nextAutoAt: s + 120_000 },
    })
    // While canvas is still 'hash-a', do not spam auto-grade on the next tick
    expect(shouldFireAutoGrade(st, s + 121_000, 'hash-a')).toBe(false)
    // As soon as the player paints a new pixel ('hash-b'), auto-grade fires!
    expect(shouldFireAutoGrade(st, s + 122_000, 'hash-b')).toBe(true)

    // 2) Suppose auto-grade was rejected with 'too_soon' or 'judge_resting' or network error
    const rejectedResting = dailyReducer(st, {
      type: 'grade_rejected',
      reason: 'judge_resting',
      kind: 'auto',
      cellsHash: 'hash-b',
      now: s + 122_000,
      state: { ...baseState, startedAt: s, endsAt: s + 600_000, nextAutoAt: s + 120_000 },
    })
    // Backoff prevents immediate 1s spam, but once backoff passes (or at minute 4), it fires again
    expect(shouldFireAutoGrade(rejectedResting, s + 123_000, 'hash-b')).toBe(false)
    expect(shouldFireAutoGrade(rejectedResting, s + 140_000, 'hash-b')).toBe(true)
    expect(shouldFireAutoGrade(rejectedResting, s + 240_000, 'hash-b')).toBe(true)
  })

  it('blocks Ask-now and all further grades once finalizing starts or end is pending/failed', () => {
    const s = 1_000_000
    let st: DailyClientState = {
      ...initialDailyClientState('2026-11-17'),
      ...baseState,
      startedAt: s,
      endsAt: s + 600_000,
    }
    expect(canAskDaily(st, s + 50_000)).toBe(true)

    // Finalizing starts (Done clicked or 10:00 reached)
    st = dailyReducer(st, { type: 'finalize_start' })
    expect(st.finalizing).toBe(true)
    expect(canAskDaily(st, s + 50_000)).toBe(false)
    expect(shouldFireAutoGrade(st, s + 120_000, 'hash-a')).toBe(false)

    // Final grade completes, but /api/daily/end is still in flight
    st = dailyReducer(st, {
      type: 'grade_ok',
      grade: sampleGrade,
      state: { ...baseState, finalUsed: true, best: 800 },
    })
    expect(st.grading).toBe(false)
    expect(st.finalizing).toBe(true)
    expect(canAskDaily(st, s + 55_000)).toBe(false)

    // If /api/daily/end fails, attempt stays locked in finalizing with an error until end succeeds
    st = dailyReducer(st, { type: 'end_failed', message: 'Could not finish attempt. Retrying…' })
    expect(st.finalizing).toBe(true)
    expect(st.endFailed).toBe(true)
    expect(st.lastError).toBe('Could not finish attempt. Retrying…')
    expect(canAskDaily(st, s + 56_000)).toBe(false)
    expect(canPaintDaily(st, s + 56_000)).toBe(false)

    // When /api/daily/end succeeds, state transitions to 'ended' and clears finalizing
    st = dailyReducer(st, {
      type: 'state_loaded',
      state: { ...baseState, status: 'ended', finalUsed: true, best: 800 },
    })
    expect(st.status).toBe('ended')
    expect(st.finalizing).toBe(false)
    expect(st.endFailed).toBe(false)
    expect(canAskDaily(st, s + 60_000)).toBe(false)
  })

  it('disables painting when now >= endsAt or while finalizing or ended', () => {
    const s = 1_000_000
    const playing: DailyClientState = {
      ...initialDailyClientState('2026-11-17'),
      ...baseState,
      startedAt: s,
      endsAt: s + 600_000,
    }
    expect(canPaintDaily(playing, s + 599_999)).toBe(true)
    // At or past endsAt (10:00), painting is disabled immediately
    expect(canPaintDaily(playing, s + 600_000)).toBe(false)
    expect(canPaintDaily(playing, s + 605_000)).toBe(false)

    // During finalization (even before 10:00 when Done is clicked early), painting is disabled
    const finalizing = dailyReducer(playing, { type: 'finalize_start' })
    expect(canPaintDaily(finalizing, s + 100_000)).toBe(false)

    // When ended, painting is disabled
    const ended: DailyClientState = { ...playing, status: 'ended' }
    expect(canPaintDaily(ended, s + 100_000)).toBe(false)
  })
})
