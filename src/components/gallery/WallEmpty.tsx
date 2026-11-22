import { Link } from 'react-router-dom'
import type { MouseEvent } from 'react'

/**
 * The one card on an empty wall: no frames, no placeholders. On your own wall it invites the first painting (`onPaint` pans
 * back to the easel); on somebody else's it says whose wall is still bare, and offers the viewer a brush of their own rather
 * than pretending the wall belongs to them.
 */
export function WallEmpty({ isOwner = true, ownerName, onPaint }: { isOwner?: boolean; ownerName?: string | null; onPaint?: (event: MouseEvent) => void }) {
  if (!isOwner) {
    return (
      <>
        <p>{ownerName ? `${ownerName} hasn't hung a painting yet` : "They haven't hung a painting yet"}</p>
        <Link to="/home" onClick={onPaint} className="pp-btn inline-flex items-center justify-center">Paint today&apos;s prompt yourself</Link>
      </>
    )
  }
  return (
    <>
      <p>Your first painting hangs here</p>
      <Link to="/home" onClick={onPaint} className="pp-btn inline-flex items-center justify-center">Paint today&apos;s prompt</Link>
    </>
  )
}
