import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../../worker.js'
import type { Env } from '../../worker.js'
import { encodeCells } from '../game/grid'
import { fakeDailyJudge } from './daily-judge'
import { memoryAttemptStore } from './daily-room'
import { memoryTools } from './room-test-tools'

vi.mock('deepspace/worker', async importOriginal => ({
  ...await importOriginal<typeof import('deepspace/worker')>(),
  armCronRoom: vi.fn(),
  verifyJwt: vi.fn(async (_config, token) => ({ result: token === 'valid' ? { userId: 'alice', claims: { sub: 'alice', name: 'Alice', image: 'alice.png' } } : null })),
}))
vi.mock('./daily-room', async importOriginal => ({ ...await importOriginal<typeof import('./daily-room')>(), doAttemptStore: vi.fn() }))
vi.mock('./daily-judge', async importOriginal => ({ ...await importOriginal<typeof import('./daily-judge')>(), createDailyJudge: vi.fn(), renderCellsPng: vi.fn(async () => 'png') }))
vi.mock('./server-tools', () => ({ createServerTools: vi.fn() }))
vi.mock('./budget', () => ({ reserveBudget: vi.fn(async () => true) }))

import { doAttemptStore } from './daily-room'
import { createDailyJudge } from './daily-judge'
import { createServerTools } from './server-tools'

const env = {} as Env
const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext
const cells = encodeCells(new Uint8Array(1024))
const paintedCells = encodeCells(new Uint8Array(1024).fill(2))
const day = () => new Date().toISOString().slice(0, 10)

