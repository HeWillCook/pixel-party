import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const whoosh = vi.fn()
vi.mock('../lib/sfx', () => ({
  MUTE_KEY: 'mute',
  createSfx: () => ({ whoosh, setMuted: vi.fn(), unlock: async () => true, play: vi.fn(), isMuted: () => false }),
}))

describe('playWhoosh', () => {
  beforeEach(() => {
    whoosh.mockClear()
    vi.useFakeTimers()
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      localStorage: { getItem: () => null },
      addEventListener() {},
      removeEventListener() {},
      setTimeout: (callback: () => void) => callback(),
    })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('plays one whoosh for the several calls one click makes, and another for the next move', async () => {
    vi.resetModules()
    const { playWhoosh } = await import('./whoosh')
    vi.setSystemTime(10_000); vi.advanceTimersByTime(0)
    // nav click, the scene's own handler and the floor pan all ask in the same frame
    playWhoosh(); playWhoosh(); playWhoosh()
    expect(whoosh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(700)
    playWhoosh()
    expect(whoosh).toHaveBeenCalledTimes(2)
  })
})
