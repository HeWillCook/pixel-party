import { BaseRoom } from 'deepspace/worker'
import type { Env } from '../../worker.js'
import { completeGrade, endAttempt, normalizeRow, reserveGrade, settleMissedWindows, startAttempt } from '../game/daily/attempt'
import type { AttemptProfile, AttemptRow, GradeKind, GradeResult } from '../game/daily/attempt'
import { attemptPublisher } from './daily-records'
import { createServerTools, type ServerTools } from './server-tools'

type Outcome = GradeResult | null
type Operation =
  | { op: 'start'; userId: string; day: string; now: number; profile?: AttemptProfile }
  | { op: 'reserve'; userId: string; day: string; kind: GradeKind; hash: string; now: number; blank: boolean; window?: number }
  | { op: 'complete'; userId: string; day: string; outcome: Outcome; hash: string; cells: string; now: number; reservedAt: number }
  | { op: 'end'; userId: string; day: string; cells: string | null; now: number }
  | { op: 'get'; userId: string; day: string; now?: number }
  // DEV ONLY (__DEBUG_TOOLS__)
  | { op: 'reset'; userId: string; day: string }
type PublishOperation = { op: 'publish'; userId: string; day: string; now: number }

export interface AttemptStore {
  start(userId: string, day: string, now: number, profile?: AttemptProfile): Promise<{ row: AttemptRow; created: boolean }>
  reserve(userId: string, day: string, kind: GradeKind, hash: string, now: number, blank?: boolean, window?: number): Promise<ReturnType<typeof reserveGrade>>
  complete(userId: string, day: string, outcome: Outcome, hash: string, cells: string, now: number, reservedAt: number): Promise<ReturnType<typeof completeGrade>>
  end(userId: string, day: string, cells: string | null, now: number): Promise<AttemptRow | null>
  get(userId: string, day: string, now?: number): Promise<AttemptRow | null>
  publish(userId: string, day: string, now: number): Promise<void>
  // DEV ONLY (__DEBUG_TOOLS__)
  reset(userId: string, day: string): Promise<void>
}

function applyOperation(row: AttemptRow | null, body: Operation) {
  switch (body.op) {
    case 'start': return startAttempt(row, body.userId, body.day, body.now, body.profile)
    case 'reserve': return reserveGrade(row, body.kind, body.hash, body.now, body.blank, body.window)
    case 'complete':
      if (!row) throw new Error('Attempt not started')
      return completeGrade(row, body.outcome, body.hash, body.cells, body.now, body.reservedAt)
    case 'end': return { row: row ? endAttempt(row, body.cells, body.now) : null }
    case 'get': return { row: row ? body.now === undefined ? normalizeRow(row) : settleMissedWindows(row, body.now) : null }
    case 'reset': return { row: null }
  }
}

export class DailyRoom extends BaseRoom<Env> {
  private publishCurrent: ReturnType<typeof attemptPublisher>
  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    this.sql.exec('CREATE TABLE IF NOT EXISTS attempts (day TEXT, userId TEXT, row TEXT NOT NULL, PRIMARY KEY(day,userId))')
    this.publishCurrent = attemptPublisher(async (userId, day) => {
      const stored = this.sql.exec<{ row: string }>('SELECT row FROM attempts WHERE day = ? AND userId = ?', day, userId).toArray()[0]
      return stored ? normalizeRow(JSON.parse(stored.row) as AttemptRow) : null
    }, createServerTools(env))
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/op') return new Response('Not found', { status: 404 })
    const body = await request.json() as Operation | PublishOperation
    if (body.op === 'publish') {
      await this.publishCurrent(body.userId, body.day, body.now)
      return Response.json({})
    }
    const result = this.state.storage.transactionSync(() => {
      if (body.op === 'reset') {
        this.sql.exec('DELETE FROM attempts WHERE day = ? AND userId = ?', body.day, body.userId)
        return { row: null }
      }
      const stored = this.sql.exec<{ row: string }>('SELECT row FROM attempts WHERE day = ? AND userId = ?', body.day, body.userId).toArray()[0]
      const row = stored ? normalizeRow(JSON.parse(stored.row) as AttemptRow) : null
      const result = applyOperation(row, body)
      if ('row' in result && result.row && (body.op !== 'get' || JSON.stringify(result.row) !== stored?.row)) {
        this.sql.exec('INSERT INTO attempts (day, userId, row) VALUES (?, ?, ?) ON CONFLICT(day, userId) DO UPDATE SET row = excluded.row', body.day, body.userId, JSON.stringify(result.row))
      }
      return result
    })
    return Response.json(result)
  }

  protected onMessage(): void {}
}

function makeStore(invoke: (body: Operation | PublishOperation) => Promise<ReturnType<typeof applyOperation>>): AttemptStore {
  return {
    start: (userId, day, now, profile) => invoke({ op: 'start', userId, day, now, profile }) as ReturnType<AttemptStore['start']>,
    reserve: (userId, day, kind, hash, now, blank = false, window) => invoke({ op: 'reserve', userId, day, kind, hash, now, blank, window }) as ReturnType<AttemptStore['reserve']>,
    complete: (userId, day, outcome, hash, cells, now, reservedAt) => invoke({ op: 'complete', userId, day, outcome, hash, cells, now, reservedAt }) as ReturnType<AttemptStore['complete']>,
    end: async (userId, day, cells, now) => (await invoke({ op: 'end', userId, day, cells, now }) as { row: AttemptRow | null }).row,
    get: async (userId, day, now) => (await invoke({ op: 'get', userId, day, now }) as { row: AttemptRow | null }).row,
    publish: async (userId, day, now) => { await invoke({ op: 'publish', userId, day, now }) },
    reset: async (userId, day) => { await invoke({ op: 'reset', userId, day }) },
  }
}

export function doAttemptStore(env: Env): AttemptStore {
  return makeStore(async body => {
    const stub = env.DAILY_ROOMS.get(env.DAILY_ROOMS.idFromName(body.day))
    const response = await stub.fetch(new Request('https://daily-room/op', { method: 'POST', body: JSON.stringify(body) }))
    if (!response.ok) throw new Error(`DailyRoom returned ${response.status}`)
    return await response.json() as ReturnType<typeof applyOperation>
  })
}

export function memoryAttemptStore(tools?: ServerTools): AttemptStore {
  const rows = new Map<string, AttemptRow>()
  const publish = tools ? attemptPublisher(async (userId, day) => structuredClone(rows.get(JSON.stringify([day, userId])) ?? null), tools) : null
  return makeStore(async body => {
    if (body.op === 'publish') {
      if (!publish) throw new Error('Memory publisher requires record tools')
      await publish(body.userId, body.day, body.now)
      return { row: null }
    }
    const key = JSON.stringify([body.day, body.userId])
    if (body.op === 'reset') {
      rows.delete(key)
      return { row: null }
    }
    const stored = rows.get(key)
    const result = applyOperation(stored ? normalizeRow(stored) : null, body)
    if ('row' in result && result.row && (body.op !== 'get' || JSON.stringify(result.row) !== JSON.stringify(stored))) rows.set(key, structuredClone(result.row))
    return structuredClone(result)
  })
}
