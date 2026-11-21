import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker'
import type { AttemptStore } from './daily-room'
import type { ServerTools } from './server-tools'
import { memoryTools } from './room-test-tools'
import { createServerTools } from './server-tools'

const grade = {
  guess: 'cat', reason: 'test', match: 80, recognition: 100, quality: 50,
  matchPoints: 360, qualityBonus: 180, total: 540, elapsedMs: 150_000,
}

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
  it('persists settled windows and skipped reservations', async () => {
    const store = createStore()
    const day = '2026-11-17'
    await store.start('user', day, 1_000)
    const skip = await store.reserve('user', day, 'auto', 'hash', 151_000, true)
    expect(skip).toMatchObject({ ok: 'skipped', status: 'skipped_blank', window: 0 })
    expect((await store.get('user', day, 152_000))?.windows[0].status).toBe('skipped_blank')
    expect((await store.get('user', day))?.windows[0].status).toBe('skipped_blank')
  })
  it('publishes the winning score with the latest snapshot through an ordered writer', async () => {
    const records = memoryTools()
    const store = createStore(records.tools as ServerTools)
    const day = '2026-11-17'
    await store.start('user', day, 1000, { name: 'Alice', image: 'alice.png' })
    await store.publish('user', day, 1000)
    await store.reserve('user', day, 'auto', 'first', 151_000)
    await store.complete('user', day, grade, 'first', 'first cells', 152_000, 151_000)
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const update = records.update.getMockImplementation()!
    records.update.mockImplementationOnce(async (...args) => { await held; return update(...args) })
    const oldWrite = store.publish('user', day, 152_000)
    await vi.waitFor(() => expect(records.update).toHaveBeenCalled())
    const later = { ...grade, total: 500, elapsedMs: 300_000, reason: 'later' }
    await store.reserve('user', day, 'final', 'next', 301_000)
    await store.complete('user', day, later, 'next', 'later cells', 302_000, 301_000)
    const newWrite = store.publish('user', day, 302_000)
    release()
    await Promise.all([oldWrite, newWrite])
    expect(await store.get('user', day)).toMatchObject({
      bestGrade: { cells: 'first cells', grade },
      lastGrade: { cells: 'later cells', grade: later },
      lastCells: 'later cells',
      bestScore: 540,
      endedAt: 302_000,
    })
    expect([...records.rows('dailyScores').values()]).toMatchObject([{ score: 540, displayName: 'Alice' }])
    expect([...records.rows('dailyDrawings').values()]).toMatchObject([{ score: 540, cells: 'later cells', reason: 'later' }])
  })

  it('starts, reserves, completes and ends an attempt independently per day', async () => {
    const store = createStore()
    const day = '2026-11-17'
    expect((await store.start('user', day, 1000)).created).toBe(true)
    expect((await store.start('user', day, 2000)).created).toBe(false)
    expect((await store.reserve('user', day, 'auto', 'hash', 151_000)).ok).toBe(true)
    expect(await store.reserve('user', day, 'auto', 'hash', 151_001)).toEqual({ ok: false, reason: 'busy' })
    expect((await store.complete('user', day, grade, 'hash', 'cells', 152_000, 151_000)).improved).toBe(true)
    expect((await store.get('user', day))?.bestScore).toBe(540)
    expect(await store.get('user', '2026-11-18')).toBeNull()
    expect((await store.end('user', day, null, 301_000))?.endedAt).toBe(301_000)
    expect(await store.reserve('user', day, 'final', 'hash', 302_000)).toEqual({ ok: false, reason: 'ended' })
  })

  it('saves the latest canvas and counts peeks without touching the grade', async () => {
    const store = createStore()
    const day = '2026-11-17'
    await store.start('user', day, 1000)
    expect(await store.save('user', day, 'art', 11_000)).toMatchObject({ ok: true, row: { lastCells: 'art' } })
    expect(await store.reservePeek('user', day, 76_000)).toMatchObject({ ok: true, row: { peeksUsed: 1 } })
    expect(await store.reservePeek('user', day, 226_000)).toMatchObject({ ok: true, row: { peeksUsed: 2 } })
    expect(await store.reservePeek('user', day, 227_000)).toEqual({ ok: false, reason: 'no_peeks_left' })
    expect(await store.get('user', day)).toMatchObject({ lastCells: 'art', bestScore: 0, lastGradedHash: null, peeksUsed: 2 })
  })

  it('ignores completion for a different reservation', async () => {
    const store = createStore()
    await store.start('user', '2026-11-17', 1000)
    await store.reserve('user', '2026-11-17', 'auto', 'hash', 151_000)
    const before = await store.get('user', '2026-11-17')
    const result = await store.complete('user', '2026-11-17', grade, 'hash', 'cells', 152_000, 150_999)
    expect(result).toEqual({ row: before, improved: false, applied: false })
    expect(await store.get('user', '2026-11-17')).toEqual(before)
  })
})
