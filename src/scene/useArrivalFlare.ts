import { useCallback, useEffect, useRef, useState } from 'react'

/** How long the arrival flare lasts, and how many pulses it makes. */
const FLARE_MS = 700

/**
 * The thrusters of the object the camera has just settled on flare up and die back, briefly. `arrived` flips true when
 * the camera lands; `running` then holds the scene's clock on for the flare's length (the close-up scenes are otherwise
 * painted once and still), and `boost()` is the flare's strength now (0..1), pulsed, for the art to read each frame.
 * Reduced motion never flares.
 */
export function useArrivalFlare(arrived: boolean): { running: boolean; boost: () => number } {
  const [running, setRunning] = useState(false)
  const startedAt = useRef(0)
  useEffect(() => {
    if (!arrived || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    startedAt.current = performance.now()
    setRunning(true)
    const timer = setTimeout(() => setRunning(false), FLARE_MS)
    return () => clearTimeout(timer)
  }, [arrived])
  const boost = useCallback(() => {
    const t = (performance.now() - startedAt.current) / FLARE_MS
    if (t < 0 || t >= 1) return 0
    // Rises fast, then pulses twice while it fades.
    return (1 - t) * (0.55 + 0.45 * Math.cos(t * Math.PI * 4))
  }, [])
  return { running, boost }
}
