import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppContext, Env } from '../../worker.js'
import { integrations } from '../integrations.js'
import { registerAuthAndIntegrationRoutes } from './http-routes.js'

vi.mock('deepspace/worker', async (importOriginal) => ({
  ...await importOriginal<typeof import('deepspace/worker')>(),
  verifyJwt: vi.fn(async () => ({ result: { userId: 'verified-user' } })),
}))

describe('client integration proxy', () => {
  const app = new Hono<AppContext>()
  registerAuthAndIntegrationRoutes(app)
  afterEach(() => { delete integrations.testprovider })

  it.each([undefined, { billing: 'developer' as const }, { billing: 'developer' as const, client: false }])(
    'denies a missing or non-client config: %j', async (config) => {
      if (config) integrations.testprovider = config
      const fetch = vi.fn()
      const env = { API_WORKER: { fetch } } as unknown as Env
      for (const headers of [new Headers(), new Headers({ Authorization: 'Bearer test-caller' })]) {
        const response = await app.request('/api/integrations/testprovider/chat', { method: 'POST', headers }, env)
        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({ error: 'Integration not available to clients' })
      }
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('forwards only after explicit client opt-in, retaining developer billing', async () => {
    integrations.testprovider = { billing: 'developer', client: true }
    let received: Request | undefined
    const fetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      received = new Request(input, init)
      return Response.json({ success: true, data: 'ok' })
    })
    const env = { API_WORKER: { fetch }, APP_OWNER_JWT: 'test-owner' } as unknown as Env
    const response = await app.request('/api/integrations/testprovider/chat', {
      method: 'POST', headers: { Authorization: 'Bearer test-caller' }, body: '{}',
    }, env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: 'ok' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(received!.headers.get('Authorization')).toBe('Bearer test-owner')
    expect(new URL(received!.url).pathname).toBe('/api/integrations/testprovider/chat')
  })

  it('still requires sign-in for an opted-in integration by default', async () => {
    integrations.testprovider = { billing: 'developer', client: true }
    const fetch = vi.fn()
    const response = await app.request('/api/integrations/testprovider/chat', { method: 'POST' }, {
      API_WORKER: { fetch },
    } as unknown as Env)
    expect(response.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('has no shipped client-enabled integrations', () => {
    expect(Object.values(integrations).some((config) => config.client === true)).toBe(false)
  })
})
