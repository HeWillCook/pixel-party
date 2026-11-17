import { describe, expect, it, vi } from 'vitest'
import { createSfx, MUTE_KEY } from './sfx'

function fakeAudio() {
  const parameter = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }
  const createOscillator = vi.fn(() => ({ type: '', frequency: parameter, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }))
  const context = { currentTime: 0, state: 'running', destination: {}, createOscillator, createGain: () => ({ gain: parameter, connect: vi.fn() }), resume: vi.fn() }
  return { context: context as unknown as AudioContext, createOscillator }
}

describe('sfx', () => {
  it('plays nothing before unlock', () => {
    const audio = fakeAudio()
    createSfx({ audioContext: () => audio.context }).play('guess')
    expect(audio.createOscillator).not.toHaveBeenCalled()
  })
  it('plays after unlock and not while muted', () => {
    const audio = fakeAudio()
    const sfx = createSfx({ audioContext: () => audio.context })
    sfx.unlock()
    sfx.play('guess')
    expect(audio.createOscillator).toHaveBeenCalledTimes(2)
    sfx.setMuted(true)
    sfx.play('win')
    expect(audio.createOscillator).toHaveBeenCalledTimes(2)
  })
  it('persists mute to storage under pixel-party:muted', () => {
    const storage = { getItem: vi.fn(() => '1'), setItem: vi.fn() }
    const sfx = createSfx({ storage })
    expect(sfx.isMuted()).toBe(true)
    sfx.setMuted(false)
    expect(storage.setItem).toHaveBeenCalledWith(MUTE_KEY, '0')
    sfx.setMuted(true)
    expect(storage.setItem).toHaveBeenCalledWith(MUTE_KEY, '1')
  })
  it('defaults to unmuted and still toggles when storage throws', () => {
    const storage = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    const sfx = createSfx({ storage })
    expect(sfx.isMuted()).toBe(false)
    sfx.setMuted(true)
    expect(sfx.isMuted()).toBe(true)
    sfx.setMuted(false)
    expect(sfx.isMuted()).toBe(false)
  })
})
