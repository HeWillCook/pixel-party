import { describe, expect, it } from 'vitest'
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
