import { describe, expect, it } from 'vitest'
import { dailyReducer, initialDailyClientState, needsDailyDayRefresh } from './client-schedule'

const day = '2026-11-17'
const nextDay = '2026-11-18'
const midnight = Date.UTC(2026, 10, 18)
const grade = { guess: 'old', reason: 'old', fit: 500, recognition: 400, speed: 99, total: 999, elapsedMs: 5000 }

describe('final client regressions', () => {
  it('locks an invalid-day attempt without adopting the fabricated current-day state', () => {
    const old = { ...initialDailyClientState(day), status: 'playing' as const, startedAt: midnight - 60_000, grading: true, best: 999, latest: grade }
    const stale = dailyReducer(old, { type: 'grade_rejected', reason: 'invalid_day', state: initialDailyClientState(nextDay), kind: 'final' })
    expect(stale).toMatchObject({ day, status: 'playing', best: 999, latest: grade, stale: true, grading: false, finalizing: true, endFailed: false })
    expect(needsDailyDayRefresh(stale, midnight)).toBe(true)
    const refreshed = dailyReducer(stale, { type: 'state_loaded', state: initialDailyClientState(nextDay) })
    expect(refreshed).toMatchObject({ day: nextDay, stale: false, finalizing: false, latest: null })
  })

  it('I3 resets results and scheduling when switching to the next day', () => {
    const old = { ...initialDailyClientState(day), status: 'ended' as const, best: 999, latest: grade, lastGradeAt: midnight - 1, autoRetryAfter: midnight + 1000 }
    const next = dailyReducer(old, { type: 'state_loaded', state: initialDailyClientState(nextDay) })
    expect(next).toMatchObject({ day: nextDay, best: 0, latest: null, lastGradeAt: null, autoRetryAfter: null, grading: false, finalizing: false })
  })

  it('I3 refreshes an ended or unstarted old day, without switching a live attempt', () => {
    const old = initialDailyClientState(day)
    expect(needsDailyDayRefresh(old, midnight - 1)).toBe(false)
    expect(needsDailyDayRefresh(old, midnight)).toBe(true)
    expect(needsDailyDayRefresh({ ...old, status: 'playing' }, midnight)).toBe(false)
    expect(needsDailyDayRefresh({ ...old, status: 'ended' }, midnight)).toBe(true)
    expect(needsDailyDayRefresh(initialDailyClientState(nextDay), midnight)).toBe(false)
  })

  it('I5 uses the referee best rather than an unaccepted computed grade or previous client best', () => {
    const old = { ...initialDailyClientState(day), best: 999 }
    const state = { ...initialDailyClientState(day), best: 359 }
    expect(dailyReducer(old, { type: 'grade_ok', grade, state }).best).toBe(359)
    expect(dailyReducer(old, { type: 'grade_rejected', reason: 'stale', state })).toMatchObject({ best: 359, latest: null })
  })
})
