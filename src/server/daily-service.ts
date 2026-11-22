import { DAILY, MAX_COLOR } from '../game/config'
import { autoWindowAt, cellsHash, isBlankCells, isEnded } from '../game/daily/attempt'
import type { AttemptRow, AutoWindowStatus, GradeKind, GradeReject, GradeResult } from '../game/daily/attempt'
import { promptForDay } from '../game/daily/prompts'
import { NO_SPELLING_REASON } from '../game/daily/judge'
import { blankGradeParts, gradeScore } from '../game/daily/scoring'
import { decodeCells } from '../game/grid'
import type { DailyJudge } from './daily-judge'
import { resetAttemptRecords } from './daily-records'
import type { AttemptStore } from './daily-room'
import { utcDay } from './room-time'
import { roomRecords } from './rooms'
import type { ServerTools } from './server-tools'

export interface DailyUser { userId: string; name: string; image: string }
export interface DailyDeps {
  now(): number
  store: AttemptStore
  judge: DailyJudge
  tools: ServerTools
  reserveBudget(): Promise<boolean>
  render(cells: string): Promise<string>
}
export type GradeView = GradeResult
export interface AutoWindowView { index: number; dueAt: number; status: AutoWindowStatus; score: number | null; late: boolean }
export interface DailyStateView {
  day: string
  status: 'not_started' | 'playing' | 'ended'
  prompt?: string
  startedAt?: number
  endsAt?: number
  autoUsed: number
  finalUsed: boolean
  best: number
  windows: AutoWindowView[]
  nextAutoAt: number | null
  serverNow: number
  /** The most recent canvas (saved periodically while painting and at every judgement). */
  lastCells?: string
}

function stateView(day: string, row: AttemptRow | null, now: number): DailyStateView {
  if (!row) return { day, status: 'not_started', autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: now }
  const ended = isEnded(row, now)
  const windows = row.windows.map(window => ({ index: window.index, dueAt: autoWindowAt(row.startedAt, window.index), status: window.status, score: window.score, late: window.late }))
  return {
    day,
    status: ended ? 'ended' : 'playing',
    prompt: promptForDay(day).prompt,
    startedAt: row.startedAt,
    endsAt: row.startedAt + DAILY.attemptMs,
    autoUsed: row.autoUsed,
    finalUsed: row.finalUsed,
    best: row.bestScore,
    windows,
    nextAutoAt: ended ? null : windows.find(window => window.status === 'pending')?.dueAt ?? null,
    serverNow: now,
    ...(row.lastCells !== null ? { lastCells: row.lastCells } : {}),
  }
}

async function readState(deps: DailyDeps, userId: string, day: string): Promise<DailyStateView> {
  const now = deps.now()
  return stateView(day, await deps.store.get(userId, day, now), now)
}

async function activeDay(deps: DailyDeps, userId: string, now: number): Promise<string> {
  const today = utcDay(now)
  const yesterday = utcDay(now - 86_400_000)
  const previous = await deps.store.get(userId, yesterday)
  return previous && !isEnded(previous, now) ? yesterday : today
}

async function allowedDay(deps: DailyDeps, userId: string, day: string, now: number): Promise<boolean> {
  if (day === utcDay(now)) return true
  if (day !== utcDay(now - 86_400_000)) return false
  const row = await deps.store.get(userId, day)
  if (!row) return false
  // A just-ended attempt (its final verdict set endedAt) still accepts a closing end/canvas call
  // until its grace window runs out; after that the day is closed to further writes.
  return !isEnded(row, now) || now <= row.startedAt + DAILY.attemptMs + DAILY.graceMs
}

export class InvalidAttemptDay extends Error {}
export class AttemptEndTooEarly extends Error {}

function validCells(cells: string): boolean {
  try {
    return decodeCells(cells, 1024).every(color => color <= MAX_COLOR)
  } catch {
    return false
  }
}

export async function dailyState(deps: DailyDeps, userId: string): Promise<DailyStateView> {
  const now = deps.now()
  const day = await activeDay(deps, userId, now)
  const yesterday = utcDay(now - 86_400_000)
  if (day !== yesterday) await deps.store.publish(userId, yesterday, now)
  await deps.store.publish(userId, day, now)
  return readState(deps, userId, day)
}

