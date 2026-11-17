import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker.js'
import { reserveBudget } from './budget'

function stubEnv(fetchImpl: () => Promise<Response>): Env {
  return {
    BUDGET_ROOMS: {
      idFromName: vi.fn((name: string) => name),
      get: vi.fn(() => ({ fetch: fetchImpl })),
    },
  } as unknown as Env
}

describe('reserveBudget', () => {
  it('returns true when BudgetRoom returns { ok: true }', async () => {
    let seenRequest: Request | undefined
    const env = {
      BUDGET_ROOMS: {
        idFromName: vi.fn((name: string) => {
          expect(name).toBe('global')
          return 'global-id'
        }),
        get: vi.fn(() => ({
          fetch: async (request: Request) => {
            seenRequest = request
            return Response.json({ ok: true })
          },
        })),
      },
    } as unknown as Env

    await expect(reserveBudget(env)).resolves.toBe(true)
    expect(seenRequest?.method).toBe('POST')
    expect(new URL(seenRequest!.url).pathname).toBe('/reserve')
  })

  it('returns false when BudgetRoom returns { ok: false }', async () => {
    const env = stubEnv(async () => Response.json({ ok: false }))
    await expect(reserveBudget(env)).resolves.toBe(false)
  })

  it('returns false on a non-2xx response', async () => {
    const env = stubEnv(async () => new Response('Internal error', { status: 500 }))
    await expect(reserveBudget(env)).resolves.toBe(false)
  })

  it('returns false when fetch throws', async () => {
    const env = stubEnv(async () => {
      throw new Error('DO unreachable')
    })
    await expect(reserveBudget(env)).resolves.toBe(false)
  })
})
