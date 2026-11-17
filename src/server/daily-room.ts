import { BaseRoom } from 'deepspace/worker'
import type { Env } from '../../worker.js'
import { completeGrade, endAttempt, reserveGrade, startAttempt } from '../game/daily/attempt'
import type { AttemptRow, GradeKind } from '../game/daily/attempt'

type Outcome = { total: number; elapsedMs: number } | null
type Operation =
  | { op: 'start'; userId: string; day: string; now: number }
  | { op: 'reserve'; userId: string; day: string; kind: GradeKind; hash: string; now: number }
  | { op: 'complete'; userId: string; day: string; outcome: Outcome; hash: string; cells: string; now: number; reservedAt: number }
  | { op: 'end'; userId: string; day: string; cells: string | null; now: number }
  | { op: 'get'; userId: string; day: string }

export interface AttemptStore {
  start(userId: string, day: string, now: number): Promise<{ row: AttemptRow; created: boolean }>
  reserve(userId: string, day: string, kind: GradeKind, hash: string, now: number): Promise<ReturnType<typeof reserveGrade>>
  complete(userId: string, day: string, outcome: Outcome, hash: string, cells: string, now: number, reservedAt: number): Promise<{ row: AttemptRow; improved: boolean }>
  end(userId: string, day: string, cells: string | null, now: number): Promise<AttemptRow | null>
  get(userId: string, day: string): Promise<AttemptRow | null>
}

function applyOperation(row: AttemptRow | null, body: Operation) {
  switch (body.op) {
    case 'start': return startAttempt(row, body.userId, body.day, body.now)
    case 'reserve': return reserveGrade(row, body.kind, body.hash, body.now)
    case 'complete':
      if (!row) throw new Error('Attempt not started')
      return completeGrade(row, body.outcome, body.hash, body.cells, body.now, body.reservedAt)
    case 'end': return { row: row ? endAttempt(row, body.cells, body.now) : null }
    case 'get': return { row }
  }
}

export class DailyRoom extends BaseRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    this.sql.exec('CREATE TABLE IF NOT EXISTS attempts (day TEXT, userId TEXT, row TEXT NOT NULL, PRIMARY KEY(day,userId))')
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/op') return new Response('Not found', { status: 404 })
    const body = await request.json() as Operation
    const result = this.state.storage.transactionSync(() => {
      const stored = this.sql.exec<{ row: string }>('SELECT row FROM attempts WHERE day = ? AND userId = ?', body.day, body.userId).toArray()[0]
      const row = stored ? JSON.parse(stored.row) as AttemptRow : null
      const result = applyOperation(row, body)
      if ('row' in result && result.row && body.op !== 'get') {
        this.sql.exec('INSERT INTO attempts (day, userId, row) VALUES (?, ?, ?) ON CONFLICT(day, userId) DO UPDATE SET row = excluded.row', body.day, body.userId, JSON.stringify(result.row))
      }
      return result
    })
    return Response.json(result)
  }

  protected onMessage(): void {}
}

function makeStore(invoke: (body: Operation) => Promise<ReturnType<typeof applyOperation>>): AttemptStore {
  return {
    start: (userId, day, now) => invoke({ op: 'start', userId, day, now }) as ReturnType<AttemptStore['start']>,
    reserve: (userId, day, kind, hash, now) => invoke({ op: 'reserve', userId, day, kind, hash, now }) as ReturnType<AttemptStore['reserve']>,
    complete: (userId, day, outcome, hash, cells, now, reservedAt) => invoke({ op: 'complete', userId, day, outcome, hash, cells, now, reservedAt }) as ReturnType<AttemptStore['complete']>,
    end: async (userId, day, cells, now) => (await invoke({ op: 'end', userId, day, cells, now }) as { row: AttemptRow | null }).row,
    get: async (userId, day) => (await invoke({ op: 'get', userId, day }) as { row: AttemptRow | null }).row,
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

export function memoryAttemptStore(): AttemptStore {
  const rows = new Map<string, AttemptRow>()
  return makeStore(async body => {
    const key = JSON.stringify([body.day, body.userId])
    const result = applyOperation(rows.get(key) ?? null, body)
    if ('row' in result && result.row && body.op !== 'get') rows.set(key, structuredClone(result.row))
    return structuredClone(result)
  })
}
