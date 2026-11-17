import { DAILY } from '../config'

export type GradeKind = 'auto' | 'ask' | 'final'
export type GradeReject = 'not_started' | 'ended' | 'time_up' | 'too_soon' | 'window_missed' | 'no_auto_left' | 'no_asks_left' | 'final_used' | 'unchanged' | 'busy' | 'stale' | 'invalid_day'
export type AutoWindowStatus = 'pending' | 'graded' | 'skipped_unchanged' | 'skipped_blank' | 'missed' | 'not_reached'
export interface AutoWindowRecord { index: number; status: AutoWindowStatus; resolvedAt: number | null; score: number | null; late: boolean }
export interface GradeResult {
  guess: string; reason: string; fit: number; recognition: number; speed: number; total: number; elapsedMs: number
}
export interface AttemptProfile { name: string; image: string }
export interface AttemptRow {
  userId: string; day: string; startedAt: number; endedAt: number | null
  autoUsed: number; asksUsed: number; finalUsed: boolean; inFlightSince: number | null; inFlightKind: GradeKind | null
  lastGradedHash: string | null; lastGradeAt: number | null; bestScore: number; bestElapsedMs: number | null
  lastCells: string | null
  windows: AutoWindowRecord[]; lastAskAt: number | null; inFlightWindow: number | null
  bestGrade?: { cells: string; grade: GradeResult }
  profile?: AttemptProfile
}

export function normalizeRow(row: AttemptRow): AttemptRow {
  return { ...row, windows: row.windows ?? DAILY.autoWindowsMs.map((_, index) => ({ index, status: 'pending', resolvedAt: null, score: null, late: false })), lastAskAt: row.lastAskAt ?? null, inFlightWindow: row.inFlightWindow ?? null }
}
export function autoWindowAt(startedAt: number, index: number): number {
  return startedAt + DAILY.autoWindowsMs[index]
}
export function settleMissedWindows(row: AttemptRow, now: number): AttemptRow {
  let current = normalizeRow(row)
  if (current.inFlightSince !== null && now - current.inFlightSince >= DAILY.inFlightStaleMs) {
    current = completeGrade(current, null, '', '', now, current.inFlightSince).row
  }
  const windows = current.windows.map(window => {
    if (window.status !== 'pending') return window
    const due = autoWindowAt(current.startedAt, window.index)
    if (current.endedAt !== null) return { ...window, status: due > current.endedAt ? 'not_reached' as const : 'missed' as const, resolvedAt: current.endedAt }
    if (window.index !== current.inFlightWindow && now - due > DAILY.autoMissAfterMs) return { ...window, status: 'missed' as const, resolvedAt: now }
    return window
  })
  return { ...current, windows }
}
export function dueAutoWindow(row: AttemptRow, now: number): number | null {
  const current = settleMissedWindows(row, now)
  return current.windows.find(window => window.status === 'pending' && autoWindowAt(current.startedAt, window.index) <= now)?.index ?? null
}
export function isBlankCells(cells: Uint8Array): boolean { return cells.every(cell => cell === 0) }

export function startAttempt(existing: AttemptRow | null, userId: string, day: string, now: number, profile?: AttemptProfile): { row: AttemptRow; created: boolean } {
  if (existing) return { row: existing, created: false }
  return { created: true, row: normalizeRow({ userId, day, startedAt: now, endedAt: null, autoUsed: 0, asksUsed: 0, finalUsed: false, inFlightSince: null, inFlightKind: null, lastGradedHash: null, lastGradeAt: null, bestScore: 0, bestElapsedMs: null, lastCells: null, profile } as AttemptRow) }
}