function request(path: string, method = 'GET', body?: unknown, token: string | null = 'valid') {
  return worker.request(`/api/daily/${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, env, ctx)
}

describe('daily HTTP routes', () => {
  afterEach(() => { vi.useRealTimers() })
  beforeEach(() => {
    const records = memoryTools()
    vi.mocked(doAttemptStore).mockReturnValue(memoryAttemptStore(records.tools))
    vi.mocked(createDailyJudge).mockReturnValue(fakeDailyJudge())
    vi.mocked(createServerTools).mockReturnValue(records.tools)
  })
  it('returns a persisted blank halfway skip and current server clock', async () => {
    vi.useFakeTimers()
    const start = Date.UTC(2026, 10, 17, 12)
    vi.setSystemTime(start)
    await request('start', 'POST')
    vi.setSystemTime(start + 150_000)
    const response = await request('grade', 'POST', { day: day(), kind: 'auto', cells, window: 0 })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ skipped: 'skipped_blank', window: 0, state: { serverNow: start + 150_000 } })
    vi.setSystemTime(start + 151_000)
    expect(await (await request('me')).json()).toMatchObject({ serverNow: start + 151_000, windows: [{ status: 'skipped_blank' }] })
  })

  it('rejects missing window identifiers and a second halfway window', async () => {
    vi.useFakeTimers()
    const start = Date.UTC(2026, 10, 17, 12)
    vi.setSystemTime(start)
    await request('start', 'POST')
    expect((await request('grade', 'POST', { day: day(), kind: 'auto', cells })).status).toBe(400)
    vi.setSystemTime(start + 150_000)
    expect(await (await request('grade', 'POST', { day: day(), kind: 'auto', cells, window: 0 })).json()).toMatchObject({ skipped: 'skipped_blank' })
    vi.setSystemTime(start + 300_000)
    expect(await (await request('grade', 'POST', { day: day(), kind: 'auto', cells, window: 0 })).json()).toMatchObject({ ok: false, reason: 'no_auto_left', state: { windows: [{ status: 'skipped_blank' }] } })
    expect((await request('grade', 'POST', { day: day(), kind: 'auto', cells, window: 1 })).status).toBe(400)
  })

  it.each([['start', 'POST'], ['grade', 'POST'], ['end', 'POST'], ['peek', 'POST'], ['canvas', 'POST'], ['me', 'GET'], ['today/drawings', 'GET']])('requires a verified bearer token on %s', async (path, method) => {
    for (const token of [null, 'invalid']) {
      const response = await request(path, method, undefined, token)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'sign_in_required' })
    }
  })

  it.each([null, [], {}, { kind: 'other', cells }, { kind: 'ask', cells: 1 }, { kind: 'ask' }, { kind: 'final' }].map(body => [body]))('rejects malformed grade bodies: %j', async body => {
    expect((await request('grade', 'POST', body)).status).toBe(400)
  })

  it.each([null, [], { cells: 1 }].map(body => [body]))('rejects malformed peek and canvas bodies: %j', async body => {
    expect((await request('peek', 'POST', body)).status).toBe(400)
    expect((await request('canvas', 'POST', body)).status).toBe(400)
  })

  it('returns 400 for invalid JSON rather than a worker exception', async () => {
    expect((await worker.request('/api/daily/grade', { method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: '{' }, env, ctx)).status).toBe(400)
  })

  it('maps authenticated identity and serves start, grade, state, canvas, peek, end and drawing access', async () => {
    vi.useFakeTimers()
    const start = Date.UTC(2026, 10, 17, 12)
    vi.setSystemTime(start)
    const before = await request('me')
    expect(await before.json()).not.toHaveProperty('prompt')
    expect((await request('today/drawings')).status).toBe(403)
    const startRes = await request('start', 'POST')
    expect(startRes.status).toBe(200)
    expect(await startRes.json()).toMatchObject({ status: 'playing' })
    expect(await (await request('canvas', 'POST', { day: day(), cells: paintedCells })).json()).toEqual({ ok: true })
    expect(await (await request('me')).json()).toMatchObject({ lastCells: paintedCells })
    vi.setSystemTime(start + 75_000)
    const peek = await request('peek', 'POST', { day: day(), cells: paintedCells })
    expect(peek.status).toBe(200)
    expect(await peek.json()).toMatchObject({ ok: true, line: expect.any(String) })
    vi.setSystemTime(start + 150_000)
    const grade = await request('grade', 'POST', { day: day(), kind: 'auto', cells: paintedCells, window: 0, userId: 'attacker' })
    expect(grade.status).toBe(200)
    expect(await grade.json()).toMatchObject({ ok: true, state: { autoUsed: 1 } })
    vi.setSystemTime(start + 300_000)
    expect(await (await request('end', 'POST', { day: day(), cells })).json()).toMatchObject({ status: 'ended' })
    const drawings = await request('today/drawings')
    expect(drawings.status).toBe(200)
    expect(await drawings.json()).toMatchObject({ ok: true, drawings: [{ data: { userId: 'alice', displayName: 'Alice' } }] })
  })

  it('serves today\'s drawings for one player on request and refuses a caller who has not ended', async () => {
    vi.useFakeTimers()
    const start = Date.UTC(2026, 10, 17, 12)
    vi.setSystemTime(start)
    const records = createServerTools(env)
    await records.create('dailyDrawings', { day: day(), userId: 'bob', cells: paintedCells, score: 700 })
    await records.create('dailyDrawings', { day: day(), userId: 'carol', cells: paintedCells, score: 800 })
    // A friend's wall asks for one player: the gate is still the caller's own ended attempt.
    await request('start', 'POST')
    expect((await request('today/drawings?userId=bob')).status).toBe(403)
    expect((await request('today/drawings')).status).toBe(403)
    vi.setSystemTime(start + 300_000)
    await request('end', 'POST', { day: day(), cells })
    const one = await request('today/drawings?userId=bob')
    expect(one.status).toBe(200)
    const body = await one.json() as { ok: boolean; drawings: { data: { userId: string } }[] }
    expect(body.drawings.map(record => record.data.userId)).toEqual(['bob'])
    const all = await (await request('today/drawings')).json() as { drawings: { data: { userId: string } }[] }
    expect(all.drawings.map(record => record.data.userId).sort()).toEqual(['alice', 'bob', 'carol'])
    // An empty filter is a bad request, not "everyone".
    expect((await request('today/drawings?userId=')).status).toBe(400)
    expect((await request(`today/drawings?userId=${'x'.repeat(129)}`)).status).toBe(400)
  })

  it('returns business rejections at 200 and refuses an early end', async () => {
    vi.useFakeTimers()
    const start = Date.UTC(2026, 10, 17, 12)
    vi.setSystemTime(start)
    await request('start', 'POST')
    const grade = await request('grade', 'POST', { day: day(), kind: 'auto', cells: 'bad', window: 0 })
    expect(grade.status).toBe(200)
    expect(await grade.json()).toMatchObject({ ok: false, reason: 'bad_cells' })
    expect((await request('end', 'POST', { day: day() })).status).toBe(400)
    vi.setSystemTime(start + 120_000)
    expect((await request('end', 'POST', { day: day() })).status).toBe(400)
    vi.setSystemTime(start + 300_000)
    expect((await request('end', 'POST', { day: day() })).status).toBe(200)
  })

  it.each([null, [], { cells: 123 }].map(body => [body]))('rejects malformed end bodies: %j', async body => {
    expect((await request('end', 'POST', body)).status).toBe(400)
  })

  it.each([undefined, 123, 'not-a-day'])('I3 requires an explicit day for grade, peek, canvas and end: %j', async value => {
    expect((await request('grade', 'POST', { day: value, kind: 'auto', cells })).status).toBe(400)
    expect((await request('peek', 'POST', { day: value, cells })).status).toBe(400)
    expect((await request('canvas', 'POST', { day: value, cells })).status).toBe(400)
    expect((await request('end', 'POST', { day: value, cells })).status).toBe(400)
  })

  it('I3 routes yesterday and today independently and rejects invalid or expired days', async () => {
    vi.useFakeTimers()
    const late = Date.UTC(2026, 10, 17, 23, 57)
    vi.setSystemTime(late)
    await request('start', 'POST')
    vi.setSystemTime(late + 300_000)
    const yesterday = '2026-11-17'
    expect(await (await request('me')).json()).toMatchObject({ day: yesterday, status: 'playing' })
    await request('start', 'POST')
    expect(await (await request('grade', 'POST', { day: yesterday, kind: 'final', cells: paintedCells })).json())
      .toMatchObject({ ok: true, grade: { elapsedMs: 300_000 }, state: { day: yesterday } })
    expect(await (await request('end', 'POST', { day: yesterday, cells })).json()).toMatchObject({ day: yesterday, status: 'ended' })
    expect(await (await request('me')).json()).toMatchObject({ day: '2026-11-18', status: 'playing' })
    // A closing tab can still reach yesterday until its grace window ends: it is told the
    // attempt is over rather than that the day is invalid.
    expect(await (await request('grade', 'POST', { day: yesterday, kind: 'final', cells })).json()).toMatchObject({ ok: false, reason: 'ended', state: { day: yesterday } })
    expect(await (await request('end', 'POST', { day: yesterday, cells })).json()).toMatchObject({ day: yesterday, status: 'ended' })
    for (const invalidDay of ['2026-11-16', '2026-11-19', '2026-99-99']) {
      expect(await (await request('grade', 'POST', { day: invalidDay, kind: 'final', cells })).json()).toMatchObject({ ok: false, reason: 'invalid_day', state: { day: invalidDay } })
      expect((await request('end', 'POST', { day: invalidDay, cells })).status).toBe(400)
    }
    expect(await (await request('me')).json()).toMatchObject({ day: '2026-11-18', status: 'playing', finalUsed: false })
  })

  it('temporarily resets an ended attempt with the same daily prompt for testing', async () => {
    vi.useFakeTimers()
    const start = Date.UTC(2026, 10, 17, 12)
    vi.setSystemTime(start)
    expect((await request('reset', 'POST', undefined, null)).status).toBe(401)
    const firstStart = await (await request('start', 'POST')).json() as { prompt: string }
    vi.setSystemTime(start + 300_000)
    expect(await (await request('end', 'POST', { day: day(), cells })).json()).toMatchObject({ status: 'ended' })

    const resetRes = await request('reset', 'POST')
    expect(resetRes.status).toBe(200)
    expect(await resetRes.json()).toMatchObject({ day: day(), status: 'not_started', best: 0 })

    const secondStart = await (await request('start', 'POST')).json() as { prompt: string; status: string }
    expect(secondStart.status).toBe('playing')
    expect(secondStart.prompt).toBe(firstStart.prompt)
  })

  // DEV ONLY (__DEBUG_TOOLS__): remove with the debug-paintings route
  it('temporarily adds and clears generated gallery paintings for the signed-in player only', async () => {
    expect((await request('debug-paintings', 'POST', { add: 2 }, null)).status).toBe(401)
    expect((await request('debug-paintings', 'POST', { add: 0 })).status).toBe(400)
    expect((await request('debug-paintings', 'POST', {})).status).toBe(400)
    const records = createServerTools(env)
    await records.create('dailyDrawings', { day: '2020-01-01', userId: 'bob', cells: 'x', score: 5, reason: '[debug painting]' })
    expect(await (await request('debug-paintings', 'POST', { add: 4 })).json()).toEqual({ added: 4 })
    const mine = await records.query('dailyDrawings', { where: { userId: 'alice' }, limit: 100 })
    expect(mine.success && mine.data.records).toHaveLength(4)
    expect(await (await request('debug-paintings', 'POST', { clear: true })).json()).toEqual({ removed: 4 })
    const left = await records.query('dailyDrawings', { limit: 100 })
    expect(left.success && left.data.records.map(record => record.data.userId)).toEqual(['bob'])
  })
})
