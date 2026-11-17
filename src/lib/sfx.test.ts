import { describe, expect, it, vi } from 'vitest'
import { createSfx, MUTE_KEY } from './sfx'

function fakeAudio() {
  const parameter = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }
  const createOscillator = vi.fn(() => ({ type: '', frequency: parameter, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }))
  const context = { currentTime: 0, state: 'running', destination: {}, createOscillator, createGain: () => ({ gain: parameter, connect: vi.fn() }), resume: vi.fn() }
  return { context: context as unknown as AudioContext, createOscillator }
}

describe('sfx', () => {
  it('retries a blocked unlock and shares one master gain across notes', async () => {
    const noteNodes: { connect: ReturnType<typeof vi.fn> }[] = []
    const master = { gain: { value: 0 }, connect: vi.fn() }
    const audio = fakeAudio()
    let running = false
    Object.defineProperty(audio.context, 'state', { get: () => running ? 'running' : 'suspended' })
    audio.context.resume = vi.fn(async () => { if ((audio.context.resume as ReturnType<typeof vi.fn>).mock.calls.length > 1) running = true })
    audio.context.createGain = vi.fn(() => {
      if (!(audio.context.createGain as ReturnType<typeof vi.fn>).mock.calls.length || (audio.context.createGain as ReturnType<typeof vi.fn>).mock.calls.length === 1) return master as unknown as GainNode
      const node = { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }
      noteNodes.push(node)
      return node as unknown as GainNode
    })
    const sfx = createSfx({ audioContext: () => audio.context })
    expect(await sfx.unlock()).toBe(false)
    expect(await sfx.unlock()).toBe(true)
    sfx.play('guess')
    expect(master.gain.value).toBe(0.12)
    expect(master.connect).toHaveBeenCalledWith(audio.context.destination)
    expect(noteNodes).toHaveLength(2)
    expect(noteNodes.every(node => node.connect.mock.calls[0][0] === master)).toBe(true)
  })
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
