import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useDailyLock } from '../hooks/useDailyLock'
import './reduced-motion-notice.css'

export const REDUCED_MOTION_NOTICE_KEY = 'pixle:reduced-motion-notice-dismissed'
const QUERY = '(prefers-reduced-motion: reduce)'

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(REDUCED_MOTION_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(REDUCED_MOTION_NOTICE_KEY, '1')
  } catch {
    // Storage blocked: the notice still hides for this visit.
  }
}

function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia(QUERY).matches
    } catch {
      return false
    }
  })
  useEffect(() => {
    let media: MediaQueryList
    try {
      media = window.matchMedia(QUERY)
    } catch {
      return
    }
    const onChange = () => setReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/**
 * The app skips its camera moves when the device asks for reduced motion. This says so once, politely,
 * so a visitor knows the cuts are deliberate. It never shows during a Daily attempt or in a room, where
 * it could sit over the board.
 */
export function ReducedMotionNotice() {
  const reduced = useReducedMotionPreference()
  const locked = useDailyLock()
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (!reduced || dismissed || locked || pathname.startsWith('/r/')) return null

  return (
    <section className="rm-notice pp-wood-panel" role="status" aria-labelledby="rm-notice-title" data-testid="reduced-motion-notice">
      <h2 id="rm-notice-title" className="rm-notice__title">Reduced motion is on</h2>
      <p className="rm-notice__body">
        Pixle is one pixel-art scene, and the camera flies between places in it. Your device asks for reduced
        motion, so those moves are skipped. Everything still works. To see them, turn off Reduce Motion in your
        system settings.
      </p>
      <button
        type="button"
        className="rm-notice__button pp-btn"
        onClick={() => {
          writeDismissed()
          setDismissed(true)
        }}
      >
        Got it
      </button>
    </section>
  )
}
