import { DAILY } from '../config'

export type GradeKind = 'auto' | 'final'
export type GradeReject = 'not_started' | 'ended' | 'time_up' | 'too_soon' | 'too_early' | 'window_missed' | 'no_auto_left' | 'final_used' | 'busy' | 'stale' | 'invalid_day'
export type PeekReject = 'not_started' | 'ended' | 'time_up' | 'no_peeks_left'
export type AutoWindowStatus = 'pending' | 'graded' | 'skipped_unchanged' | 'skipped_blank' | 'missed' | 'not_reached'
export interface AutoWindowRecord { index: number; status: AutoWindowStatus; resolvedAt: number | null; score: number | null; late: boolean }
export interface GradeResult {
  guess: string; reason: string
  /** Raw judge percents (0-100). */
  match: number; recognition: number; quality: number
  /** Points: matchPoints 0-500, qualityBonus 0-500, total 0-1000. */
  matchPoints: number; qualityBonus: number; total: number
  elapsedMs: number
}
export interface AttemptProfile { name: string; image: string }
/** One judged snapshot: the canvas the judgement saw, and its grade. */
export interface GradeSnapshot { cells: string; grade: GradeResult }
export interface AttemptRow {
  userId: string; day: string; startedAt: number; endedAt: number | null
  autoUsed: number; finalUsed: boolean; inFlightSince: number | null; inFlightKind: GradeKind | null
  lastGradedHash: string | null; lastGradeAt: number | null; bestScore: number
  peeksUsed: number
  /** The most recent canvas the player had (saved periodically and at every judgement). */
  lastCells: string | null
  windows: AutoWindowRecord[]; inFlightWindow: number | null
  /** The higher-scoring judgement: the attempt's score and its score parts. */
  bestGrade?: GradeSnapshot
  /** The most recent judgement: the guess/reason caption that travels with the latest canvas. */
  lastGrade?: GradeSnapshot
  profile?: AttemptProfile
}

export function normalizeRow(row: AttemptRow): AttemptRow {
  return { ...row, windows: row.windows ?? DAILY.autoWindowsMs.map((_, index) => ({ index, status: 'pending', resolvedAt: null, score: null, late: false })), peeksUsed: row.peeksUsed ?? 0, inFlightWindow: row.inFlightWindow ?? null }
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
  return { created: true, row: normalizeRow({ userId, day, startedAt: now, endedAt: null, autoUsed: 0, finalUsed: false, inFlightSince: null, inFlightKind: null, lastGradedHash: null, lastGradeAt: null, bestScore: 0, peeksUsed: 0, lastCells: null, profile } as AttemptRow) }
}

function elapsedFor(row: AttemptRow, now: number): number {
  return Math.max(0, now - row.startedAt)
}

function timeReject(row: AttemptRow, kind: GradeKind, now: number): GradeReject | null {
  const elapsedMs = elapsedFor(row, now)
  if (elapsedMs > DAILY.attemptMs + DAILY.graceMs || (kind !== 'final' && elapsedMs > DAILY.attemptMs)) return 'time_up'
  // The attempt is a full five minutes: no early finish, with a small tolerance for clock skew.
  if (kind === 'final' && elapsedMs < DAILY.attemptMs - DAILY.endToleranceMs) return 'too_early'
  return null
}

export function reserveGrade(row: AttemptRow | null, kind: GradeKind, cellsHash: string, now: number, blank = false, requestedWindow?: number):
  { ok: true; row: AttemptRow; elapsedMs: number } | { ok: false; reason: GradeReject } | { ok: 'skipped'; row: AttemptRow; window: number; status: 'skipped_blank' | 'skipped_unchanged' } {
  if (!row) return { ok: false, reason: 'not_started' }
  if (row.endedAt !== null) return { ok: false, reason: 'ended' }
  const timing = timeReject(row, kind, now)
  if (timing) return { ok: false, reason: timing }
  if (row.inFlightSince !== null && now - row.inFlightSince < DAILY.inFlightStaleMs) return { ok: false, reason: 'busy' }
  let current = normalizeRow(row)
  if (row.inFlightSince !== null) current = completeGrade(row, null, '', '', now, row.inFlightSince).row
  if (kind === 'final' && current.finalUsed) return { ok: false, reason: 'final_used' }
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
  return { ok: true, elapsedMs: elapsedFor(row, now), row: { ...current, finalUsed: current.finalUsed || kind === 'final', inFlightSince: now, inFlightKind: kind, inFlightWindow: window } }
}

