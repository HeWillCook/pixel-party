import { DAILY } from '../config'

export type GradeKind = 'auto' | 'ask' | 'final'
export type GradeReject = 'not_started' | 'ended' | 'time_up' | 'too_soon' | 'no_auto_left' | 'no_asks_left' | 'final_used' | 'unchanged' | 'busy' | 'stale' | 'invalid_day'
export interface GradeResult {
  guess: string; reason: string; fit: number; recognition: number; speed: number; total: number; elapsedMs: number
}
export interface AttemptProfile { name: string; image: string }
export interface AttemptRow {
  userId: string; day: string; startedAt: number; endedAt: number | null
  autoUsed: number; asksUsed: number; finalUsed: boolean; inFlightSince: number | null; inFlightKind: GradeKind | null
  lastGradedHash: string | null; lastGradeAt: number | null; bestScore: number; bestElapsedMs: number | null
  lastCells: string | null
  bestGrade?: { cells: string; grade: GradeResult }
  profile?: AttemptProfile
}

export function startAttempt(existing: AttemptRow | null, userId: string, day: string, now: number, profile?: AttemptProfile): { row: AttemptRow; created: boolean } {
  if (existing) return { row: existing, created: false }
  return { created: true, row: { userId, day, startedAt: now, endedAt: null, autoUsed: 0, asksUsed: 0, finalUsed: false, inFlightSince: null, inFlightKind: null, lastGradedHash: null, lastGradeAt: null, bestScore: 0, bestElapsedMs: null, lastCells: null, profile } }
}

export function reserveGrade(row: AttemptRow | null, kind: GradeKind, cellsHash: string, now: number):
  { ok: true; row: AttemptRow; elapsedMs: number } | { ok: false; reason: GradeReject } {
  if (!row) return { ok: false, reason: 'not_started' }
  if (row.endedAt !== null) return { ok: false, reason: 'ended' }
  const elapsedMs = Math.max(0, now - row.startedAt)
  if (elapsedMs > DAILY.attemptMs + DAILY.graceMs || (kind !== 'final' && elapsedMs > DAILY.attemptMs)) return { ok: false, reason: 'time_up' }
  if (row.inFlightSince !== null && now - row.inFlightSince < DAILY.inFlightStaleMs) return { ok: false, reason: 'busy' }
  let current = row
  if (row.inFlightSince !== null) current = completeGrade(row, null, '', '', now, row.inFlightSince).row
  if (kind === 'auto' && current.autoUsed >= DAILY.maxAuto) return { ok: false, reason: 'no_auto_left' }
  if (kind === 'ask' && current.asksUsed >= DAILY.maxAsks) return { ok: false, reason: 'no_asks_left' }
  if (kind === 'final' && current.finalUsed) return { ok: false, reason: 'final_used' }
  if (kind !== 'ask' && current.lastGradedHash === cellsHash) return { ok: false, reason: 'unchanged' }
  if (kind === 'auto' && (elapsedMs < DAILY.firstAutoMs || (current.lastGradeAt !== null && now - current.lastGradeAt < DAILY.autoMinGapMs))) return { ok: false, reason: 'too_soon' }
  if (kind === 'ask' && current.lastGradeAt !== null && now - current.lastGradeAt < DAILY.askMinGapMs) return { ok: false, reason: 'too_soon' }
  return { ok: true, elapsedMs, row: { ...current, autoUsed: current.autoUsed + Number(kind === 'auto'), asksUsed: current.asksUsed + Number(kind === 'ask'), finalUsed: current.finalUsed || kind === 'final', inFlightSince: now, inFlightKind: kind } }
}

export function completeGrade(row: AttemptRow, outcome: GradeResult | null, cellsHash: string, cells: string, now: number, reservedAt: number): { row: AttemptRow; improved: boolean; applied: boolean } {
  if (row.inFlightSince !== reservedAt) return { row, improved: false, applied: false }
  const cleared = { ...row, inFlightSince: null, inFlightKind: null }
  if (!outcome) return { improved: false, applied: true, row: { ...cleared, autoUsed: Math.max(0, row.autoUsed - Number(row.inFlightKind === 'auto')), asksUsed: Math.max(0, row.asksUsed - Number(row.inFlightKind === 'ask')), finalUsed: row.inFlightKind === 'final' ? false : row.finalUsed } }
  const improved = row.bestElapsedMs === null || outcome.total > row.bestScore
  return { improved, applied: true, row: { ...cleared, lastGradeAt: now, lastGradedHash: cellsHash, lastCells: cells, bestScore: improved ? outcome.total : row.bestScore, bestElapsedMs: improved ? outcome.elapsedMs : row.bestElapsedMs, bestGrade: improved ? { cells, grade: outcome } : row.bestGrade } }
}

export function endAttempt(row: AttemptRow, cells: string | null, now: number): AttemptRow {
  if (row.endedAt !== null) return row
  return { ...row, endedAt: row.endedAt ?? now, lastCells: cells ?? row.lastCells }
}
export function isEnded(row: AttemptRow, now: number): boolean {
  return row.endedAt !== null || now > row.startedAt + DAILY.attemptMs + DAILY.graceMs
}
export function cellsHash(cells: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < cells.length; index++) hash = Math.imul(hash ^ cells.charCodeAt(index), 0x01000193)
  return (hash >>> 0).toString(16).padStart(8, '0')
}
