import { beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../../worker.js'
import type { Env } from '../../worker.js'
import { memoryTools } from './room-test-tools'

vi.mock('deepspace/worker', async importOriginal => ({
  ...await importOriginal<typeof import('deepspace/worker')>(),
  armCronRoom: vi.fn(),
  verifyJwt: vi.fn(async (_config, token) => ({
    result: token === 'alice' || token === 'bob' ? { userId: token, claims: { name: token } } : null,
  })),
}))
vi.mock('./server-tools', () => ({ createServerTools: vi.fn() }))

import { createServerTools } from './server-tools'

const env = {} as Env
const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext

function request(path: string, method = 'GET', body?: unknown, token: string | null = 'alice') {
  return worker.request(`/api/profile${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, env, ctx)
}

describe('profile HTTP routes', () => {
  beforeEach(() => {
    const records = memoryTools()
    vi.mocked(createServerTools).mockReturnValue(records.tools)
  })

  it.each([
    ['/me', 'GET'],
    ['/available?name=will', 'GET'],
    ['', 'POST'],
    ['', 'PUT'],
    ['/onboarded', 'POST'],
  ] as const)('requires a verified bearer token on %s %s', async (path, method) => {
    for (const token of [null, 'invalid']) {
      const response = await request(path, method, method === 'GET' ? undefined : { username: 'Will' }, token)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'sign_in_required' })
    }
  })

  it('returns an explicit null profile before one exists', async () => {
    const response = await request('/me')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ profile: null })
  })

  it('sets a username with POST and reads it back', async () => {
    const saved = await request('', 'POST', { username: '  Will  ' })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ ok: true, profile: { userId: 'alice', username: 'Will', onboardedAt: 0 } })
    expect(await (await request('/me')).json()).toMatchObject({
      profile: { userId: 'alice', username: 'Will', onboardedAt: 0 },
    })
  })

  it('accepts PUT as an alias', async () => {
    const saved = await request('', 'PUT', { username: 'Will' })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ ok: true, profile: { username: 'Will' } })
  })

  it('validates bodies and names', async () => {
    expect((await request('', 'POST', {})).status).toBe(400)
    expect(await (await request('', 'POST', { username: 42 })).json()).toMatchObject({ ok: false, code: 'required' })
    const invalid = await request('', 'POST', { username: 'ab' })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ ok: false, code: 'too_short', message: 'At least 3 characters' })
    expect((await request('', 'POST', undefined, 'alice')).status).toBe(400)
  })

  it('answers availability, including case-insensitive collisions', async () => {
    await request('', 'POST', { username: 'Will' })
    expect(await (await request('/available?name=Will')).json()).toEqual({ available: true })
    const taken = await request('/available?name=WILL', 'GET', undefined, 'bob')
    expect(taken.status).toBe(200)
    expect(await taken.json()).toEqual({ available: false, code: 'taken', message: "That name's taken" })
    expect(await (await request('/available?name=ab')).json()).toMatchObject({ available: false, code: 'too_short' })
    expect(await (await request('/available?name=admin')).json()).toMatchObject({ available: false, code: 'reserved' })
  })

  it('refuses a name another player already has', async () => {
    await request('', 'POST', { username: 'Will' })
    const response = await request('', 'POST', { username: 'wILL' }, 'bob')
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ ok: false, code: 'taken', message: "That name's taken" })
  })

  it('allows the first set and rate-limits a change within 24 hours', async () => {
    expect((await request('', 'POST', { username: 'First' })).status).toBe(200)
    const changed = await request('', 'POST', { username: 'Second' })
    expect(changed.status).toBe(429)
    expect(await changed.json()).toEqual({
      ok: false, code: 'rate_limited', message: 'You can change your username once a day',
    })
  })

  it('marks onboarding finished and is idempotent', async () => {
    expect((await request('/onboarded', 'POST')).status).toBe(400)
    await request('', 'POST', { username: 'Will' })
    const first = await request('/onboarded', 'POST')
    expect(first.status).toBe(200)
    const body = await first.json() as { profile: { onboardedAt: number } }
    expect(body.profile.onboardedAt).toBeGreaterThan(0)
    const second = await request('/onboarded', 'POST')
    expect(await second.json()).toMatchObject({ ok: true, profile: { onboardedAt: body.profile.onboardedAt } })
  })
})
