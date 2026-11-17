import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppContext, Env } from '../../worker.js'
import { integrations } from '../integrations.js'
import { registerAuthAndIntegrationRoutes, registerStaticRoutes } from './http-routes.js'

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


describe('room navigation HTML', () => {
  it('bypasses navigation fallbacks and serves only the empty shell for room links', async () => {
    const app = new Hono<AppContext>()
    registerStaticRoutes(app)
    const fetch = vi.fn(async (request: Request) => new Response(new URL(request.url).pathname === '/_spa'
      ? '<div id="root"></div>' : '<div id="root" data-prerendered="/"><canvas></canvas></div>'))
    const response = await app.request('/r/AB2Z', undefined, { ASSETS: { fetch } } as unknown as Env)
    expect(await response.text()).toBe('<div id="root"></div>')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(new URL(fetch.mock.calls[0][0].url).pathname).toBe('/_spa')
  })

  it.each([true, false])('fails closed for prerendered fallback HTML (missing shell: %s)', async missing => {
    const app = new Hono<AppContext>()
    registerStaticRoutes(app)
    const fetch = async (request: Request) => missing && new URL(request.url).pathname === '/_spa'
      ? new Response(null, { status: 404 })
      : new Response('<div id="root" data-prerendered="/"><canvas></canvas></div>')
    const response = await app.request('/r/AB2Z', undefined, { ASSETS: { fetch } } as unknown as Env)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('<canvas')
  })

  it('keeps local dev working with an empty index and no built shell', async () => {
    const app = new Hono<AppContext>()
    registerStaticRoutes(app)
    const fetch = async (request: Request) => new URL(request.url).pathname === '/_spa'
      ? new Response(null, { status: 404 }) : new Response('<div id="root"></div>')
    const response = await app.request('/r/AB2Z', undefined, { ASSETS: { fetch } } as unknown as Env)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<div id="root"></div>')
  })
})
