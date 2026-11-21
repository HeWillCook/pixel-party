import { createSfx, MUTE_KEY, type Sfx } from '../lib/sfx'

let sfx: Sfx | null = null

/**
 * A soft whoosh for a camera move, through the same sound system as the game's sounds and silenced by the same mute
 * switch. Reduced motion stays silent too.
 *
 * Creating the first AudioContext of a browser can stall the main thread for ~100 ms. That must never land inside a
 * camera move (not at its start, not near its end), so it happens on the first real pointer press of the page: the
 * stall sits in the gap before the click reaches its handler, when nothing is moving. A move started without a press
 * (a script, a keyboard, a restored page) is silent.
 */
function shared(): Sfx {
  return (sfx ??= createSfx())
}

export function playWhoosh(): void {
  if (typeof window === 'undefined') return
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  let muted = false
  try { muted = window.localStorage.getItem(MUTE_KEY) === '1' } catch { /* storage blocked: unmuted */ }
  shared().setMuted(muted)
  if (muted) return
  shared().whoosh()
}

if (typeof window !== 'undefined') {
  const arm = () => {
    window.removeEventListener('pointerdown', arm, true)
    window.setTimeout(() => { void shared().unlock() }, 0)
  }
  window.addEventListener('pointerdown', arm, true)
}
