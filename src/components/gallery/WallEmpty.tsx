import { Link } from 'react-router-dom'
import type { MouseEvent } from 'react'

/** The one card on an empty wall: no frames, no placeholders. `onPaint` pans back to the easel to paint the day's prompt. */
export function WallEmpty({ onPaint }: { onPaint?: (event: MouseEvent) => void }) {
  return (
    <>
      <p>Your first painting hangs here</p>
      <Link to="/home" onClick={onPaint} className="pp-btn inline-flex items-center justify-center">Paint today&apos;s prompt</Link>
    </>
  )
}