export function reserveGrade(row: AttemptRow | null, kind: GradeKind, cellsHash: string, now: number, blank = false, requestedWindow?: number):
  { ok: true; row: AttemptRow; elapsedMs: number } | { ok: false; reason: GradeReject } | { ok: 'skipped'; row: AttemptRow; window: number; status: 'skipped_blank' | 'skipped_unchanged' } {
  if (!row) return { ok: false, reason: 'not_started' }
  if (row.endedAt !== null) return { ok: false, reason: 'ended' }
  const elapsedMs = Math.max(0, now - row.startedAt)
  if (elapsedMs > DAILY.attemptMs + DAILY.graceMs || (kind !== 'final' && elapsedMs > DAILY.attemptMs)) return { ok: false, reason: 'time_up' }
  if (row.inFlightSince !== null && now - row.inFlightSince < DAILY.inFlightStaleMs) return { ok: false, reason: 'busy' }
  let current = normalizeRow(row)
  if (row.inFlightSince !== null) current = completeGrade(row, null, '', '', now, row.inFlightSince).row
  if (kind === 'ask' && current.asksUsed >= DAILY.maxAsks) return { ok: false, reason: 'no_asks_left' }
  if (kind === 'final' && current.finalUsed) return { ok: false, reason: 'final_used' }
  if (kind === 'final' && current.lastGradedHash === cellsHash) return { ok: false, reason: 'unchanged' }
  if (kind === 'ask' && current.lastAskAt !== null && now - current.lastAskAt < DAILY.askMinGapMs) return { ok: false, reason: 'too_soon' }
  let window: number | null = null
  if (kind === 'auto') {
    if (current.autoUsed >= DAILY.autoWindowsMs.length || current.windows.every(item => item.status !== 'pending')) return { ok: false, reason: 'no_auto_left' }
    const before = current
    current = settleMissedWindows(current, now)
    window = dueAutoWindow(current, now)
    if (window === null) {
      const latest = current.windows.filter(item => autoWindowAt(current.startedAt, item.index) <= now).at(-1)
      const justMissed = latest && latest.status === 'missed' && before.windows[latest.index]?.status === 'pending'
      return { ok: false, reason: justMissed ? 'window_missed' : 'too_soon' }
    }
    if (requestedWindow !== undefined && requestedWindow !== window) return { ok: false, reason: 'stale' }
    const status = blank ? 'skipped_blank' : current.lastGradedHash === cellsHash ? 'skipped_unchanged' : null
    if (status) return { ok: 'skipped', window, status, row: { ...current, windows: current.windows.map(item => item.index === window ? { ...item, status, resolvedAt: now } : item) } }
  }
  return { ok: true, elapsedMs, row: { ...current, asksUsed: current.asksUsed + Number(kind === 'ask'), lastAskAt: kind === 'ask' ? now : current.lastAskAt, finalUsed: current.finalUsed || kind === 'final', inFlightSince: now, inFlightKind: kind, inFlightWindow: window } }
}

export function completeGrade(row: AttemptRow, outcome: GradeResult | null, cellsHash: string, cells: string, now: number, reservedAt: number): { row: AttemptRow; improved: boolean; applied: boolean } {
  if (row.inFlightSince !== reservedAt) return { row, improved: false, applied: false }
  const current = normalizeRow(row)
  const cleared = { ...current, inFlightSince: null, inFlightKind: null, inFlightWindow: null }
  if (!outcome) return { improved: false, applied: true, row: { ...cleared, asksUsed: Math.max(0, row.asksUsed - Number(row.inFlightKind === 'ask')), finalUsed: row.inFlightKind === 'final' ? false : row.finalUsed } }
  if (row.inFlightKind === 'auto' && current.inFlightWindow !== null) {
    const index = current.inFlightWindow
    cleared.windows = current.windows.map(window => window.index === index ? { ...window, status: 'graded', resolvedAt: now, score: outcome.total, late: reservedAt - autoWindowAt(row.startedAt, index) > DAILY.autoLateMs } : window)
    cleared.autoUsed++
  }
  if (row.endedAt !== null) return { improved: false, applied: true, row: cleared }
  const improved = row.bestElapsedMs === null || outcome.total > row.bestScore
  return { improved, applied: true, row: { ...cleared, lastGradeAt: now, lastGradedHash: cellsHash, lastCells: cells, bestScore: improved ? outcome.total : row.bestScore, bestElapsedMs: improved ? outcome.elapsedMs : row.bestElapsedMs, bestGrade: improved ? { cells, grade: outcome } : row.bestGrade } }
}

export function endAttempt(row: AttemptRow, cells: string | null, now: number): AttemptRow {
  if (row.endedAt !== null) return row
  return settleMissedWindows({ ...row, endedAt: now, lastCells: cells ?? row.lastCells }, now)
}
export function isEnded(row: AttemptRow, now: number): boolean {
  return row.endedAt !== null || now > row.startedAt + DAILY.attemptMs + DAILY.graceMs
}
export function cellsHash(cells: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < cells.length; index++) hash = Math.imul(hash ^ cells.charCodeAt(index), 0x01000193)
  return (hash >>> 0).toString(16).padStart(8, '0')
}
