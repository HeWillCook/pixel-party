import { useEffect, useRef, useState } from 'react'
import type { ClientState } from '@/game/client-state'
import { countdownTickSecond, soundEventsFor } from '@/game/sound-events'
import { createSfx } from '@/lib/sfx'

export function useGameSounds(state: ClientState): { muted: boolean; toggleMute: () => void } {
  const [sfx] = useState(createSfx)
  const [muted, setMuted] = useState(() => sfx.isMuted())
  const previous = useRef(state)
  const current = useRef(state)
  current.current = state

  useEffect(() => {
    for (const sound of soundEventsFor(previous.current, state)) sfx.play(sound)
    previous.current = state
  }, [state, sfx])

  useEffect(() => {
    const unlock = () => {
      sfx.unlock()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [sfx])

  useEffect(() => {
    let lastRoundId: string | undefined
    let lastSecond: number | null = null
    const interval = window.setInterval(() => {
      const round = current.current.round
      if (round?.id !== lastRoundId) {
        lastRoundId = round?.id
        lastSecond = null
      }
      const second = countdownTickSecond(round, Date.now())
      if (second !== null && second !== lastSecond) sfx.play('tick')
      lastSecond = second
    }, 250)
    return () => window.clearInterval(interval)
  }, [sfx])

  return { muted, toggleMute: () => { const next = !sfx.isMuted(); sfx.setMuted(next); setMuted(next) } }
}
