import { describe, expect, it, vi } from 'vitest'
import worker from '../../worker.js'
import type { Env } from '../../worker.js'

vi.mock('deepspace/worker', async (importOriginal) => ({
  ...await importOriginal<typeof import('deepspace/worker')>(),
  armCronRoom: vi.fn(),
}))

describe('disabled scaffold AI surfaces', () => {
  const routes = [
    ['POST', '/api/ai/chat'],
    ['POST', '/api/ai/chats'],
    ['PATCH', '/api/ai/chats/chat-id'],
    ['DELETE', '/api/ai/chats/chat-id'],
    ...['/_deepspace/agent', '/_deepspace/agent/browser'].flatMap((base) => [
      ['GET', `${base}/tools`],
      ['GET', `${base}/tools.md`],
      ['POST', `${base}/tools/queryRecords`],
      ['POST', `${base}/mcp`],
    ]),
  ]

  it.each(routes)('%s %s is unmounted for any caller', async (method, path) => {
    const fetch = vi.fn()
    const env = { API_WORKER: { fetch }, PLATFORM_WORKER: { fetch }, ASSETS: { fetch } } as unknown as Env
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext
    for (const headers of [new Headers(), new Headers({ Authorization: 'Bearer test-caller' })]) {
      const response = await worker.request(path, { method, headers }, env, ctx)
      expect(response.status).toBe(404)
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})
