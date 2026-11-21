import { describe, expect, it } from 'vitest'
import { cellsHash, completeGrade, endAttempt, isBlankCells, isEnded, normalizeRow, reserveGrade, reservePeek, saveLatestCells, settleMissedWindows, startAttempt } from './attempt'
import { DAILY } from '../config'
import type { AttemptRow, GradeKind, GradeResult } from './attempt'

const now = Date.UTC(2026, 10, 18, 12)
const initial = () => startAttempt(null, 'user', '2026-11-18', now).row
const grade = (total = 500, elapsedMs = 60_000): GradeResult => ({
  guess: 'cat', reason: 'test', match: 60, recognition: 80, quality: 50,
  matchPoints: 300, qualityBonus: 200, total, elapsedMs,
})
function reserve(row: AttemptRow, kind: GradeKind, hash: string, time: number, blank = false, window?: number): AttemptRow {
  const result = reserveGrade(row, kind, hash, time, blank, window)
  if (result.ok !== true) throw new Error(`not reserved: ${result.ok === 'skipped' ? result.status : result.reason}`)
  return result.row
}
function complete(row: AttemptRow, outcome: GradeResult | null, hash: string, cells: string, time: number, reservedAt: number): AttemptRow {
  return completeGrade(row, outcome, hash, cells, time, reservedAt).row
}

