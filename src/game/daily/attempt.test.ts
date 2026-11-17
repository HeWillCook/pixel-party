import { describe, expect, it } from 'vitest'
import { cellsHash, completeGrade, endAttempt, isEnded, reserveGrade, startAttempt } from './attempt'
import { DAILY } from '../config'
import type { AttemptRow, GradeKind } from './attempt'

const now = Date.UTC(2026, 10, 18, 12)
const initial = () => startAttempt(null, 'user', '2026-11-18', now).row
const grade = { guess: 'cat', reason: 'test', fit: 0, recognition: 0, speed: 0 }
function reserve(row: AttemptRow, kind: GradeKind, hash: string, time: number): AttemptRow {
  const result = reserveGrade(row, kind, hash, time)
  if (!result.ok) throw new Error(result.reason)
  return result.row
}

describe('daily attempt', () => {
  it('starts once and rejects missing attempts', () => {
    const first = startAttempt(null, 'user', '2026-11-18', now)
    expect(first.created).toBe(true)
    expect(first.row).toMatchObject({ autoUsed: 0, asksUsed: 0, finalUsed: false, bestScore: 0 })
    expect(startAttempt(first.row, 'user', '2026-11-18', now + 1)).toEqual({ row: first.row, created: false })
    expect(reserveGrade(null, 'ask', 'h', now)).toEqual({ ok: false, reason: 'not_started' })
  })
  it('serializes and recovers stale reservations', () => {
    const row = reserve(initial(), 'ask', 'h', now + 5_000)
    expect(row.inFlightSince).toBe(now + 5_000)
    expect(reserveGrade(row, 'ask', 'h', now + 6_000)).toEqual({ ok: false, reason: 'busy' })
    expect(reserveGrade(row, 'ask', 'h', now + 5_000 + DAILY.inFlightStaleMs).ok).toBe(true)
  })
  it('enforces auto timing and limits', () => {
    expect(reserveGrade(initial(), 'auto', 'h', now + 60_000)).toEqual({ ok: false, reason: 'too_soon' })
    const row = reserve(initial(), 'auto', 'h', now + 120_000)
    const graded = completeGrade(row, { ...grade, total: 100, elapsedMs: 120_000 }, 'h', 'cells', now + 120_000, now + 120_000).row
    expect(reserveGrade(graded, 'auto', 'other', now + 180_000)).toEqual({ ok: false, reason: 'too_soon' })
    expect(reserveGrade({ ...graded, autoUsed: 4 }, 'auto', 'other', now + 300_000)).toEqual({ ok: false, reason: 'no_auto_left' })
  })
  it('enforces ask limits and grade spacing while allowing unchanged asks', () => {
    const row = { ...initial(), lastGradeAt: now + 10_000, lastGradedHash: 'h' }
    expect(reserveGrade(row, 'ask', 'h', now + 29_999)).toEqual({ ok: false, reason: 'too_soon' })
    expect(reserveGrade(row, 'ask', 'h', now + 30_000).ok).toBe(true)
    expect(reserveGrade({ ...row, asksUsed: 3 }, 'ask', 'h', now + 30_000)).toEqual({ ok: false, reason: 'no_asks_left' })
    expect(reserveGrade(row, 'auto', 'h', now + 120_000)).toEqual({ ok: false, reason: 'unchanged' })
    expect(reserveGrade(row, 'final', 'h', now + 120_000)).toEqual({ ok: false, reason: 'unchanged' })
  })
  it('allows final in grace once and closes expired or ended attempts', () => {
    expect(reserveGrade(initial(), 'final', 'h', now + 610_000).ok).toBe(true)
    expect(reserveGrade(initial(), 'final', 'h', now + 616_000)).toEqual({ ok: false, reason: 'time_up' })
    expect(reserveGrade({ ...initial(), finalUsed: true }, 'final', 'h', now + 1)).toEqual({ ok: false, reason: 'final_used' })
    const ended = endAttempt({ ...initial(), lastCells: 'old' }, null, now + 1)
    expect(ended).toMatchObject({ endedAt: now + 1, lastCells: 'old' })
    expect(endAttempt(ended, 'new', now + 2).lastCells).toBe('old')
    expect(reserveGrade(ended, 'ask', 'h', now + 2)).toEqual({ ok: false, reason: 'ended' })
    expect(isEnded(initial(), now + 615_001)).toBe(true)
  })
  it('refunds failures and keeps the best successful result', () => {
    for (const kind of ['ask', 'auto', 'final'] as const) {
      const pending = reserve(initial(), kind, 'h', now + 120_000)
      const failed = completeGrade(pending, null, 'h', 'cells', now + 120_001, now + 120_000).row
      expect(failed).toMatchObject({ asksUsed: 0, autoUsed: 0, finalUsed: false, inFlightSince: null, inFlightKind: null, bestScore: 0 })
    }
    let row = completeGrade(reserve(initial(), 'ask', 'h', now + 5_000), { ...grade, total: 700, elapsedMs: 5_000 }, 'h', 'cells', now + 5_001, now + 5_000)
    expect(row.improved).toBe(true)
    expect(row.row).toMatchObject({ lastGradeAt: now + 5_001, lastGradedHash: 'h', lastCells: 'cells' })
    row = completeGrade(reserve(row.row, 'ask', 'h', now + 30_000), { ...grade, total: 600, elapsedMs: 30_000 }, 'h', 'next', now + 30_001, now + 30_000)
    expect(row.improved).toBe(false)
    row = completeGrade(reserve(row.row, 'ask', 'h', now + 55_000), { ...grade, total: 700, elapsedMs: 55_000 }, 'h', 'last', now + 55_001, now + 55_000)
    expect(row.row).toMatchObject({ bestScore: 700, bestElapsedMs: 5_000 })
    expect(cellsHash('abc')).toBe(cellsHash('abc'))
    expect(cellsHash('abc')).not.toBe(cellsHash('abd'))
  })
  it('ignores stale completions and accepts the current reservation', () => {
    const firstTime = now + 5_000
    const secondTime = firstTime + DAILY.inFlightStaleMs + 1
    const first = reserve(initial(), 'ask', 'first', firstTime)
    const second = reserve(first, 'ask', 'second', secondTime)
    const stale = completeGrade(second, { ...grade, total: 900, elapsedMs: 5_000 }, 'first', 'old', secondTime + 1, firstTime)
    expect(stale).toEqual({ row: second, improved: false, applied: false })
    expect(stale.row).toBe(second)
    expect(stale.row).toMatchObject({ inFlightSince: secondTime, bestScore: 0 })
    const current = completeGrade(stale.row, { ...grade, total: 700, elapsedMs: secondTime - now }, 'second', 'new', secondTime + 2, secondTime)
    expect(current).toMatchObject({ improved: true, row: { inFlightSince: null, bestScore: 700, lastCells: 'new' } })
  })
  it('ignores completions when nothing is in flight', () => {
    const row = initial()
    expect(completeGrade(row, { ...grade, total: 900, elapsedMs: 1 }, 'h', 'cells', now + 1, now)).toEqual({ row, improved: false, applied: false })
    expect(completeGrade(row, null, 'h', 'cells', now + 1, now).row).toBe(row)
  })
})
