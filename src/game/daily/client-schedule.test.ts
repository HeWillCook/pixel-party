import { describe, expect, it, vi } from 'vitest'
import type { DailyStateView, GradeView } from '../../server/daily-service'
import {
  canPaintDaily,
  dailyReducer,
  duePeekIndex,
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
  endsAt: 1_300_000,
  autoUsed: 0,
  finalUsed: false,
  best: 400,
  windows: [],
  nextAutoAt: null,
  serverNow: 1_000_000,
}

const sampleGrade: GradeView = {
  guess: 'a lighthouse',
  reason: 'Clear tower and beam.',
  match: 80,
  recognition: 80,
  quality: 60,
  matchPoints: 340,
  qualityBonus: 204,
  total: 544,
  elapsedMs: 150_000,
}

describe('client-schedule', () => {
  it('initial state is not loaded', () => {
    expect(initialDailyClientState().loaded).toBe(false)
  })
  it('fires a due halfway judgement after a long tick gap', () => {
    const due = 1_150_000
    const state = { ...initialDailyClientState(), ...baseState, nextAutoAt: due }
    expect(shouldFireAutoGrade(state, due + 25_000, true)).toBe(true)
    expect(shouldFireAutoGrade(state, due + 30_000, true)).toBe(true)
    expect(shouldFireAutoGrade(state, due + 31_000, true)).toBe(false)
  })
  it('does not fire while grading, before due, or without a local canvas', () => {
    const due = 1_150_000
    const state = { ...initialDailyClientState(), ...baseState, nextAutoAt: due }
    expect(shouldFireAutoGrade({ ...state, grading: true }, due, true)).toBe(false)
    expect(shouldFireAutoGrade(state, due - 1, true)).toBe(false)
    expect(shouldFireAutoGrade(state, due, false)).toBe(false)
    expect(shouldFireAutoGrade({ ...state, nextAutoAt: null }, due, true)).toBe(false)
  })
  it('uses server clock offset', () => {
    const clientNow = 1_120_000
    const due = 1_150_000
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(clientNow)
    try {
      const state = dailyReducer(initialDailyClientState(baseState.day), { type: 'state_loaded', state: { ...baseState, serverNow: due, nextAutoAt: due } })
      expect(state).toMatchObject({ loaded: true, clockOffsetMs: 30_000 })
      expect(shouldFireAutoGrade(state, clientNow, true)).toBe(true)
      expect(canPaintDaily({ ...state, endsAt: due }, clientNow)).toBe(false)
    } finally {
      dateNow.mockRestore()
    }
  })
  it.each([['skipped_blank', 'Skipped: nothing drawn yet'], ['skipped_unchanged', 'Skipped: no changes since the last judgement']] as const)('grade_skipped sets notice and windows for %s', (status, notice) => {
    const windows = [{ index: 0, dueAt: 1_150_000, status, score: null, late: false }]
    const previous = { ...initialDailyClientState(baseState.day), ...baseState, grading: true }
    const skipped = dailyReducer(previous, { type: 'grade_skipped', status, window: 0, state: { ...baseState, windows, nextAutoAt: null } })
    expect(skipped).toMatchObject({ grading: false, notice, windows, nextAutoAt: null })
    expect(dailyReducer(skipped, { type: 'clear_notice' }).notice).toBeNull()
  })
  it('clears a previous notice on grade start and success', () => {
    const state = { ...initialDailyClientState(baseState.day), ...baseState, notice: 'old notice' }
    expect(dailyReducer(state, { type: 'grade_start', kind: 'auto' }).notice).toBeNull()
    expect(dailyReducer(state, { type: 'grade_ok', grade: sampleGrade, state: baseState }).notice).toBeNull()
  })
  it('computes shouldFinalGrade when attempt window is reached', () => {
    const s = 1_000_000
    expect(shouldFinalGrade(s + 299_999, s)).toBe(false)
    expect(shouldFinalGrade(s + 300_000, s)).toBe(true)
    expect(shouldFinalGrade(s + 350_000, s)).toBe(true)
    expect(shouldFinalGrade(s + 210_000, s, 90_000)).toBe(true)
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
      state: { ...baseState, best: 700 },
    })
    expect(afterFirst.latest).toEqual(sampleGrade)
    expect(afterFirst.best).toBe(700)
    expect(afterFirst.grading).toBe(false)
    expect(afterFirst.lastError).toBeNull()

    // A lower subsequent grade keeps the server's best
    const lowerGrade: GradeView = { ...sampleGrade, total: 550 }
    const afterSecond = dailyReducer(afterFirst, {
      type: 'grade_ok',
      grade: lowerGrade,
      state: { ...baseState, best: 800 },
    })
    expect(afterSecond.latest).toEqual(lowerGrade)
    expect(afterSecond.best).toBe(800)
  })

  it('handles grade_rejected with judge_resting, silent rejections, and the too-early final', () => {
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

    for (const reason of ['unchanged', 'too_soon', 'final_used']) {
      const silent = dailyReducer(resting, { type: 'grade_rejected', reason })
      expect(silent.lastError).toBeNull()
      expect(silent.best).toBe(620)
    }

    const tooEarly = dailyReducer(resting, { type: 'grade_rejected', reason: 'too_early' })
    expect(tooEarly.lastError).toBe('The full five minutes first — keep painting')
  })

  it('backs off failed auto grades and stops retrying missed windows', () => {
    const s = 1_000_000
    const st: DailyClientState = {
      ...initialDailyClientState('2026-11-17'),
      ...baseState,
      startedAt: s,
      endsAt: s + 300_000,
      nextAutoAt: s + 150_000,
    }

    expect(shouldFireAutoGrade(st, s + 150_000, true)).toBe(true)
    const rejectedResting = dailyReducer(st, {
      type: 'grade_rejected',
      reason: 'judge_resting',
      kind: 'auto',
      now: s + 152_000,
      state: { ...baseState, startedAt: s, endsAt: s + 300_000, nextAutoAt: s + 150_000 },
    })
    expect(shouldFireAutoGrade(rejectedResting, s + 153_000, true)).toBe(false)
    expect(shouldFireAutoGrade(rejectedResting, s + 170_000, true)).toBe(true)
    expect(shouldFireAutoGrade(rejectedResting, s + 200_000, true)).toBe(false)
  })

  it('locks painting and all further judgements once finalizing starts or the end is pending/failed', () => {
    const s = 1_000_000
    let st: DailyClientState = {
      ...initialDailyClientState('2026-11-17'),
      ...baseState,
      startedAt: s,
      endsAt: s + 300_000,
    }
    expect(canPaintDaily(st, s + 50_000)).toBe(true)

    // Finalizing starts (5:00 reached and the final is in flight)
    st = dailyReducer(st, { type: 'finalize_start' })
    expect(st.finalizing).toBe(true)
    expect(canPaintDaily(st, s + 50_000)).toBe(false)
    expect(shouldFireAutoGrade(st, s + 150_000, true)).toBe(false)

    // The final grade completes but the server has not confirmed the ended state
    st = dailyReducer(st, {
      type: 'grade_ok',
      grade: sampleGrade,
      state: { ...baseState, finalUsed: true, best: 800 },
    })
    expect(st.grading).toBe(false)
    expect(st.finalizing).toBe(true)
    expect(canPaintDaily(st, s + 55_000)).toBe(false)

    // A failed final keeps the attempt locked with an error until a retry succeeds
    st = dailyReducer(st, { type: 'end_failed', message: 'Could not finish attempt. Retrying…' })
    expect(st.finalizing).toBe(true)
    expect(st.endFailed).toBe(true)
    expect(st.lastError).toBe('Could not finish attempt. Retrying…')
    expect(canPaintDaily(st, s + 56_000)).toBe(false)

    // When the server confirms the end, state transitions to 'ended' and clears finalizing
    st = dailyReducer(st, {
      type: 'state_loaded',
      state: { ...baseState, status: 'ended', finalUsed: true, best: 800 },
    })
    expect(st.status).toBe('ended')
    expect(st.finalizing).toBe(false)
    expect(st.endFailed).toBe(false)
  })

  it('disables painting when now >= endsAt or while finalizing or ended', () => {
    const s = 1_000_000
    const playing: DailyClientState = {
      ...initialDailyClientState('2026-11-17'),
      ...baseState,
      startedAt: s,
      endsAt: s + 300_000,
    }
    expect(canPaintDaily(playing, s + 299_999)).toBe(true)
    // At or past endsAt (5:00), painting is disabled immediately
    expect(canPaintDaily(playing, s + 300_000)).toBe(false)
    expect(canPaintDaily(playing, s + 305_000)).toBe(false)
    expect(canPaintDaily(dailyReducer(playing, { type: 'finalize_start' }), s + 100_000)).toBe(false)
    expect(canPaintDaily({ ...playing, status: 'ended' }, s + 100_000)).toBe(false)
  })

  it('schedules the two silent peeks inside their windows only', () => {
    const s = 1_000_000
    const fired = [false, false]
    expect(duePeekIndex(s + 74_000, s, 0, fired)).toBeNull()
    expect(duePeekIndex(s + 75_000, s, 0, fired)).toBe(0)
    expect(duePeekIndex(s + 104_000, s, 0, fired)).toBe(0)
    expect(duePeekIndex(s + 106_000, s, 0, fired)).toBeNull()
    expect(duePeekIndex(s + 225_000, s, 0, fired)).toBe(1)
    expect(duePeekIndex(s + 250_000, s, 0, fired)).toBe(1)
    expect(duePeekIndex(s + 260_000, s, 0, fired)).toBeNull()
    expect(duePeekIndex(s + 225_000, s, 0, [true, false])).toBe(1)
    expect(duePeekIndex(s + 225_000, s, 0, [true, true])).toBeNull()
    // The server clock offset moves the window too.
    expect(duePeekIndex(s + 60_000, s, 15_000, fired)).toBe(0)
  })
})
