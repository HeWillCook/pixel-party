import { describe, expect, it } from 'vitest'
import { summarizePorch, type PorchPeer } from './presenceSummary'

const peer = (userId: string, userName: string, state: Record<string, unknown> = {}): PorchPeer => ({ userId, userName, state })

describe('summarizePorch', () => {
  it('counts you in the total but never lists you', () => {
    const summary = summarizePorch([peer('u1', 'Ada'), peer('u2', 'Bo')], false)
    expect(summary.total).toBe(3)
    expect(summary.headline).toBe('3 on the porch')
    expect(summary.names).toEqual(['Ada', 'Bo'])
  })

  it('is just you on an empty porch, with nothing else to say', () => {
    const summary = summarizePorch([], false)
    expect(summary.total).toBe(1)
    expect(summary.headline).toBe('Just you on the porch')
    expect(summary.detail).toBe('')
    expect(summary.names).toEqual([])
  })

  it('counts painters among the others and your own attempt', () => {
    const others = [peer('u1', 'Ada', { painting: true }), peer('u2', 'Bo', { painting: false }), peer('u3', 'Cy')]
    expect(summarizePorch(others, false).detail).toBe('1 painting now')
    expect(summarizePorch(others, true).detail).toBe('2 painting now')
    expect(summarizePorch(others, true).painting).toBe(2)
    expect(summarizePorch([peer('u1', 'Ada')], false).detail).toBe('')
  })

  it('lists up to five names and says how many more', () => {
    const crowd = Array.from({ length: 8 }, (_, index) => peer(`u${index}`, `Painter ${index}`))
    const summary = summarizePorch(crowd, false)
    expect(summary.total).toBe(9)
    expect(summary.names).toHaveLength(5)
    expect(summary.more).toBe(3)
  })

  it('names signed-out visitors kindly and falls back to the published name', () => {
    const summary = summarizePorch([peer('anon-1', 'Anonymous'), peer('u1', '', { name: 'Dee' }), peer('u2', '   ')], false)
    expect(summary.names).toEqual(['A visitor', 'Dee', 'A neighbour'])
  })

  it('prefers the published username over the sign-in roster name', () => {
    const summary = summarizePorch([peer('u1', 'Will Cook', { name: 'PixelWill' })], false)
    expect(summary.names).toEqual(['PixelWill'])
  })

  it('shortens a very long name', () => {
    expect(summarizePorch([peer('u1', 'A'.repeat(60))], false).names[0]).toHaveLength(22)
  })
})