export async function startDaily(deps: DailyDeps, user: DailyUser): Promise<DailyStateView> {
  const now = deps.now()
  const day = utcDay(now)
  await deps.store.start(user.userId, day, now, { name: user.name, image: user.image })
  await deps.store.publish(user.userId, day, now)
  return readState(deps, user.userId, day)
}

async function judgeCall<Value>(deps: DailyDeps, ownsReservation: () => Promise<boolean>, call: () => Promise<Value | null>): Promise<Value | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!await ownsReservation()) return null
    if (!await deps.reserveBudget()) return null
    if (!await ownsReservation()) return null
    const value = await call()
    if (value !== null) return value
  }
  return null
}

export async function gradeDaily(deps: DailyDeps, user: DailyUser, kind: GradeKind, cells: string, day = utcDay(deps.now()), window?: number): Promise<
  { ok: true; grade: GradeView; state: DailyStateView }
  | { ok?: never; reason?: never; skipped: 'skipped_blank' | 'skipped_unchanged'; window: number; state: DailyStateView }
  | { ok: false; reason: GradeReject | 'judge_resting' | 'bad_cells'; state: DailyStateView }
> {
  const now = deps.now()
  if (!await allowedDay(deps, user.userId, day, now)) return { ok: false, reason: 'invalid_day', state: await readState(deps, user.userId, day) }
  const state = () => readState(deps, user.userId, day)
  if (!validCells(cells)) return { ok: false, reason: 'bad_cells', state: await state() }
  const decoded = decodeCells(cells, 1024)
  const blank = isBlankCells(decoded)
  const hash = cellsHash(cells)

  // A blank canvas never reaches the AI. The halfway judgement skips it outright; a blank final
  // earns zero and still ends the attempt with a verdict.
  const reservation = await deps.store.reserve(user.userId, day, kind, hash, now, blank, window)
  if (!reservation.ok) return { ok: false, reason: reservation.reason, state: await state() }
  if (reservation.ok === 'skipped') return { skipped: reservation.status, window: reservation.window, state: await state() }

  const reservedAt = reservation.row.inFlightSince!
  const ownsReservation = async () => (await deps.store.get(user.userId, day))?.inFlightSince === reservedAt
  const elapsedMs = reservation.elapsedMs
  const reserved = await deps.store.get(user.userId, day)
  let grade: GradeView | null = null
  try {
    if (blank) {
      grade = { guess: '', reason: 'Nothing is drawn yet — paint something first.', ...blankGradeParts(), elapsedMs }
    } else if (kind === 'final' && reserved?.lastGradedHash === hash && reserved.lastGrade) {
      // The canvas has not changed since the halfway verdict: reuse it rather than pay for a
      // second look. The final still ends the attempt, with the latest canvas and a verdict.
      grade = { ...reserved.lastGrade.grade, elapsedMs }
    } else {
      const png = await deps.render(cells)
      const blind = await judgeCall(deps, ownsReservation, () => deps.judge.blind(png))
      if (blind) {
        const prompt = promptForDay(day)
        const scored = await judgeCall(deps, ownsReservation, () => deps.judge.score(png, prompt.prompt, prompt.subject, blind.guess, kind === 'final' ? 'final' : 'halfway'))
        if (scored) {
          // Spelling the answer is not drawing it: the blind guess was read off letters, so it can never
          // count as recognition (the score formula then caps the prompt part at 30).
          const verdict = blind.text ? { ...scored, recognition: 0, reason: NO_SPELLING_REASON } : scored
          grade = { guess: blind.guess, reason: verdict.reason, ...gradeScore(verdict), elapsedMs }
        }
      }
    }
  } catch {
    grade = null
  }
  if (!grade && kind === 'final') {
    // The last verdict must always land: reuse the most recent judgement, or an empty verdict.
    const fallback = reserved?.lastGrade?.grade ?? reserved?.bestGrade?.grade
    grade = fallback
      ? { ...fallback, elapsedMs }
      : { guess: '', reason: 'The canvas got the better of me, but the verdict stands.', ...blankGradeParts(), elapsedMs }
  }
  const completed = await deps.store.complete(user.userId, day, grade, hash, cells, deps.now(), reservedAt)
  if (!completed.applied) return { ok: false, reason: 'stale', state: await state() }
  await deps.store.publish(user.userId, day, deps.now())
  if (!grade) return { ok: false, reason: 'judge_resting', state: await state() }
  return { ok: true, grade, state: await state() }
}

