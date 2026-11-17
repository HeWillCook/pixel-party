import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker'
import type { AttemptStore } from './daily-room'

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

import { DailyRoom, doAttemptStore, memoryAttemptStore } from './daily-room'

function fakeDOStore(): AttemptStore {
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
  it('starts, reserves, completes and ends an attempt independently per day', async () => {
    const store = createStore()
    const day = '2026-11-17'
    expect((await store.start('user', day, 1000)).created).toBe(true)
    expect((await store.start('user', day, 2000)).created).toBe(false)
    expect((await store.reserve('user', day, 'ask', 'hash', 2000)).ok).toBe(true)
    expect(await store.reserve('user', day, 'ask', 'hash', 2001)).toEqual({ ok: false, reason: 'busy' })
    expect((await store.complete('user', day, { total: 500, elapsedMs: 1000 }, 'hash', 'cells', 3000, 2000)).improved).toBe(true)
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
    const result = await store.complete('user', '2026-11-17', { total: 500, elapsedMs: 1000 }, 'hash', 'cells', 3000, 1999)
    expect(result).toEqual({ row: before, improved: false })
    expect(await store.get('user', '2026-11-17')).toEqual(before)
  })
})