describe('daily attempt', () => {
  it('has exactly one halfway judgement, at 2:30', () => {
    expect(DAILY.autoWindowsMs).toEqual([150_000])
    expect(initial().windows).toHaveLength(1)
  })

  it('skips blank and unchanged canvases at the halfway mark', () => {
    expect(isBlankCells(new Uint8Array([0, 0]))).toBe(true)
    expect(isBlankCells(new Uint8Array([0, 1]))).toBe(false)
    expect(reserveGrade(initial(), 'auto', 'h1', now + 150_000, true)).toMatchObject({ ok: 'skipped', status: 'skipped_blank', window: 0, row: { inFlightSince: null } })
    expect(reserveGrade({ ...initial(), lastGradedHash: 'h1' }, 'auto', 'h1', now + 150_000, false)).toMatchObject({ ok: 'skipped', status: 'skipped_unchanged', window: 0 })
  })

  it('marks missed windows and rejects missed reservations', () => {
    expect(settleMissedWindows(initial(), now + 181_000).windows[0]).toMatchObject({ status: 'missed', resolvedAt: now + 181_000 })
    expect(reserveGrade(initial(), 'auto', 'h1', now + 181_000, false)).toEqual({ ok: false, reason: 'window_missed' })
  })

  it('uses reservation time for late grades and retains failures', () => {
    for (const [offset, late] of [[156_000, true], [151_000, false]] as const) {
      const result = reserveGrade(initial(), 'auto', 'h1', now + offset, false)
      if (result.ok !== true) throw new Error('auto not reserved')
      const failed = complete(result.row, null, 'h1', 'cells', now + 185_000, now + offset)
      expect(failed.autoUsed).toBe(0)
      expect(failed.windows[0].status).toBe('pending')
      expect(complete(result.row, grade(500, offset), 'h1', 'cells', now + 185_000, now + offset).windows[0]).toMatchObject({ status: 'graded', score: 500, late })
    }
  })

  it('marks the window not reached when the attempt ends before it', () => {
    const ended = endAttempt(initial(), null, now + 90_000)
    const settled = settleMissedWindows(ended, now + 300_000)
    expect(settled.windows[0].status).toBe('not_reached')
  })

  it('expires a crashed lease before settling an overdue window', () => {
    const active = reserve(initial(), 'auto', 'h1', now + 150_000)
    const settled = settleMissedWindows(active, now + 150_000 + DAILY.inFlightStaleMs)
    expect(settled).toMatchObject({ inFlightSince: null, inFlightWindow: null })
    expect(settled.windows[0].status).toBe('missed')
  })

  it('rejects a delayed auto for an earlier window', () => {
    expect(reserveGrade(initial(), 'auto', 'old', now + 150_000, false, 1)).toEqual({ ok: false, reason: 'stale' })
  })

  it('does not reserve a second halfway judgement', () => {
    const row = initial()
    expect(reserveGrade({ ...row, autoUsed: 1 }, 'auto', 'edited', now + 150_000, false)).toEqual({ ok: false, reason: 'no_auto_left' })
    expect(reserveGrade({ ...row, windows: row.windows.map(window => ({ ...window, status: 'graded' })) }, 'auto', 'edited', now + 150_000, false)).toEqual({ ok: false, reason: 'no_auto_left' })
  })

  it('starts once and rejects missing attempts', () => {
    const first = startAttempt(null, 'user', '2026-11-18', now)
    expect(first.created).toBe(true)
    expect(first.row).toMatchObject({ autoUsed: 0, finalUsed: false, bestScore: 0, peeksUsed: 0 })
    expect(startAttempt(first.row, 'user', '2026-11-18', now + 1)).toEqual({ row: first.row, created: false })
    expect(reserveGrade(null, 'auto', 'h', now)).toEqual({ ok: false, reason: 'not_started' })
  })

  it('serializes reservations and frees the slot when the lease is abandoned', () => {
    const row = reserve(initial(), 'auto', 'h', now + 150_000)
    expect(row.inFlightSince).toBe(now + 150_000)
    const busy = reserve(initial(), 'auto', 'h', now + 150_000)
    expect(reserveGrade(busy, 'auto', 'h', now + 151_000)).toEqual({ ok: false, reason: 'busy' })
    const settled = settleMissedWindows(busy, now + 151_000 + DAILY.inFlightStaleMs)
    expect(settled).toMatchObject({ inFlightSince: null, inFlightKind: null, inFlightWindow: null })
    expect(settled.windows[0].status).toBe('missed')
  })

  it('keeps the judge lease for its full 90 seconds', () => {
    const row = reserve(initial(), 'auto', 'h', now + 150_000)
    expect(DAILY.inFlightStaleMs).toBe(90_000)
    for (const elapsed of [80_000, 89_999]) {
      expect(reserveGrade(row, 'auto', 'next', now + 150_000 + elapsed)).toEqual({ ok: false, reason: 'busy' })
    }
    // The lease is released at 90 s, but the one halfway window has been missed by then.
    expect(reserveGrade(row, 'auto', 'next', now + 150_000 + 90_000)).toEqual({ ok: false, reason: 'window_missed' })
  })

  it('enforces halfway timing', () => {
    expect(reserveGrade(initial(), 'auto', 'h', now + 30_000)).toEqual({ ok: false, reason: 'too_soon' })
    const row = reserve(initial(), 'auto', 'h', now + 150_000)
    const graded = complete(row, grade(), 'h', 'cells', now + 150_000, now + 150_000)
    expect(settleMissedWindows(graded, now + 200_000).windows[0].status).toBe('graded')
    expect(reserveGrade(graded, 'auto', 'other', now + 200_000)).toEqual({ ok: false, reason: 'no_auto_left' })
  })

  it('refuses the final before the full five minutes (bar the tolerance)', () => {
    expect(reserveGrade(initial(), 'final', 'h', now + 297_000)).toEqual({ ok: false, reason: 'too_early' })
    expect(reserveGrade(initial(), 'final', 'h', now + 298_000).ok).toBe(true)
    expect(reserveGrade(initial(), 'final', 'h', now + 300_000).ok).toBe(true)
  })

  it('accepts an unchanged final: the reused verdict still ends the attempt', () => {
    const graded = complete(reserve(initial(), 'auto', 'h', now + 150_000), grade(600), 'h', 'cells', now + 150_001, now + 150_000)
    expect(graded.lastGradedHash).toBe('h')
    const final = reserveGrade(graded, 'final', 'h', now + 300_000)
    expect(final.ok).toBe(true)
    if (final.ok !== true) throw new Error('final not reserved')
    const ended = complete(final.row, grade(600, 300_000), 'h', 'cells', now + 300_001, now + 300_000)
    expect(ended).toMatchObject({ endedAt: now + 300_001, finalUsed: true, bestScore: 600, lastCells: 'cells' })
    expect(ended.lastGrade?.grade.total).toBe(600)
  })

  it('the final ends the attempt and its score is the higher judgement', () => {
    let row = complete(reserve(initial(), 'auto', 'h1', now + 150_000), grade(800, 150_000), 'h1', 'halfway art', now + 150_001, now + 150_000)
    const final = reserveGrade(row, 'final', 'h2', now + 300_000)
    if (final.ok !== true) throw new Error('final not reserved')
    row = complete(final.row, grade(300, 300_000), 'h2', 'final art', now + 300_001, now + 300_000)
    expect(row).toMatchObject({
      endedAt: now + 300_001,
      bestScore: 800,
      bestGrade: { cells: 'halfway art' },
      lastGrade: { cells: 'final art' },
      lastCells: 'final art',
    })
  })

  it('allows the final through the grace window and closes ended attempts', () => {
    expect(reserveGrade(initial(), 'final', 'h', now + 315_000).ok).toBe(true)
    expect(reserveGrade(initial(), 'final', 'h', now + 316_000)).toEqual({ ok: false, reason: 'time_up' })
    expect(reserveGrade({ ...initial(), finalUsed: true }, 'final', 'h', now + 300_000)).toEqual({ ok: false, reason: 'final_used' })
    const ended = endAttempt({ ...initial(), lastCells: 'old' }, null, now + 300_000)
    expect(ended).toMatchObject({ endedAt: now + 300_000, lastCells: 'old' })
    expect(endAttempt(ended, 'new', now + 300_001).lastCells).toBe('old')
    expect(reserveGrade(ended, 'final', 'h', now + 300_002)).toEqual({ ok: false, reason: 'ended' })
    expect(isEnded(initial(), now + 315_001)).toBe(true)
  })

  it('refunds failures and keeps the best successful result', () => {
    for (const [kind, offset] of [['auto', 150_000], ['final', 300_000]] as const) {
      const pending = reserve(initial(), kind, 'h', now + offset)
      const failed = complete(pending, null, 'h', 'cells', now + offset + 1, now + offset)
      expect(failed).toMatchObject({ autoUsed: 0, finalUsed: false, inFlightSince: null, inFlightKind: null, bestScore: 0 })
    }
    let row = completeGrade(reserve(initial(), 'auto', 'h', now + 150_000), grade(700), 'h', 'cells', now + 150_001, now + 150_000)
    expect(row.improved).toBe(true)
    expect(row.row).toMatchObject({ lastGradeAt: now + 150_001, lastGradedHash: 'h', lastCells: 'cells', bestScore: 700 })
    row = completeGrade(reserve(row.row, 'final', 'h2', now + 300_000), grade(600), 'h2', 'next', now + 300_001, now + 300_000)
    expect(row.improved).toBe(false)
    expect(row.row).toMatchObject({ bestScore: 700, lastCells: 'next', lastGrade: { cells: 'next' }, bestGrade: { cells: 'cells' } })
    expect(cellsHash('abc')).toBe(cellsHash('abc'))
    expect(cellsHash('abc')).not.toBe(cellsHash('abd'))
  })

  it('ignores stale completions and accepts the current reservation', () => {
    const firstTime = now + 150_000
    const secondTime = now + 300_000
    const first = reserve(initial(), 'auto', 'first', firstTime)
    const second = reserve(first, 'final', 'second', secondTime)
    const stale = completeGrade(second, grade(900), 'first', 'old', secondTime + 1, firstTime)
    expect(stale).toEqual({ row: second, improved: false, applied: false })
    expect(stale.row).toBe(second)
    expect(stale.row).toMatchObject({ inFlightSince: secondTime, bestScore: 0 })
    const current = completeGrade(stale.row, grade(700, secondTime - now), 'second', 'new', secondTime + 2, secondTime)
    expect(current).toMatchObject({ improved: true, row: { inFlightSince: null, bestScore: 700, lastCells: 'new', endedAt: secondTime + 2 } })
  })

  it('ignores completions when nothing is in flight', () => {
    const row = initial()
    expect(completeGrade(row, grade(900), 'h', 'cells', now + 1, now)).toEqual({ row, improved: false, applied: false })
    expect(completeGrade(row, null, 'h', 'cells', now + 1, now).row).toBe(row)
  })

  it('caps silent peeks at two per attempt without touching grades', () => {
    const first = reservePeek(initial(), now + 75_000)
    expect(first.ok).toBe(true)
    if (first.ok !== true) throw new Error('peek refused')
    expect(first.row).toMatchObject({ peeksUsed: 1, inFlightSince: null, lastGradedHash: null, bestScore: 0 })
    const second = reservePeek(first.row, now + 225_000)
    if (second.ok !== true) throw new Error('second peek refused')
    expect(reservePeek(second.row, now + 226_000)).toEqual({ ok: false, reason: 'no_peeks_left' })
    expect(reservePeek(null, now)).toEqual({ ok: false, reason: 'not_started' })
    expect(reservePeek(endAttempt(initial(), null, now + 300_000), now + 300_000)).toEqual({ ok: false, reason: 'ended' })
    expect(reservePeek(initial(), now + 316_000)).toEqual({ ok: false, reason: 'time_up' })
  })

  it('saves the latest canvas only while the attempt is active', () => {
    expect(saveLatestCells(initial(), 'art', now + 10_000)).toMatchObject({ ok: true, row: { lastCells: 'art' } })
    expect(saveLatestCells(null, 'art', now)).toEqual({ ok: false, reason: 'not_started' })
    expect(saveLatestCells(endAttempt(initial(), null, now + 300_000), 'art', now + 300_000)).toEqual({ ok: false, reason: 'ended' })
    expect(saveLatestCells(initial(), 'art', now + 316_000)).toEqual({ ok: false, reason: 'time_up' })
  })

  it('normalizes a row without windows or peek counts', () => {
    const { windows, peeksUsed, inFlightWindow, ...row } = initial()
    void windows; void peeksUsed; void inFlightWindow
    expect(normalizeRow(row as AttemptRow)).toMatchObject({ windows: [{ index: 0, status: 'pending', resolvedAt: null, score: null, late: false }], peeksUsed: 0, inFlightWindow: null })
  })
})