/**
 * Haiku's silent peek: one playful, non-scoring line. Capped per attempt, budget-gated, and it
 * never touches the grade, the last graded hash, or the score.
 */
export async function peekDaily(deps: DailyDeps, user: DailyUser, cells: string, day = utcDay(deps.now())): Promise<
  { ok: true; line: string } | { ok: false; reason: 'invalid_day' | 'bad_cells' | 'not_started' | 'ended' | 'time_up' | 'no_peeks_left' | 'judge_resting' }
> {
  const now = deps.now()
  if (!await allowedDay(deps, user.userId, day, now)) return { ok: false, reason: 'invalid_day' }
  if (!validCells(cells)) return { ok: false, reason: 'bad_cells' }
  const reservation = await deps.store.reservePeek(user.userId, day, now)
  if (!reservation.ok) return { ok: false, reason: reservation.reason }
  // A look that never produces a line gives the peek back, so a budget outage doesn't eat them.
  const refund = async () => { try { await deps.store.refundPeek?.(user.userId, day) } catch { /* best effort */ } }
  try {
    if (!await deps.reserveBudget()) { await refund(); return { ok: false, reason: 'judge_resting' } }
    const png = await deps.render(cells)
    const peeked = await deps.judge.peek?.(png, promptForDay(day).prompt)
    if (peeked) return { ok: true, line: peeked.line }
    await refund()
    return { ok: false, reason: 'judge_resting' }
  } catch {
    await refund()
    return { ok: false, reason: 'judge_resting' }
  }
}

/** Saves the latest canvas while the attempt is running, so a tab closed at 4:00 still has its art. */
export async function saveDailyCanvas(deps: DailyDeps, user: DailyUser, cells: string, day = utcDay(deps.now())): Promise<
  { ok: true } | { ok: false; reason: 'invalid_day' | 'bad_cells' | 'not_started' | 'ended' | 'time_up' }
> {
  const now = deps.now()
  if (!await allowedDay(deps, user.userId, day, now)) return { ok: false, reason: 'invalid_day' }
  if (!validCells(cells)) return { ok: false, reason: 'bad_cells' }
  const saved = await deps.store.save(user.userId, day, cells, now)
  if (!saved.ok) return { ok: false, reason: saved.reason }
  // Publish too, so a player who closes the tab and never comes back still has their latest
  // canvas on the day's drawing (the client only saves when the canvas changed, at most every 10 s).
  await deps.store.publish(user.userId, day, now)
  return { ok: true }
}

export async function endDaily(deps: DailyDeps, user: DailyUser, cells: string | null, day = utcDay(deps.now())): Promise<DailyStateView> {
  const now = deps.now()
  if (!await allowedDay(deps, user.userId, day, now)) throw new InvalidAttemptDay('invalid_attempt_day')
  const current = await deps.store.get(user.userId, day)
  // The attempt is a full five minutes: an end before then (bar the clock-skew tolerance) is refused.
  if (current && current.endedAt === null && now - current.startedAt < DAILY.attemptMs - DAILY.endToleranceMs) throw new AttemptEndTooEarly('too_early')
  const row = await deps.store.end(user.userId, day, cells !== null && validCells(cells) ? cells : null, now)
  if (!row) return readState(deps, user.userId, day)
  await deps.store.publish(user.userId, day, now)
  return readState(deps, user.userId, day)
}

export async function todaysDrawings(deps: DailyDeps, userId: string): Promise<{ ok: true; drawings: unknown[] } | { ok: false }> {
  const now = deps.now()
  const day = utcDay(now)
  const row = await deps.store.get(userId, day)
  if (!row || !isEnded(row, now)) return { ok: false }
  const drawings = await roomRecords(deps.tools, 'dailyDrawings', { day })
  if (!drawings.success) throw new Error(drawings.error)
  return { ok: true, drawings: drawings.data }
}

// DEV ONLY (__DEBUG_TOOLS__)
export async function resetDaily(deps: DailyDeps, userId: string): Promise<DailyStateView> {
  const now = deps.now()
  const today = utcDay(now)
  const day = await activeDay(deps, userId, now)
  await deps.store.reset(userId, day)
  await resetAttemptRecords(deps.tools, userId, day)
  if (day !== today) {
    await deps.store.reset(userId, today)
    await resetAttemptRecords(deps.tools, userId, today)
  }
  return readState(deps, userId, today)
}
