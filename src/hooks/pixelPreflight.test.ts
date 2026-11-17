import { afterEach, describe, expect, it, vi } from 'vitest'
import { pixelPreflight } from './pixelPreflight'

afterEach(() => vi.unstubAllGlobals())

describe('pixel preflight', () => {
  it('retries an invalid token anonymously and reports session expiry', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ status: 401 }).mockResolvedValueOnce({ status: 426 })
    vi.stubGlobal('fetch', fetchMock)
    expect(await pixelPreflight('https://example.test/api/pixel/play/ws?token=invalid', true, new AbortController().signal)).toEqual({ error: null, expired: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.test/api/pixel/play/ws')
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('keeps a private room gated after the anonymous retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 401 })
    vi.stubGlobal('fetch', fetchMock)
    expect(await pixelPreflight('https://example.test/api/pixel/private/ws?token=invalid', true, new AbortController().signal)).toEqual({ error: 'unauthorized', expired: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a signed-out 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 401 })
    vi.stubGlobal('fetch', fetchMock)
    expect(await pixelPreflight('https://example.test/api/pixel/private/ws', false, new AbortController().signal)).toEqual({ error: 'unauthorized', expired: false })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
