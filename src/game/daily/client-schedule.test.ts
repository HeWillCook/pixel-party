import { describe, expect, it, vi } from 'vitest'
import type { DailyStateView, GradeView } from '../../server/daily-service'
import {
  canAskDaily,
  canPaintDaily,
  dailyReducer,
  initialDailyClientState,
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
  windows: [],
  asksLeft: 3,
  nextAutoAt: null,
  serverNow: 1_000_000,
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
  it('initial state is not loaded', () => {
    expect(initialDailyClientState().loaded).toBe(false)
  })
  it('fires a due window after a long tick gap', () => {
    const due = 1_120_000
    const state = { ...initialDailyClientState(), ...baseState, nextAutoAt: due }
    expect(shouldFireAutoGrade(state, due + 55_000, true)).toBe(true)
    expect(shouldFireAutoGrade(state, due + 60_000, true)).toBe(true)
    expect(shouldFireAutoGrade(state, due + 61_000, true)).toBe(false)
  })
  it('does not fire while grading, before due, or without a local canvas', () => {
    const due = 1_120_000
    const state = { ...initialDailyClientState(), ...baseState, nextAutoAt: due }
    expect(shouldFireAutoGrade({ ...state, grading: true }, due, true)).toBe(false)
    expect(shouldFireAutoGrade(state, due - 1, true)).toBe(false)
    expect(shouldFireAutoGrade(state, due, false)).toBe(false)
    expect(shouldFireAutoGrade({ ...state, nextAutoAt: null }, due, true)).toBe(false)
  })
  it('uses server clock offset', () => {
    const clientNow = 1_030_000
    const due = 1_120_000
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(clientNow)
    try {
      const state = dailyReducer(initialDailyClientState(baseState.day), { type: 'state_loaded', state: { ...baseState, serverNow: due, nextAutoAt: due } })
      expect(state).toMatchObject({ loaded: true, clockOffsetMs: 90_000 })
      expect(shouldFireAutoGrade(state, clientNow, true)).toBe(true)
      expect(canPaintDaily({ ...state, endsAt: due }, clientNow)).toBe(false)
    } finally {
      dateNow.mockRestore()
    }
  })
  it.each([['skipped_blank', 'Auto-grade skipped: nothing drawn yet'], ['skipped_unchanged', 'Auto-grade skipped: no changes since your last grade']] as const)('grade_skipped sets notice and windows for %s', (status, notice) => {
    const windows = [{ index: 0, dueAt: 1_120_000, status, score: null, late: false }]
    const previous = { ...initialDailyClientState(baseState.day), ...baseState, grading: true }
    const skipped = dailyReducer(previous, { type: 'grade_skipped', status, window: 0, state: { ...baseState, windows, nextAutoAt: 1_240_000 } })
    expect(skipped).toMatchObject({ grading: false, notice, windows, nextAutoAt: 1_240_000 })
    expect(dailyReducer(skipped, { type: 'clear_notice' }).notice).toBeNull()
  })
  it('clears a previous notice on grade start and success', () => {
    const state = { ...initialDailyClientState(baseState.day), ...baseState, notice: 'old notice' }
    expect(dailyReducer(state, { type: 'grade_start', kind: 'ask' }).notice).toBeNull()
    expect(dailyReducer(state, { type: 'grade_ok', grade: sampleGrade, state: baseState }).notice).toBeNull()
  })
  it('computes shouldFinalGrade when attempt window is reached', () => {
    const s = 1_000_000
    expect(shouldFinalGrade(s + 599_999, s)).toBe(false)
    expect(shouldFinalGrade(s + 600_000, s)).toBe(true)
    expect(shouldFinalGrade(s + 650_000, s)).toBe(true)
    expect(shouldFinalGrade(s + 510_000, s, 90_000)).toBe(true)
  })

  it('updates latest while taking the accepted best from server state', () => {
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
    expect(afterFirst.best).toBe(700)
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
    expect(resting.lastError).toBe("Haiku's napping — keep drawing")
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

  it('backs off failed auto grades and stops retrying missed windows', () => {
    const s = 1_000_000
    const st: DailyClientState = {
      ...initialDailyClientState('2026-11-17'),
      ...baseState,
      startedAt: s,
      endsAt: s + 600_000,
      nextAutoAt: s + 120_000,
    }

    expect(shouldFireAutoGrade(st, s + 120_000, true)).toBe(true)
    const rejectedResting = dailyReducer(st, {
      type: 'grade_rejected',
      reason: 'judge_resting',
      kind: 'auto',
      now: s + 122_000,
      state: { ...baseState, startedAt: s, endsAt: s + 600_000, nextAutoAt: s + 120_000 },
    })
    expect(shouldFireAutoGrade(rejectedResting, s + 123_000, true)).toBe(false)
    expect(shouldFireAutoGrade(rejectedResting, s + 140_000, true)).toBe(true)
    expect(shouldFireAutoGrade(rejectedResting, s + 240_000, true)).toBe(false)
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
    expect(shouldFireAutoGrade(st, s + 120_000, true)).toBe(false)

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
