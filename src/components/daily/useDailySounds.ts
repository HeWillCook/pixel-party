import { useCallback, useEffect, useRef, useState } from 'react'
import type { DailyClientState } from '../../game/daily/client-schedule'
import type { SoundName } from '../../game/sound-events'
import { createDailySoundGate } from '../../game/daily/sound-events'
import { createSfx } from '../../lib/sfx'
import { useMute } from '../../hooks/useMute'

export function useDailySounds(state: DailyClientState) {
  const [sfx] = useState(createSfx)
  const [gate] = useState(createDailySoundGate)
  const { muted, toggle } = useMute()
  useEffect(() => { sfx.setMuted(muted) }, [sfx, muted])
  const current = useRef(state)
  current.current = state
  // A gesture only marks the page as interactive. Creating/resuming an AudioContext can block
  // the main thread for ~100 ms, so it happens on the first sound that actually plays rather
  // than on the click that starts a camera move.
  const interacted = useRef(false)

  const playSound = useCallback((sound: SoundName) => {
    if (!interacted.current || sfx.isMuted()) return
    void sfx.unlock().then(ok => { if (ok) sfx.play(sound) })
  }, [sfx])

  useEffect(() => {
    for (const sound of gate(state, Date.now())) playSound(sound)
  }, [state, gate, playSound])

  useEffect(() => {
    const markInteracted = () => {
      interacted.current = true
      window.removeEventListener('pointerdown', markInteracted)
      window.removeEventListener('keydown', markInteracted)
    }
    window.addEventListener('pointerdown', markInteracted)
    window.addEventListener('keydown', markInteracted)
    const interval = window.setInterval(() => {
      for (const sound of gate(current.current, Date.now())) playSound(sound)
    }, 250)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('pointerdown', markInteracted)
      window.removeEventListener('keydown', markInteracted)
    }
  }, [gate, playSound])

  return {
    muted,
    toggleMute: toggle,
  }
}
