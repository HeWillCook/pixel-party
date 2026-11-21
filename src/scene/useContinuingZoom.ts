import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Camera } from './camera'
import { handoffProgress, lerpCamera, setRunningZoom, type ZoomHandoff } from './zoom'

/**
 * Continues a zoom that was already running when the route changed (see `ZoomHandoff`).
 *
 * Returns the camera for the current frame while the hand-off is still in flight, then `null`
 * so the caller falls back to its own settled camera. The value is derived during render from the
 * live clock and the caller's current `from`/`to`, so a page that measures its viewport in a layout
 * effect never paints a frame with a stale camera.
 */
export function useContinuingZoom(
  handoff: ZoomHandoff | null,
  from: Camera,
  to: Camera,
): Camera | null {
  const [, bump] = useState(0)
  const finished = useRef(false)
  const fromRef = useRef(from)
  const toRef = useRef(to)
  fromRef.current = from
  toRef.current = to

  // A page that mounts heavy (a board, a wall) spends its first render before the browser paints: take the camera again just before
  // that first paint, so the frame shows where the zoom is then, not where it was when the render began.
  useLayoutEffect(() => { if (handoff) bump(value => value + 1) }, [handoff])

  useEffect(() => {
    if (!handoff) return
    setRunningZoom({ handoff, from: fromRef.current, to: toRef.current })
    let raf = 0
    const tick = () => {
      // Commit this frame's camera synchronously: a coalesced React update would leave the
      // previous transform on screen for a frame, which reads as a small jump mid-zoom.
      if (handoffProgress(handoff) >= 1) {
        finished.current = true
        flushSync(() => bump(value => value + 1))
        return
      }
      flushSync(() => bump(value => value + 1))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // The running zoom is left to run out, not cleared: a floor pan that takes over from this page keeps the zoom going in its
    // copy of the scene, and this page unmounts (the route swaps to the pan's target) before that zoom has finished.
    return () => cancelAnimationFrame(raf)
  }, [handoff])

  if (!handoff || finished.current) return null
  return lerpCamera(from, to, handoffProgress(handoff))
}
