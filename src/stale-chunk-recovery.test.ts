import { describe, expect, it, vi } from 'vitest'
import { isChunkLoadError, reloadForStaleChunk } from './stale-chunk-recovery'

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return { getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => { data[key] = value } }
}
const failure = (module: string) => new TypeError(`error loading dynamically imported module: ${module}`)

describe('stale route chunks', () => {
  it('recognises the dev and production dynamic-import failures', () => {
    expect(isChunkLoadError(failure('http://localhost:5525/src/pages/(app)/scores.tsx'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/home-abc.js'))).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('x is not a function'))).toBe(false)
  })

  it('reloads once per failing module, never in a loop', () => {
    const reload = vi.fn()
    const storage = fakeStorage()
    const scores = failure('http://localhost:5525/src/pages/(app)/scores.tsx')
    expect(reloadForStaleChunk(scores, { storage, reload })).toBe(true)
    expect(reloadForStaleChunk(scores, { storage, reload })).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('keeps remembering the module after other routes load, and ignores cache-busting queries', () => {
    const reload = vi.fn()
    const storage = fakeStorage()
    expect(reloadForStaleChunk(failure('http://localhost:5525/src/pages/(app)/party.tsx?t=1'), { storage, reload })).toBe(true)
    // A different module that is also stale gets its own single reload.
    expect(reloadForStaleChunk(failure('http://localhost:5525/src/pages/(app)/scores.tsx'), { storage, reload })).toBe(true)
    // The party chunk still fails on the next click, in the same tab session: the card, not another reload.
    expect(reloadForStaleChunk(failure('http://localhost:5525/src/pages/(app)/party.tsx?t=2'), { storage, reload })).toBe(false)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('fails closed without storage and ignores errors that are not chunk failures', () => {
    const reload = vi.fn()
    expect(reloadForStaleChunk(failure('x'), { storage: null, reload })).toBe(false)
    expect(reloadForStaleChunk(new Error('boom'), { storage: fakeStorage(), reload })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
