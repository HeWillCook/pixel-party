import { useEffect, useRef, useState } from 'react'
import type { ClientState } from '@/game/client-state'
import { createCountdownGate, soundEventsFor } from '@/game/sound-events'
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

  useEffect(() => {
    if (shouldTick(state, Date.now())) sfx.play('tick')
    for (const sound of soundEventsFor(previous.current, state)) sfx.play(sound)
    previous.current = state
  }, [state, sfx, shouldTick])

  useEffect(() => {
    let active = true
    const unlock = () => {
      void sfx.unlock().then(success => {
        if (!active || !success) return
        window.removeEventListener('pointerdown', unlock)
        window.removeEventListener('keydown', unlock)
      })
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      active = false
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [sfx])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (shouldTick(current.current, Date.now())) sfx.play('tick')
    }, 250)
    return () => window.clearInterval(interval)
  }, [sfx, shouldTick])

  return { muted, toggleMute: toggle }
}