export function completeGrade(row: AttemptRow, outcome: GradeResult | null, cellsHash: string, cells: string, now: number, reservedAt: number): { row: AttemptRow; improved: boolean; applied: boolean } {
  if (row.inFlightSince !== reservedAt) return { row, improved: false, applied: false }
  const current = normalizeRow(row)
  const cleared = { ...current, inFlightSince: null, inFlightKind: null, inFlightWindow: null }
  if (!outcome) return { improved: false, applied: true, row: { ...cleared, finalUsed: row.inFlightKind === 'final' ? false : row.finalUsed } }
  if (row.inFlightKind === 'auto' && current.inFlightWindow !== null) {
    const index = current.inFlightWindow
    cleared.windows = current.windows.map(window => window.index === index ? { ...window, status: 'graded', resolvedAt: now, score: outcome.total, late: reservedAt - autoWindowAt(row.startedAt, index) > DAILY.autoLateMs } : window)
    cleared.autoUsed++
  }
  const improved = outcome.total > row.bestScore
  if (row.endedAt !== null) {
    // The attempt was ended (e.g. a concurrent /end) while this judgement was in flight. It was
    // reserved in time, so it still counts toward the best score and the latest caption; the ended
    // canvas and end time stay as they are.
    return { improved, applied: true, row: { ...cleared, lastGradeAt: now, lastGradedHash: cellsHash, bestScore: improved ? outcome.total : row.bestScore, bestGrade: improved ? { cells, grade: outcome } : row.bestGrade, lastGrade: { cells, grade: outcome } } }
  }
  const next: AttemptRow = {
    ...cleared,
    lastGradeAt: now,
    lastGradedHash: cellsHash,
    lastCells: cells,
    bestScore: improved ? outcome.total : row.bestScore,
    bestGrade: improved ? { cells, grade: outcome } : row.bestGrade,
    lastGrade: { cells, grade: outcome },
  }
  // The final judgement always ends the attempt: score = the better of the two, image = the latest canvas.
  return { improved, applied: true, row: row.inFlightKind === 'final' ? endAttempt(next, cells, now) : next }
}

/** A peek is a silent, non-scoring look: it never touches the grade, hash, or score. */
export function reservePeek(row: AttemptRow | null, now: number): { ok: true; row: AttemptRow } | { ok: false; reason: PeekReject } {
  if (!row) return { ok: false, reason: 'not_started' }
  if (row.endedAt !== null) return { ok: false, reason: 'ended' }
  if (elapsedFor(row, now) > DAILY.attemptMs + DAILY.graceMs) return { ok: false, reason: 'time_up' }
  const current = normalizeRow(row)
  if (current.peeksUsed >= DAILY.maxPeeks) return { ok: false, reason: 'no_peeks_left' }
  return { ok: true, row: { ...current, peeksUsed: current.peeksUsed + 1 } }
}

/** Gives back a peek whose look never produced a line (budget resting or the judge failed). */
export function refundPeek(row: AttemptRow | null): { row: AttemptRow | null } {
  if (!row) return { row }
  const current = normalizeRow(row)
  return { row: { ...current, peeksUsed: Math.max(0, current.peeksUsed - 1) } }
}

/** Periodic canvas save: only while the attempt is running, so a closed tab still stores its latest art. */
export function saveLatestCells(row: AttemptRow | null, cells: string, now: number): { ok: true; row: AttemptRow } | { ok: false; reason: 'not_started' | 'ended' | 'time_up' } {
  if (!row) return { ok: false, reason: 'not_started' }
  if (row.endedAt !== null) return { ok: false, reason: 'ended' }
  if (elapsedFor(row, now) > DAILY.attemptMs + DAILY.graceMs) return { ok: false, reason: 'time_up' }
  return { ok: true, row: { ...normalizeRow(row), lastCells: cells } }
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
