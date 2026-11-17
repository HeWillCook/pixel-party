import { useEffect, useRef, useState } from 'react'
import type { DailyClientState } from '../../game/daily/client-schedule'
import { createDailySoundGate } from '../../game/daily/sound-events'
import { createSfx } from '../../lib/sfx'

export function useDailySounds(state: DailyClientState) {
  const [sfx] = useState(createSfx)
  const [gate] = useState(createDailySoundGate)
  const [muted, setMuted] = useState(() => sfx.isMuted())
  const current = useRef(state)
  current.current = state

  useEffect(() => {
    for (const sound of gate(state, Date.now())) sfx.play(sound)
  }, [state, gate, sfx])

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
    const interval = window.setInterval(() => {
      for (const sound of gate(current.current, Date.now())) sfx.play(sound)
    }, 250)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [gate, sfx])

  return {
    muted,
    toggleMute: () => {
      const next = !sfx.isMuted()
      sfx.setMuted(next)
      setMuted(next)
    },
  }
}
