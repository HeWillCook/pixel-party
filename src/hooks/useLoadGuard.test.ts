import { describe, expect, it } from 'vitest'
import { retryLimit } from './useLoadGuard'

describe('retryLimit', () => {
  it('never comes back to a limit already used, so a retry always starts a fresh subscription (the SDK keeps old snapshots)', () => {
    const seen = new Set<number>()
    for (let attempt = 0; attempt <= 400; attempt++) {
      const limit = retryLimit(attempt)
      expect(seen.has(limit), `attempt ${attempt}`).toBe(false)
      seen.add(limit)
    }
    expect(retryLimit(0)).toBe(1000)
  })
})
