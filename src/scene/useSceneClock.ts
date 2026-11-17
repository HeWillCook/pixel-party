import { useEffect, useState } from 'react'

export function useSceneClock(fps = 12): number {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let request = 0
    let previous: number | null = null

    const tick = (time: number) => {
      if (previous === null) previous = time
      if (time - previous >= 1000 / fps) {
        previous = time
        setFrame((current) => current + 1)
      }
      request = window.requestAnimationFrame(tick)
    }
    const sync = () => {
      window.cancelAnimationFrame(request)
      previous = null
      if (motion.matches) setFrame(0)
      else if (!document.hidden) request = window.requestAnimationFrame(tick)
    }
    motion.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      window.cancelAnimationFrame(request)
      motion.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [fps])

  return frame
}
