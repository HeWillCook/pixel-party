import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientState } from '@/game/client-state'
import { createCountdownGate, soundEventsFor, type SoundName } from '@/game/sound-events'
import { createSfx } from '@/lib/sfx'
import { useMute } from '@/hooks/useMute'

export function useGameSounds(state: ClientState): { muted: boolean; toggleMute: () => void } {
  const [sfx] = useState(createSfx)
  const [shouldTick] = useState(createCountdownGate)
  const { muted, toggle } = useMute()
  useEffect(() => { sfx.setMuted(muted) }, [sfx, muted])
  const previous = useRef(state)
  const current = useRef(state)
  current.current = state
  // See useDailySounds: the AudioContext is created by the first sound, not by the gesture.
  const interacted = useRef(false)

  const playSound = useCallback((sound: SoundName) => {
    if (!interacted.current || sfx.isMuted()) return
    void sfx.unlock().then(ok => { if (ok) sfx.play(sound) })
  }, [sfx])

  useEffect(() => {
    if (shouldTick(state, Date.now())) playSound('tick')
    for (const sound of soundEventsFor(previous.current, state)) playSound(sound)
    previous.current = state
  }, [state, playSound, shouldTick])

  useEffect(() => {
    const markInteracted = () => {
      interacted.current = true
      window.removeEventListener('pointerdown', markInteracted)
      window.removeEventListener('keydown', markInteracted)
    }
    window.addEventListener('pointerdown', markInteracted)
    window.addEventListener('keydown', markInteracted)
    return () => {
      window.removeEventListener('pointerdown', markInteracted)
      window.removeEventListener('keydown', markInteracted)
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (shouldTick(current.current, Date.now())) playSound('tick')
    }, 250)
    return () => window.clearInterval(interval)
  }, [playSound, shouldTick])

  return { muted, toggleMute: toggle }
}
