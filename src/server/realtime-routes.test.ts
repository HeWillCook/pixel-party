import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { AppContext, Env } from '../../worker.js'
import { registerRealtimeRoutes } from './realtime-routes'

describe('PixelRoom route configuration', () => {
  it.each(['%E2%9C%93', 'a'.repeat(65)])('rejects invalid room id %s before accessing its namespace', async roomId => {
    const namespace = { idFromName: vi.fn(), get: vi.fn() }
    const app = new Hono<AppContext>()
    registerRealtimeRoutes(app)
    const response = await app.request(`/api/pixel/${roomId}/ws`, {}, { PIXEL_ROOMS: namespace } as unknown as Env)
    expect(response.status).toBe(404)
    expect(namespace.idFromName).not.toHaveBeenCalled()
    expect(namespace.get).not.toHaveBeenCalled()
  })

  it.each(['play', 'custom-room'])('overwrites forged room configuration for %s', async roomId => {
    let forwarded: Request | undefined
    const namespace = {
      idFromName: vi.fn(value => value),
      get: () => ({ fetch: vi.fn(async request => { forwarded = request; return new Response('ok') }) }),
    }
    const app = new Hono<AppContext>()
    registerRealtimeRoutes(app)
    await app.request(`/api/pixel/${roomId}/ws?userId=forged`, {
      headers: { 'X-Room-Id': 'forged', 'X-Room-Mode': 'team', 'X-Room-Default': 'forged', 'X-User-Id': 'forged' },
    }, { PIXEL_ROOMS: namespace } as unknown as Env)
    expect(namespace.idFromName).toHaveBeenCalledWith(roomId)
    expect(forwarded!.headers.get('X-Room-Id')).toBe(roomId)
    expect(forwarded!.headers.get('X-Room-Mode')).toBe('coop')
    expect(forwarded!.headers.get('X-Room-Default')).toBe(String(roomId === 'play'))
    expect(forwarded!.headers.get('X-User-Id')).toBeNull()
    expect(new URL(forwarded!.url).searchParams.has('userId')).toBe(false)
  })
})
