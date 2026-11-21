import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Dialog, DialogContent } from '../ui'
import { PlayerStatsCard } from './PlayerStatsCard'
import './stats.css'

export interface PlayerStatsDialogProps {
  userId: string
  onClose: () => void
  /** Where focus goes after the dialog closes (usually the name that opened it). */
  finalFocus?: () => HTMLElement | null
  /** Lets the Scores page run its camera move to the painter's wall. */
  onSeeGallery?: (href: string) => void
}

/**
 * The stats card in a dialog, opened from a name on the scores board. Escape is taken in the
 * capture phase and stopped there: on `/scores` Escape is also the way back to the porch, and a
 * key that puts the card away must not also retire from the board (the DrawingViewer does the same).
 */
export function PlayerStatsDialog({ userId, onClose, finalFocus, onSeeGallery }: PlayerStatsDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const href = `/u/${encodeURIComponent(userId)}`
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        hideClose
        className="pstats-dialog"
        data-testid="player-stats-dialog"
        aria-labelledby="player-stats-dialog-title"
        finalFocus={finalFocus}
      >
        <h2 id="player-stats-dialog-title" className="pstats-dialog__title">Player stats</h2>
        <PlayerStatsCard userId={userId} variant="dialog" />
        <div className="pstats-dialog__actions">
          <Link
            to={href}
            className="pp-btn pstats-dialog__gallery"
            data-testid="player-stats-gallery-link"
            onClick={(event) => {
              if (!onSeeGallery || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              onSeeGallery(href)
            }}
          >
            See their gallery
          </Link>
          <button type="button" className="pp-btn pstats-dialog__close" onClick={onClose}>Close</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
