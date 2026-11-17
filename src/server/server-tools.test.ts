import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker.js'
import { createServerTools } from './server-tools.js'

describe('server tools integration boundary', () => {
  it('refuses paths that could send the owner credential outside integrations', async () => {
    const env = {
      RECORD_ROOMS: { idFromName: () => 'app-room', get: () => ({}) },
      API_WORKER: { fetch: () => { throw new Error('Must not reach API worker') } },
    } as unknown as Env

    for (const endpoint of ['../billing', 'anthropic/chat-completion/extra', 'https://example.com']) {
      expect(await createServerTools(env).integration(endpoint, {})).toMatchObject({
        success: false,
        code: 'invalid_integration_endpoint',
      })
    }
  })

  it('uses the owner credential for developer billing and preserves the success envelope', async () => {
    let received: Request | undefined
    const env = {
      APP_OWNER_JWT: 'test-owner-credential',
      RECORD_ROOMS: { idFromName: () => 'app-room', get: () => ({}) },
      API_WORKER: {
        fetch: async (input: RequestInfo, init?: RequestInit) => {
          received = new Request(input, init)
          return Response.json({ success: true, data: { content: [{ type: 'text', text: 'ok' }] } })
        },
      },
    } as unknown as Env

    const result = await createServerTools(env).integration('anthropic/chat-completion', { messages: [] })
    expect(new URL(received!.url).pathname).toBe('/api/integrations/anthropic/chat-completion')
    expect(received!.headers.get('Authorization')).toBe('Bearer test-owner-credential')
    expect(result).toEqual({ success: true, data: { content: [{ type: 'text', text: 'ok' }] } })
  })

  it('keeps API refusal codes, status and details available to callers', async () => {
    const env = {
      APP_OWNER_JWT: 'test-owner-credential',
      RECORD_ROOMS: { idFromName: () => 'app-room', get: () => ({}) },
      API_WORKER: {
        fetch: async () => Response.json({
          error: 'insufficient_credits', message: 'Insufficient credits.', availableCredits: 0,
        }, { status: 402 }),
      },
    } as unknown as Env

    expect(await createServerTools(env).integration('anthropic/chat-completion', {})).toEqual({
      success: false, error: 'Insufficient credits.', code: 'insufficient_credits', status: 402,
      details: { availableCredits: 0 },
    })
  })
})


describe('server tools upstream failures', () => {
  function toolsWithFetch(fetch: () => Promise<Response>, ownerJwt?: string) {
    return createServerTools({
      APP_OWNER_JWT: ownerJwt,
      OWNER_USER_ID: 'owner',
      DEEPSPACE_APP_ID: 'test-app',
      RECORD_ROOMS: { idFromName: () => 'app-room', get: () => ({ fetch }) },
      API_WORKER: { fetch },
    } as unknown as Env)
  }

  it('refuses integration calls without an owner credential before fetching', async () => {
    const fetch = vi.fn()
    expect(await toolsWithFetch(fetch).integration('anthropic/chat-completion', {})).toMatchObject({
      success: false, code: 'owner_credential_missing',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  for (const operation of ['records', 'integration'] as const) {
    const call = (tools: ReturnType<typeof createServerTools>) => operation === 'records'
      ? tools.get('rooms', 'room')
      : tools.integration('anthropic/chat-completion', {})

    it(`${operation}: returns an ActionResult for a rejected fetch`, async () => {
      const tools = toolsWithFetch(async () => { throw new Error('Connection unavailable') }, 'test-owner')
      expect(await call(tools)).toMatchObject({
        success: false, code: 'upstream_unavailable', error: 'Connection unavailable',
      })
    })

    it(`${operation}: normalizes a non-JSON error response`, async () => {
      const tools = toolsWithFetch(async () => new Response('<html>Bad gateway</html>', { status: 502 }), 'test-owner')
      expect(await call(tools)).toMatchObject({ success: false, status: 502 })
    })

    it(`${operation}: rejects a non-JSON success response`, async () => {
      const tools = toolsWithFetch(async () => new Response('invalid JSON'), 'test-owner')
      expect(await call(tools)).toMatchObject({ success: false, code: 'upstream_unavailable' })
    })

    it(`${operation}: handles a null payload`, async () => {
      const tools = toolsWithFetch(async () => Response.json(null), 'test-owner')
      expect(await call(tools)).toMatchObject({ success: false, code: 'upstream_unavailable' })
    })
  }

  it('preserves the record success envelope and app-owned request headers', async () => {
    let received: Request | undefined
    const tools = createServerTools({
      OWNER_USER_ID: 'owner',
      RECORD_ROOMS: { idFromName: () => 'app-room', get: () => ({
        fetch: async (request: Request) => {
          received = request
          return Response.json({ success: true, data: { id: 'room' } })
        },
      }) },
    } as unknown as Env)
    expect(await tools.get('rooms', 'room')).toEqual({ success: true, data: { id: 'room' } })
    expect(received!.headers.get('X-User-Id')).toBe('owner')
    expect(received!.headers.get('X-App-Action')).toBe('true')
    expect(await received!.json()).toEqual({ tool: 'records.get', params: { collection: 'rooms', recordId: 'room' } })
  })
})
