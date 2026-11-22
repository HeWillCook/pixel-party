import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { AppContext, Env } from '../../worker.js'
import { registerRealtimeRoutes } from './realtime-routes'
import { memoryTools } from './room-test-tools'

const { serverTools, verifyJwt } = vi.hoisted(() => ({ serverTools: vi.fn(), verifyJwt: vi.fn() }))
vi.mock('./server-tools', () => ({ createServerTools: serverTools }))
vi.mock('deepspace/worker', async importOriginal => ({ ...await importOriginal<typeof import('deepspace/worker')>(), verifyJwt }))

function harness(visibility = 'public', status = 'playing', members = ['host']) {
  const memory = memoryTools()
  memory.rows('rooms').set('record-id', { joinCode: 'custom-room', hostId: 'host', visibility, status, memberIds: members, mode: 'coop' })
  serverTools.mockReturnValue(memory.tools)
  verifyJwt.mockResolvedValue({ result: null })
  let forwarded: Request | undefined
  const namespace = {
    idFromName: vi.fn(value => value),
    get: () => ({ fetch: vi.fn(async request => { forwarded = request; return new Response('ok') }) }),
  }
  const app = new Hono<AppContext>()
  registerRealtimeRoutes(app)
  const request = (path = 'custom-room', options = {}) => {
    const [code, search] = path.split('?')
    return app.request(`/api/pixel/${code}/ws${search ? `?${search}` : ''}`, options, { PIXEL_ROOMS: namespace } as unknown as Env)
  }
  return { ...memory, namespace, request, forwarded: () => forwarded }
}

describe('PixelRoom route configuration', () => {
  it.each(['/ws/yjs/doc', '/ws/canvas/doc'])('does not expose the scaffold route %s', async path => {
    const app = new Hono<AppContext>()
    registerRealtimeRoutes(app)
    expect((await app.request(path)).status).toBe(404)
  })

  it.each(['%E2%9C%93', 'a'.repeat(65)])('rejects invalid room id %s before accessing its namespace', async roomId => {
    const namespace = { idFromName: vi.fn(), get: vi.fn() }
    const app = new Hono<AppContext>()
    registerRealtimeRoutes(app)
    const response = await app.request(`/api/pixel/${roomId}/ws`, {}, { PIXEL_ROOMS: namespace } as unknown as Env)
    expect(response.status).toBe(404)
    expect(namespace.idFromName).not.toHaveBeenCalled()
    expect(namespace.get).not.toHaveBeenCalled()
  })

  it('overwrites forged room configuration', async () => {
    const test = harness()
    await test.request('custom-room?userId=forged', {
      headers: { 'X-Room-Id': 'forged', 'X-Room-Mode': 'team', 'X-Room-Host': 'forged', 'X-Room-Spectate': 'true', 'X-User-Id': 'forged' },
    })
    expect(test.namespace.idFromName).toHaveBeenCalledWith('record-id')
    const forwarded = test.forwarded()!
    expect(forwarded.headers.get('X-Room-Id')).toBe('record-id')
    expect(forwarded.headers.get('X-Room-Mode')).toBe('coop')
    expect(forwarded.headers.get('X-Room-Host')).toBe('host')
    expect(forwarded.headers.get('X-User-Id')).toBeNull()
    expect(forwarded.headers.get('X-Room-Spectate')).toBe('false')
    expect(new URL(forwarded.url).searchParams.has('userId')).toBe(false)
  })

  it('treats "play" as an ordinary room code nobody hosts', async () => {
    // The old always-live public board is gone: its code is reserved by an old record, so it is simply not found.
    const test = harness()
    expect((await test.request('play')).status).toBe(404)
    expect(test.forwarded()).toBeUndefined()
  })

  it.each([['missing', 'public', 'playing', 404], ['custom-room', 'public', 'closed', 410], ['custom-room', 'private', 'playing', 401]])('denies %s / %s / %s with %s', async (code, visibility, status, expected) => {
    const test = harness(visibility, status)
    expect((await test.request(code)).status).toBe(expected)
    expect(test.namespace.idFromName).not.toHaveBeenCalled()
  })

  it.each([{ members: ['host'] }, { members: ['host', 'guest'] }])('joins private rooms using verified identity with members $members', async ({ members }) => {
    const test = harness('private', 'playing', members)
    verifyJwt.mockResolvedValue({ result: { userId: 'guest', claims: { name: 'Guest', email: 'guest@test' } } })
    expect((await test.request('custom-room?token=valid&userId=forged')).status).toBe(200)
    expect(test.rows('rooms').get('record-id')!.memberIds).toEqual(['host', 'guest'])
    expect(test.forwarded()!.headers.get('X-Room-Spectate')).toBe('false')
    expect(Buffer.from(test.forwarded()!.headers.get('X-User-Id')!, 'base64url').toString()).toBe('guest')
  })

  it('skips addRoomMember and forwards X-Room-Spectate when spectate=1 on a private room', async () => {
    const test = harness('private', 'playing', ['host'])
    verifyJwt.mockResolvedValue({ result: { userId: 'guest', claims: { name: 'Guest' } } })
    expect((await test.request('custom-room?spectate=1&token=valid')).status).toBe(200)
    expect(test.rows('rooms').get('record-id')!.memberIds).toEqual(['host'])
    expect(test.update).not.toHaveBeenCalled()
    expect(test.forwarded()!.headers.get('X-Room-Spectate')).toBe('true')
  })

  it('normalizes private lobby codes, preserves trusted lobby state and denies anonymous JWTs', async () => {
    const test = harness('private', 'lobby')
    test.rows('rooms').get('record-id')!.joinCode = 'AB2Z'
    verifyJwt.mockResolvedValue({ result: { userId: 'anon-viewer', claims: {} } })
    expect((await test.request('ab2z?token=anonymous')).status).toBe(401)
    expect(test.forwarded()).toBeUndefined()
    verifyJwt.mockResolvedValue({ result: { userId: 'host', claims: {} } })
    expect((await test.request('aB2z?token=valid')).status).toBe(200)
    expect(test.forwarded()!.headers.get('X-Room-Mode')).toBe('coop')
  })

  it('rejects an invalid JWT on a public room', async () => {
    const test = harness()
    expect((await test.request('custom-room?token=bad')).status).toBe(401)
  })

  it('fails closed if lookup or membership persistence is unavailable', async () => {
    const test = harness('private')
    test.query.mockResolvedValueOnce({ success: false, error: 'offline' } as never)
    expect((await test.request()).status).toBe(503)
    verifyJwt.mockResolvedValue({ result: { userId: 'guest', claims: {} } })
    test.update.mockResolvedValueOnce({ success: false, error: 'offline' } as never)
    expect((await test.request('custom-room?token=valid')).status).toBe(503)
    expect(test.forwarded()).toBeUndefined()
  })
})
