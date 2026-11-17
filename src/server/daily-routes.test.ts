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
  it('returns a persisted blank auto skip and current server clock', async () => {
    vi.useFakeTimers()
    const start = Date.UTC(2026, 10, 17, 12)
    vi.setSystemTime(start)
    await request('start', 'POST')
    vi.setSystemTime(start + 120_000)
    const response = await request('grade', 'POST', { day: day(), kind: 'auto', cells })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ skipped: 'skipped_blank', window: 0, state: { serverNow: start + 120_000 } })
    vi.setSystemTime(start + 121_000)
    expect(await (await request('me')).json()).toMatchObject({ serverNow: start + 121_000, windows: [{ status: 'skipped_blank' }, {}, {}, {}] })
  })

  it.each([['start', 'POST'], ['grade', 'POST'], ['end', 'POST'], ['me', 'GET'], ['today/drawings', 'GET']])('requires a verified bearer token on %s', async (path, method) => {
    for (const token of [null, 'invalid']) {
      const response = await request(path, method, undefined, token)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'sign_in_required' })
    }
  })

  it.each([null, [], {}, { kind: 'other', cells }, { kind: 'ask', cells: 1 }, { kind: 'ask' }].map(body => [body]))('rejects malformed grade bodies: %j', async body => {
    expect((await request('grade', 'POST', body)).status).toBe(400)
  })

  it('returns 400 for invalid JSON rather than a worker exception', async () => {
    expect((await worker.request('/api/daily/grade', { method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: '{' }, env, ctx)).status).toBe(400)
  })

  it('maps authenticated identity and serves start, grade, state, end and drawing access', async () => {
    const before = await request('me')
    expect(await before.json()).not.toHaveProperty('prompt')
    expect((await request('today/drawings')).status).toBe(403)
    const start = await request('start', 'POST')
    expect(start.status).toBe(200)
    expect(await start.json()).toMatchObject({ status: 'playing' })
    const grade = await request('grade', 'POST', { day: day(), kind: 'ask', cells, userId: 'attacker' })
    expect(grade.status).toBe(200)
    expect(await grade.json()).toMatchObject({ ok: true, state: { asksUsed: 1 } })
    expect(await (await request('me')).json()).toMatchObject({ asksUsed: 1, lastCells: cells })
    expect(await (await request('end', 'POST', { day: day(), cells })).json()).toMatchObject({ status: 'ended' })
    const drawings = await request('today/drawings')
    expect(drawings.status).toBe(200)
    expect(await drawings.json()).toMatchObject({ ok: true, drawings: [{ data: { userId: 'alice', displayName: 'Alice' } }] })
  })

  it('returns business rejections at 200 and permits omitted end cells', async () => {
    const grade = await request('grade', 'POST', { day: day(), kind: 'ask', cells: 'bad' })
    expect(grade.status).toBe(200)
    expect(await grade.json()).toMatchObject({ ok: false, reason: 'bad_cells' })
    expect((await request('end', 'POST', { day: day() })).status).toBe(200)
  })

  it.each([null, [], { cells: 123 }].map(body => [body]))('rejects malformed end bodies: %j', async body => {
    expect((await request('end', 'POST', body)).status).toBe(400)
  })

  it.each([undefined, 123, 'not-a-day'])('I3 requires an explicit day for grade and end: %j', async value => {
    expect((await request('grade', 'POST', { day: value, kind: 'ask', cells })).status).toBe(400)
    expect((await request('end', 'POST', { day: value, cells })).status).toBe(400)
  })

  it('I3 routes yesterday and today independently and rejects invalid or expired days', async () => {
    vi.useFakeTimers()
    const late = Date.UTC(2026, 10, 17, 23, 55)
    vi.setSystemTime(late)
    await request('start', 'POST')
    vi.setSystemTime(late + 360_000)
    const yesterday = '2026-11-17'
    expect(await (await request('me')).json()).toMatchObject({ day: yesterday, status: 'playing' })
    await request('start', 'POST')
    expect(await (await request('grade', 'POST', { day: yesterday, kind: 'ask', cells })).json())
      .toMatchObject({ ok: true, grade: { elapsedMs: 360_000 }, state: { day: yesterday } })
    expect(await (await request('end', 'POST', { day: yesterday, cells })).json()).toMatchObject({ day: yesterday, status: 'ended' })
    expect(await (await request('me')).json()).toMatchObject({ day: '2026-11-18', status: 'playing', asksUsed: 0 })
    for (const invalidDay of [yesterday, '2026-11-16', '2026-11-19', '2026-99-99']) {
      expect(await (await request('grade', 'POST', { day: invalidDay, kind: 'ask', cells })).json()).toMatchObject({ ok: false, reason: 'invalid_day', state: { day: invalidDay } })
      expect((await request('end', 'POST', { day: invalidDay, cells })).status).toBe(400)
    }
    expect(await (await request('me')).json()).toMatchObject({ day: '2026-11-18', status: 'playing', asksUsed: 0, finalUsed: false })
  })
})
