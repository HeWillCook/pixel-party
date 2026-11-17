import { describe, expect, it } from 'vitest'
import { cellsHash, completeGrade, endAttempt, isEnded, reserveGrade, startAttempt, settleMissedWindows, normalizeRow, isBlankCells } from './attempt'
import { DAILY } from '../config'
import type { AttemptRow, GradeKind } from './attempt'

const now = Date.UTC(2026, 10, 18, 12)
const initial = () => startAttempt(null, 'user', '2026-11-18', now).row
const grade = { guess: 'cat', reason: 'test', fit: 0, recognition: 0, speed: 0 }
function reserve(row: AttemptRow, kind: GradeKind, hash: string, time: number): AttemptRow {
  const result = reserveGrade(row, kind, hash, time)
  if (result.ok !== true) throw new Error('not reserved')
  return result.row
}

describe('daily attempt', () => {
  it('fixed windows ignore manual grades', () => {
    const ask = reserve(initial(), 'ask', 'h1', now + 90_000)
    const done = completeGrade(ask, { ...grade, total: 100, elapsedMs: 90_000 }, 'h1', 'cells', now + 90_001, now + 90_000).row
    expect(reserveGrade(done, 'auto', 'h2', now + 120_000, false)).toMatchObject({ ok: true, row: { inFlightWindow: 0 } })
  })
  it('ask gap counts manual grades only', () => {
    const auto = reserveGrade(initial(), 'auto', 'h1', now + 240_000, false)
    if (auto.ok !== true) throw new Error('auto not reserved')
    const done = completeGrade(auto.row, { ...grade, total: 100, elapsedMs: 240_000 }, 'h1', 'cells', now + 240_001, now + 240_000).row
    const ask = reserveGrade(done, 'ask', 'h2', now + 245_000, false)
    if (ask.ok !== true) throw new Error('ask not reserved')
    const completed = completeGrade(ask.row, { ...grade, total: 100, elapsedMs: 245_000 }, 'h2', 'cells', now + 245_001, now + 245_000).row
    expect(reserveGrade(completed, 'ask', 'h2', now + 255_000, false)).toEqual({ ok: false, reason: 'too_soon' })
  })
  it('skips blank and unchanged canvases', () => {
    expect(isBlankCells(new Uint8Array([0, 0]))).toBe(true)
    expect(isBlankCells(new Uint8Array([0, 1]))).toBe(false)
    expect(reserveGrade(initial(), 'auto', 'h1', now + 120_000, true)).toMatchObject({ ok: 'skipped', status: 'skipped_blank', window: 0, row: { inFlightSince: null } })
    expect(reserveGrade({ ...initial(), lastGradedHash: 'h1' }, 'auto', 'h1', now + 240_000, false)).toMatchObject({ ok: 'skipped', status: 'skipped_unchanged', window: 1 })
  })
  it('marks missed windows and rejects missed reservations', () => {
    expect(settleMissedWindows(initial(), now + 181_000).windows[0]).toMatchObject({ status: 'missed', resolvedAt: now + 181_000 })
    expect(reserveGrade(initial(), 'auto', 'h1', now + 181_000, false)).toEqual({ ok: false, reason: 'window_missed' })
  })
  it('uses reservation time for late grades and retains failures', () => {
    for (const [offset, late] of [[150_000, true], [122_000, false]] as const) {
      const result = reserveGrade(initial(), 'auto', 'h1', now + offset, false)
      if (result.ok !== true) throw new Error('auto not reserved')
      const failed = completeGrade(result.row, null, 'h1', 'cells', now + 170_000, now + offset).row
      expect(failed.autoUsed).toBe(0)
      expect(failed.windows[0].status).toBe('pending')
      expect(completeGrade(result.row, { ...grade, total: 100, elapsedMs: offset }, 'h1', 'cells', now + 170_000, now + offset).row.windows[0]).toMatchObject({ status: 'graded', score: 100, late })
    }
  })
  it('marks future windows not reached after early submission', () => {
    const ended = endAttempt(initial(), null, now + 180_000)
    const settled = settleMissedWindows(ended, now + 600_000)
    expect(settled.windows.slice(1).map(window => window.status)).toEqual(['not_reached', 'not_reached', 'not_reached'])
    expect(settled.windows.some(window => window.status === 'missed')).toBe(false)
  })
  it('normalizes legacy rows', () => {
    const { windows, lastAskAt, inFlightWindow, ...legacy } = initial()
    void windows; void lastAskAt; void inFlightWindow
    expect(normalizeRow(legacy as AttemptRow)).toMatchObject({ windows: Array.from({ length: 4 }, (_, index) => ({ index, status: 'pending', resolvedAt: null, score: null, late: false })), lastAskAt: null, inFlightWindow: null })
  })
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
  it('keeps the 80-second judge budget leased and releases a crash at exactly 90 seconds', () => {
    const row = reserve(initial(), 'ask', 'first', now)
    expect(DAILY.inFlightStaleMs).toBe(90_000)
    for (const elapsed of [80_000, 89_999]) {
      expect(reserveGrade(row, 'ask', 'next', now + elapsed)).toEqual({ ok: false, reason: 'busy' })
    }
    const recovered = reserveGrade(row, 'ask', 'next', now + 90_000)
    expect(recovered).toMatchObject({ ok: true, row: { asksUsed: 1, inFlightSince: now + 90_000 } })
  })
  it('enforces auto timing and limits', () => {
    expect(reserveGrade(initial(), 'auto', 'h', now + 60_000)).toEqual({ ok: false, reason: 'too_soon' })
    const row = reserve(initial(), 'auto', 'h', now + 120_000)
    const graded = completeGrade(row, { ...grade, total: 100, elapsedMs: 120_000 }, 'h', 'cells', now + 120_000, now + 120_000).row
    expect(reserveGrade(graded, 'auto', 'other', now + 180_000)).toEqual({ ok: false, reason: 'too_soon' })
  })
  it('enforces ask limits and grade spacing while allowing unchanged asks', () => {
    const row = { ...initial(), lastAskAt: now + 10_000, lastGradedHash: 'h' }
    expect(reserveGrade(row, 'ask', 'h', now + 29_999)).toEqual({ ok: false, reason: 'too_soon' })
    expect(reserveGrade(row, 'ask', 'h', now + 30_000).ok).toBe(true)
    expect(reserveGrade({ ...row, asksUsed: 3 }, 'ask', 'h', now + 30_000)).toEqual({ ok: false, reason: 'no_asks_left' })
    expect(reserveGrade(row, 'auto', 'h', now + 120_000)).toMatchObject({ ok: 'skipped', status: 'skipped_unchanged' })
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
