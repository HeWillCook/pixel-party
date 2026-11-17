import { DAILY } from '../game/config'
import { cellsHash, isEnded } from '../game/daily/attempt'
import type { AttemptRow, GradeKind, GradeReject, GradeResult } from '../game/daily/attempt'
import { promptForDay } from '../game/daily/prompts'
import { gradeScore } from '../game/daily/scoring'
import { decodeCells } from '../game/grid'
import type { DailyJudge } from './daily-judge'
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
export interface DailyStateView {
  day: string
  status: 'not_started' | 'playing' | 'ended'
  prompt?: string
  startedAt?: number
  endsAt?: number
  autoUsed: number
  asksUsed: number
  finalUsed: boolean
  best: number
  nextAutoAt?: number
  lastCells?: string
}

function stateView(day: string, row: AttemptRow | null, now: number): DailyStateView {
  if (!row) return { day, status: 'not_started', autoUsed: 0, asksUsed: 0, finalUsed: false, best: 0 }
  const ended = isEnded(row, now)
  return {
    day,
    status: ended ? 'ended' : 'playing',
    prompt: promptForDay(day).prompt,
    startedAt: row.startedAt,
    endsAt: row.startedAt + DAILY.attemptMs,
    autoUsed: row.autoUsed,
    asksUsed: row.asksUsed,
    finalUsed: row.finalUsed,
    best: row.bestScore,
    ...(!ended && row.autoUsed < DAILY.maxAuto ? {
      nextAutoAt: Math.max(row.startedAt + DAILY.firstAutoMs + row.autoUsed * DAILY.autoEveryMs, (row.lastGradeAt ?? row.startedAt) + DAILY.autoMinGapMs),
    } : {}),
    ...(row.lastCells !== null ? { lastCells: row.lastCells } : {}),
  }
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
  return row !== null && !isEnded(row, now)
}

export class InvalidAttemptDay extends Error {}

function validCells(cells: string): boolean {
  try {
    return decodeCells(cells, 1024).every(color => color <= 15)
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
  return stateView(day, await deps.store.get(userId, day), now)
}

export async function startDaily(deps: DailyDeps, user: DailyUser): Promise<DailyStateView> {
  const now = deps.now()
  const day = utcDay(now)
  await deps.store.start(user.userId, day, now, { name: user.name, image: user.image })
  await deps.store.publish(user.userId, day, now)
  return stateView(day, await deps.store.get(user.userId, day), deps.now())
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

export async function gradeDaily(deps: DailyDeps, user: DailyUser, kind: GradeKind, cells: string, day = utcDay(deps.now())): Promise<
  { ok: true; grade: GradeView; state: DailyStateView }
  | { ok: false; reason: GradeReject | 'judge_resting' | 'bad_cells'; state: DailyStateView }
> {
  const now = deps.now()
  if (!await allowedDay(deps, user.userId, day, now)) return { ok: false, reason: 'invalid_day', state: stateView(day, await deps.store.get(user.userId, day), now) }
  const state = async () => stateView(day, await deps.store.get(user.userId, day), deps.now())
  if (!validCells(cells)) return { ok: false, reason: 'bad_cells', state: await state() }
  const hash = cellsHash(cells)
  const reservation = await deps.store.reserve(user.userId, day, kind, hash, now)
  if (!reservation.ok) return { ok: false, reason: reservation.reason, state: await state() }
  const reservedAt = reservation.row.inFlightSince!
  const ownsReservation = async () => (await deps.store.get(user.userId, day))?.inFlightSince === reservedAt
  let grade: GradeView | null = null
  try {
    const png = await deps.render(cells)
    const blind = await judgeCall(deps, ownsReservation, () => deps.judge.blind(png))
    if (blind) {
      const prompt = promptForDay(day)
      const scored = await judgeCall(deps, ownsReservation, () => deps.judge.score(png, prompt.prompt, prompt.subject, blind.guess))
      if (scored) grade = {
        guess: blind.guess, reason: scored.reason,
        ...gradeScore({ ...scored, elapsedMs: reservation.elapsedMs }), elapsedMs: reservation.elapsedMs,
      }
    }
  } catch {
    grade = null
  }
  const completed = await deps.store.complete(user.userId, day, grade, hash, cells, deps.now(), reservedAt)
  if (!completed.applied) return { ok: false, reason: 'stale', state: stateView(day, completed.row, deps.now()) }
  await deps.store.publish(user.userId, day, deps.now())
  if (!grade) return { ok: false, reason: 'judge_resting', state: stateView(day, completed.row, deps.now()) }
  return { ok: true, grade, state: await state() }
}

export async function endDaily(deps: DailyDeps, user: DailyUser, cells: string | null, day = utcDay(deps.now())): Promise<DailyStateView> {
  const now = deps.now()
  if (!await allowedDay(deps, user.userId, day, now)) throw new InvalidAttemptDay('invalid_attempt_day')
  const row = await deps.store.end(user.userId, day, cells !== null && validCells(cells) ? cells : null, now)
  if (!row) return stateView(day, null, now)
  await deps.store.publish(user.userId, day, now)
  return stateView(day, await deps.store.get(user.userId, day), deps.now())
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
