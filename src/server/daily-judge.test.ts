import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker.js'
import { encodeCells } from '../game/grid'
import { configuredJudgeMode, createDailyJudge, fakeDailyJudge, renderCellsPng } from './daily-judge'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fakeDailyJudge', () => {
  it('returns deterministic output for the same PNG and different output for a different PNG', async () => {
    const judge = fakeDailyJudge()
    const pngA = await renderCellsPng(encodeCells(new Uint8Array(1024)))
    const cellsB = new Uint8Array(1024)
    cellsB[0] = 4
    cellsB[100] = 10
    const pngB = await renderCellsPng(encodeCells(cellsB))

    const blindA1 = await judge.blind(pngA)
    const blindA2 = await judge.blind(pngA)
    const blindB = await judge.blind(pngB)

    expect(blindA1).not.toBeNull()
    expect(blindA1).toEqual(blindA2)
    expect(blindB).not.toBeNull()

    const scoreA1 = await judge.score(pngA, 'a lighthouse in a storm', 'lighthouse', blindA1!.guess)
    const scoreA2 = await judge.score(pngA, 'a lighthouse in a storm', 'lighthouse', blindA1!.guess)
    const scoreB = await judge.score(pngB, 'a lighthouse in a storm', 'lighthouse', blindB!.guess)

    expect(scoreA1).not.toBeNull()
    expect(scoreA1).toEqual(scoreA2)
    expect(scoreB).not.toBeNull()

    expect(scoreA1!.fit).toBeGreaterThanOrEqual(0)
    expect(scoreA1!.fit).toBeLessThanOrEqual(100)
    expect(scoreA1!.recognition).toBeGreaterThanOrEqual(0)
    expect(scoreA1!.recognition).toBeLessThanOrEqual(100)
    expect(scoreB!.fit).toBeGreaterThanOrEqual(0)
    expect(scoreB!.fit).toBeLessThanOrEqual(100)
    expect(scoreB!.recognition).toBeGreaterThanOrEqual(0)
    expect(scoreB!.recognition).toBeLessThanOrEqual(100)

    expect({ blind: blindA1, score: scoreA1 }).not.toEqual({ blind: blindB, score: scoreB })
  })
})

describe('createDailyJudge', () => {
  it('I4 shares the build-time fake mode with party judging by default', () => {
    expect(configuredJudgeMode()).toBe('fake')
  })
  it('never calls env integration or bindings in fake mode', async () => {
    const fetchBomb = vi.fn(() => { throw new Error('Must not call env in fake mode') })
    const env = {
      API_WORKER: { fetch: fetchBomb },
      RECORD_ROOMS: { idFromName: fetchBomb, get: fetchBomb },
      APP_OWNER_JWT: 'secret',
    } as unknown as Env

    const judge = createDailyJudge(env, 'fake')
    const blind = await judge.blind('fake-png-base64')
    expect(blind).not.toBeNull()
    const score = await judge.score('fake-png-base64', 'a cat sleeping in a teacup', 'cat', blind!.guess)
    expect(score).not.toBeNull()
    expect(fetchBomb).not.toHaveBeenCalled()
  })

  it('defaults to fake mode in vitest', async () => {
    const fetchBomb = vi.fn(() => { throw new Error('Must not call env when defaulting to fake') })
    const env = {
      API_WORKER: { fetch: fetchBomb },
      RECORD_ROOMS: { idFromName: fetchBomb, get: fetchBomb },
      APP_OWNER_JWT: 'secret',
    } as unknown as Env

    const judge = createDailyJudge(env)
    const blind = await judge.blind('default-mode-png')
    expect(blind).not.toBeNull()
    expect(fetchBomb).not.toHaveBeenCalled()
  })

  it('calls the local judge endpoint with { system, user, png } in local mode', async () => {
    const calls: Array<{ url: string; body: { system: string; user: string; png: string } }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = JSON.parse(String(init?.body)) as { system: string; user: string; png: string }
      calls.push({ url, body })
      if (calls.length === 1) {
        return Response.json({ text: '{"guess":"a candle"}' })
      }
      if (calls.length === 2) {
        return Response.json({ text: '{"fit":75,"recognition":40,"reason":"Good shape."}' })
      }
      return new Response('unavailable', { status: 503 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const judge = createDailyJudge({} as Env, 'local')
    expect(await judge.blind('png-1')).toEqual({ guess: 'a candle' })
    expect(await judge.score('png-1', 'a lighthouse in a storm', 'lighthouse', 'a candle')).toEqual({
      fit: 75,
      recognition: 40,
      reason: 'Good shape.',
    })
    expect(await judge.blind('png-1')).toBeNull()

    expect(calls[0].url).toBe('http://127.0.0.1:8789/judge')
    expect(calls[0].body.png).toBe('png-1')
    expect(calls[0].body.system.toLowerCase()).not.toContain('prompt')
    expect(calls[1].body.user).toContain('a lighthouse in a storm')
    expect(calls[1].body.user).toContain('lighthouse')
    expect(calls[1].body.user).toContain('a candle')
  })

  it('calls anthropic/chat-completion via createServerTools in real mode', async () => {
    const requests: Array<{ path: string; body: Record<string, unknown> }> = []
    const env = {
      APP_OWNER_JWT: 'owner-jwt',
      RECORD_ROOMS: { idFromName: () => 'app', get: () => ({}) },
      API_WORKER: {
        fetch: async (input: RequestInfo, init?: RequestInit) => {
          const request = new Request(input, init)
          const body = await request.json() as Record<string, unknown>
          requests.push({ path: new URL(request.url).pathname, body })
          if (requests.length === 1) {
            return Response.json({ success: true, data: { content: [{ type: 'text', text: '{"guess":"a lighthouse"}' }] } })
          }
          if (requests.length === 2) {
            return Response.json({ success: true, data: { content: [{ type: 'text', text: '{"fit":88,"recognition":100,"reason":"Spot on!"}' }] } })
          }
          return Response.json({ error: 'rate_limited' }, { status: 429 })
        },
      },
    } as unknown as Env

    const judge = createDailyJudge(env, 'real')
    expect(await judge.blind('png-real')).toEqual({ guess: 'a lighthouse' })
    expect(await judge.score('png-real', 'a lighthouse in a storm', 'lighthouse', 'a lighthouse')).toEqual({
      fit: 88,
      recognition: 100,
      reason: 'Spot on!',
    })
    expect(await judge.blind('png-real')).toBeNull()

    expect(requests[0].path).toBe('/api/integrations/anthropic/chat-completion')
    expect(requests[1].path).toBe('/api/integrations/anthropic/chat-completion')
  })
})

describe('renderCellsPng', () => {
  it('renders a 32x32 grid into a non-empty base64 PNG', async () => {
    const b64 = await renderCellsPng(encodeCells(new Uint8Array(1024)))
    expect(b64.length).toBeGreaterThan(0)
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })
})
