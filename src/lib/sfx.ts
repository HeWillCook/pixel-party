import type { SoundName } from '@/game/sound-events'

export const MUTE_KEY = 'pixel-party:muted'
export interface Sfx { play(name: SoundName): void; whoosh(): void; unlock(): Promise<boolean>; isMuted(): boolean; setMuted(m: boolean): void }

const tones: Record<SoundName, { notes: number[]; duration: number; wave: OscillatorType }> = {
  guess: { notes: [523.25, 659.25], duration: 0.09, wave: 'square' },
  tick: { notes: [1046.5], duration: 0.06, wave: 'triangle' },
  win: { notes: [523.25, 659.25, 783.99, 1046.5], duration: 0.2, wave: 'square' },
  timeout: { notes: [392, 261.63], duration: 0.22, wave: 'triangle' },
}

export function createSfx(opts: { audioContext?: () => AudioContext; storage?: Pick<Storage, 'getItem' | 'setItem'> } = {}): Sfx {
  let storage: Pick<Storage, 'getItem' | 'setItem'> | undefined
  let muted = false
  try {
    storage = opts.storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
    muted = storage?.getItem(MUTE_KEY) === '1'
  } catch { }
  let context: AudioContext | undefined
  let master: GainNode | undefined
  return {
    async unlock() {
      try {
        context ??= opts.audioContext ? opts.audioContext() : new AudioContext()
        if (!master) {
          master = context.createGain()
          master.gain.value = 0.12
          master.connect(context.destination)
        }
        if (context.state === 'suspended') await context.resume()
        return context.state === 'running'
      } catch { return false }
    },
    play(name) {
      if (!context || !master || muted || context.state !== 'running') return
      const tone = tones[name]
      tone.notes.forEach((frequency, index) => {
        const start = context!.currentTime + index * tone.duration
        const oscillator = context!.createOscillator()
        const gain = context!.createGain()
        oscillator.type = tone.wave
        oscillator.frequency.setValueAtTime(frequency, start)
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.linearRampToValueAtTime(0.1, start + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration)
        oscillator.connect(gain)
        gain.connect(master!)
        oscillator.start(start)
        oscillator.stop(start + tone.duration)
      })
    },
    /** A soft airy sweep for a camera move: a low triangle gliding up and fading, quieter than any game sound. */
    whoosh() {
      if (!context || !master || muted || context.state !== 'running') return
      const start = context.currentTime
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(140, start)
      oscillator.frequency.exponentialRampToValueAtTime(460, start + 0.5)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(0.05, start + 0.18)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55)
      oscillator.connect(gain)
      gain.connect(master)
      oscillator.start(start)
      oscillator.stop(start + 0.55)
    },
    isMuted: () => muted,
    setMuted(value) {
      muted = value
      try { storage?.setItem(MUTE_KEY, value ? '1' : '0') } catch { }
    },
  }
}
