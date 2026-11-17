import { DAILY } from '../game/config'
import { cellsHash, isEnded } from '../game/daily/attempt'
import type { AttemptRow, GradeKind, GradeReject } from '../game/daily/attempt'
import { promptForDay } from '../game/daily/prompts'
import { gradeScore } from '../game/daily/scoring'
import { decodeCells, encodeCells } from '../game/grid'
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
export interface GradeView {
  guess: string
  reason: string
  fit: number
  recognition: number
  speed: number
  total: number
  elapsedMs: number
}
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
  if (await deps.store.get(userId, today)) return today
  const yesterday = utcDay(now - 86_400_000)
  return await deps.store.get(userId, yesterday) ? yesterday : today
}

function validCells(cells: string): boolean {
  try {
    return decodeCells(cells, 1024).every(color => color <= 15)
  } catch {
    return false
  }
}

async function upsert(deps: DailyDeps, collection: string, day: string, userId: string, data: Record<string, unknown>, onlyMissing = false): Promise<void> {
  const found = await deps.tools.query(collection, { where: { day, userId }, limit: 1 })
  if (!found.success) throw new Error(found.error)
  const record = found.data.records[0]
  if (record && onlyMissing) return
  const result = record
    ? await deps.tools.update(collection, record.recordId, data)
    : await deps.tools.create(collection, { ...data, day, userId })
  if (!result.success) throw new Error(result.error)
}

export async function dailyState(deps: DailyDeps, userId: string): Promise<DailyStateView> {
  const now = deps.now()
  const day = utcDay(now)
  return stateView(day, await deps.store.get(userId, day), now)
}

export async function startDaily(deps: DailyDeps, user: DailyUser): Promise<DailyStateView> {
  const now = deps.now()
  const day = utcDay(now)
  const { row } = await deps.store.start(user.userId, day, now)
  await upsert(deps, 'dailyScores', day, user.userId, {
    displayName: user.name, avatarUrl: user.image, score: row.bestScore,
    fit: 0, recognition: 0, speed: 0, bestElapsedMs: row.bestElapsedMs ?? 0,
    ended: Number(isEnded(row, now)), medal: 0,
  }, true)
  await upsert(deps, 'dailyDrawings', day, user.userId, {
    displayName: user.name, prompt: promptForDay(day).prompt,
    cells: row.lastCells ?? encodeCells(new Uint8Array(1024)), guess: '', reason: '',
    score: row.bestScore, visibility: 'private',
  }, true)
  return stateView(day, row, now)
}

async function judgeCall<Value>(deps: DailyDeps, call: () => Promise<Value | null>): Promise<Value | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!await deps.reserveBudget()) return null
    const value = await call()
    if (value !== null) return value
  }
  return null
}

export async function gradeDaily(deps: DailyDeps, user: DailyUser, kind: GradeKind, cells: string): Promise<
  { ok: true; grade: GradeView; state: DailyStateView }
  | { ok: false; reason: GradeReject | 'judge_resting' | 'bad_cells'; state: DailyStateView }
> {
  const now = deps.now()
  const day = await activeDay(deps, user.userId, now)
  const state = async () => stateView(day, await deps.store.get(user.userId, day), deps.now())
  if (!validCells(cells)) return { ok: false, reason: 'bad_cells', state: await state() }
  const hash = cellsHash(cells)
  const reservation = await deps.store.reserve(user.userId, day, kind, hash, now)
  if (!reservation.ok) return { ok: false, reason: reservation.reason, state: await state() }
  const reservedAt = reservation.row.inFlightSince!
  let grade: GradeView | null = null
  try {
    const png = await deps.render(cells)
    const blind = await judgeCall(deps, () => deps.judge.blind(png))
    if (blind) {
      const prompt = promptForDay(day)
      const scored = await judgeCall(deps, () => deps.judge.score(png, prompt.prompt, prompt.subject, blind.guess))
      if (scored) grade = {
        guess: blind.guess, reason: scored.reason,
        ...gradeScore({ ...scored, elapsedMs: reservation.elapsedMs }), elapsedMs: reservation.elapsedMs,
      }
    }
  } catch {
    grade = null
  }
  const completed = await deps.store.complete(user.userId, day, grade, hash, cells, deps.now(), reservedAt)
  if (!grade) return { ok: false, reason: 'judge_resting', state: stateView(day, completed.row, deps.now()) }
  if (completed.improved) {
    await upsert(deps, 'dailyScores', day, user.userId, {
      displayName: user.name, avatarUrl: user.image, score: grade.total,
      fit: grade.fit, recognition: grade.recognition, speed: grade.speed, bestElapsedMs: grade.elapsedMs,
    })
    await upsert(deps, 'dailyDrawings', day, user.userId, {
      displayName: user.name, prompt: promptForDay(day).prompt, cells,
      guess: grade.guess, reason: grade.reason, score: grade.total,
    })
  }
  return { ok: true, grade, state: stateView(day, completed.row, deps.now()) }
}

export async function endDaily(deps: DailyDeps, user: DailyUser, cells: string | null): Promise<DailyStateView> {
  const now = deps.now()
  const day = await activeDay(deps, user.userId, now)
  const row = await deps.store.end(user.userId, day, cells !== null && validCells(cells) ? cells : null, now)
  if (!row) return stateView(day, null, now)
  await upsert(deps, 'dailyScores', day, user.userId, { ended: 1 })
  if (row.lastGradeAt === null && row.lastCells !== null) {
    await upsert(deps, 'dailyDrawings', day, user.userId, { cells: row.lastCells })
  }
  return stateView(day, row, now)
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
