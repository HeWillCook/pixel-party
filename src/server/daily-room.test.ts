import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker'
import type { AttemptStore } from './daily-room'
import type { ServerTools } from './server-tools'
import { memoryTools } from './room-test-tools'
import { createServerTools } from './server-tools'

const grade = { guess: 'cat', reason: 'test', fit: 0, recognition: 0, speed: 0, total: 500, elapsedMs: 1000 }

vi.mock('deepspace/worker', () => ({
  BaseRoom: class {
    state: DurableObjectState
    sql: SqlStorage
    constructor(state: DurableObjectState) {
      this.state = state
      this.sql = state.storage.sql
    }
  },
}))
vi.mock('./server-tools', () => ({ createServerTools: vi.fn() }))

import { DailyRoom, doAttemptStore, memoryAttemptStore } from './daily-room'

function fakeDOStore(tools = memoryTools().tools): AttemptStore {
  vi.mocked(createServerTools).mockReturnValue(tools)
  const rooms = new Map<string, DailyRoom>()
  const namespace = {
    idFromName: (day: string) => day,
    get: (day: string) => {
      if (!rooms.has(day)) {
        const rows = new Map<string, string>()
        const sql = {
          exec: (query: string, ...args: string[]) => {
            if (query.startsWith('INSERT')) rows.set(`${args[0]}:${args[1]}`, args[2])
            const row = query.startsWith('SELECT') ? rows.get(`${args[0]}:${args[1]}`) : undefined
            return { toArray: () => row === undefined ? [] : [{ row }] }
          },
        }
        const storage = { sql, transactionSync: <T>(callback: () => T) => callback() }
        rooms.set(day, new DailyRoom({ storage } as unknown as DurableObjectState, {} as Env))
      }
      return { fetch: (request: Request) => rooms.get(day)!.fetch(request) }
    },
  }
  return doAttemptStore({ DAILY_ROOMS: namespace } as unknown as Env)
}

describe.each([['memory', memoryAttemptStore], ['durable object', fakeDOStore]])('%s attempt store', (_name, createStore) => {
  it('publishes the durable winning snapshot through an ordered current-best writer', async () => {
    const records = memoryTools()
    const store = createStore(records.tools as ServerTools)
    const day = '2026-11-17'
    await store.start('user', day, 1000, { name: 'Alice', image: 'alice.png' })
    await store.publish('user', day, 1000)
    await store.reserve('user', day, 'ask', 'first', 2000)
    await store.complete('user', day, grade, 'first', 'first cells', 3000, 2000)
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const update = records.update.getMockImplementation()!
    records.update.mockImplementationOnce(async (...args) => { await held; return update(...args) })
    const oldWrite = store.publish('user', day, 3000)
    await vi.waitFor(() => expect(records.update).toHaveBeenCalled())
    const better = { ...grade, total: 800, elapsedMs: 24_000, reason: 'winner' }
    await store.reserve('user', day, 'ask', 'next', 25_000)
    await store.complete('user', day, better, 'next', 'winning cells', 26_000, 25_000)
    const newWrite = store.publish('user', day, 26_000)
    release()
    await Promise.all([oldWrite, newWrite])
    expect(await store.get('user', day)).toMatchObject({ bestGrade: { cells: 'winning cells', grade: better } })
    expect([...records.rows('dailyScores').values()]).toMatchObject([{ score: 800, displayName: 'Alice' }])
    expect([...records.rows('dailyDrawings').values()]).toMatchObject([{ score: 800, cells: 'winning cells', reason: 'winner' }])
  })

  it('starts, reserves, completes and ends an attempt independently per day', async () => {
    const store = createStore()
    const day = '2026-11-17'
    expect((await store.start('user', day, 1000)).created).toBe(true)
    expect((await store.start('user', day, 2000)).created).toBe(false)
    expect((await store.reserve('user', day, 'ask', 'hash', 2000)).ok).toBe(true)
    expect(await store.reserve('user', day, 'ask', 'hash', 2001)).toEqual({ ok: false, reason: 'busy' })
    expect((await store.complete('user', day, grade, 'hash', 'cells', 3000, 2000)).improved).toBe(true)
    expect((await store.get('user', day))?.bestScore).toBe(500)
    expect(await store.get('user', '2026-11-18')).toBeNull()
    expect((await store.end('user', day, null, 4000))?.endedAt).toBe(4000)
    expect(await store.reserve('user', day, 'ask', 'hash', 5000)).toEqual({ ok: false, reason: 'ended' })
  })

  it('ignores completion for a different reservation', async () => {
    const store = createStore()
    await store.start('user', '2026-11-17', 1000)
    await store.reserve('user', '2026-11-17', 'ask', 'hash', 2000)
    const before = await store.get('user', '2026-11-17')
    const result = await store.complete('user', '2026-11-17', grade, 'hash', 'cells', 3000, 1999)
    expect(result).toEqual({ row: before, improved: false, applied: false })
    expect(await store.get('user', '2026-11-17')).toEqual(before)
  })
})
