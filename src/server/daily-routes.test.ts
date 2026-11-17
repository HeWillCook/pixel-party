import { beforeEach, describe, expect, it, vi } from 'vitest'
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

function request(path: string, method = 'GET', body?: unknown, token: string | null = 'valid') {
  return worker.request(`/api/daily/${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, env, ctx)
}

describe('daily HTTP routes', () => {
  beforeEach(() => {
    vi.mocked(doAttemptStore).mockReturnValue(memoryAttemptStore())
    vi.mocked(createDailyJudge).mockReturnValue(fakeDailyJudge())
    vi.mocked(createServerTools).mockReturnValue(memoryTools().tools)
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
    const grade = await request('grade', 'POST', { kind: 'ask', cells, userId: 'attacker' })
    expect(grade.status).toBe(200)
    expect(await grade.json()).toMatchObject({ ok: true, state: { asksUsed: 1 } })
    expect(await (await request('me')).json()).toMatchObject({ asksUsed: 1, lastCells: cells })
    expect(await (await request('end', 'POST', { cells })).json()).toMatchObject({ status: 'ended' })
    const drawings = await request('today/drawings')
    expect(drawings.status).toBe(200)
    expect(await drawings.json()).toMatchObject({ ok: true, drawings: [{ data: { userId: 'alice', displayName: 'Alice' } }] })
  })

  it('returns business rejections at 200 and permits omitted end cells', async () => {
    const grade = await request('grade', 'POST', { kind: 'ask', cells: 'bad' })
    expect(grade.status).toBe(200)
    expect(await grade.json()).toMatchObject({ ok: false, reason: 'bad_cells' })
    expect((await request('end', 'POST', {})).status).toBe(200)
  })

  it.each([null, [], { cells: 123 }].map(body => [body]))('rejects malformed end bodies: %j', async body => {
    expect((await request('end', 'POST', body)).status).toBe(400)
  })
})
