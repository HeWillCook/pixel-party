/**
 * DrawingViewer — a Daily leaderboard painting, opened full size.
 *
 * The board is a slate of small thumbnails, so a tap on one zooms the painting itself up onto the
 * same slate (the `pp-panel` dialog primitive, restyled in scores.css) with the painter's name,
 * rank and score, and Haiku's guess and reason when the drawing record carries them.
 *
 * Stepping runs over the rows the board is showing, in rank order, and wraps: the arrows, the
 * left/right keys and the dialog's own dismiss (Esc, backdrop, close button) all come back to the
 * thumbnail that was last on screen (the board passes `finalFocus`).
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { Dialog, DialogContent } from '../ui'
import { PixelMedal } from './PixelMedals'
import { PixelThumb } from './PixelThumb'

export interface ViewerDrawing {
  userId: string
  name: string
  rank: number
  score: number
  cells: string
  guess?: string
  reason?: string
}

interface PanelProps {
  drawing: ViewerDrawing
  position: number
  total: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

const MEDALS = ['Gold', 'Silver', 'Bronze'] as const

/** The viewer's writing, without the dialog around it (also what the unit test renders). */
export function DrawingViewerPanel({ drawing, position, total, onPrev, onNext, onClose }: PanelProps) {
  const medal = drawing.rank >= 1 && drawing.rank <= 3 ? (drawing.rank as 1 | 2 | 3) : 0
  const guess = (drawing.guess ?? '').trim()
  const reason = (drawing.reason ?? '').trim()
  return (
    <div className="drawing-viewer__panel" data-testid="drawing-viewer-panel">
      <div className="drawing-viewer__head">
        <h2 id="drawing-viewer-title" className="drawing-viewer__name">{drawing.name}</h2>
        {medal !== 0 && (
          <PixelMedal medal={medal} scale="scene" label={`${MEDALS[medal - 1]} medal`} className="drawing-viewer__medal" />
        )}
        <p className="drawing-viewer__meta">
          Rank {drawing.rank} · {drawing.score} / 1000
        </p>
      </div>

      <div className="drawing-viewer__stage">
        <PixelThumb cells={drawing.cells} size={420} className="drawing-viewer__art" />
      </div>

      {(guess || reason) && (
        <div className="drawing-viewer__ai">
          {guess && <p className="drawing-viewer__guess">Haiku guessed &ldquo;{guess}&rdquo;</p>}
          {reason && <p className="drawing-viewer__reason">{reason}</p>}
        </div>
      )}

      <div className="drawing-viewer__controls">
        <button
          type="button"
          className="drawing-viewer__step"
          data-testid="drawing-viewer-prev"
          aria-label="Previous drawing"
          onClick={onPrev}
          disabled={total < 2}
        >
          ←
        </button>
        <span className="drawing-viewer__count" aria-live="polite">
          {position + 1} / {total}
        </span>
        <button
          type="button"
          className="drawing-viewer__step"
          data-testid="drawing-viewer-next"
          aria-label="Next drawing"
          onClick={onNext}
          disabled={total < 2}
        >
          →
        </button>
        <button
          type="button"
          className="drawing-viewer__close"
          data-testid="drawing-viewer-close"
          aria-label="Close drawing"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  )
}

/**
 * The dialog around the panel. Only mounted while a painting is open, so its key listener exists
 * exactly as long as the dialog does. Escape is taken in the capture phase and stopped there: on the
 * Scores page Escape is also the way back to the porch, and a key that puts the painting away must
 * not also retire from the board.
 */
export function DrawingViewer({
  drawings,
  index,
  onIndexChange,
  onClose,
  finalFocus,
}: {
  drawings: ViewerDrawing[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  finalFocus?: () => HTMLElement | null
}): ReactNode {
  const total = drawings.length
  const current = drawings[index]
  const actions = useRef({ onIndexChange, onClose, index, total })
  actions.current = { onIndexChange, onClose, index, total }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { index: at, total: count } = actions.current
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        actions.current.onClose()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (count < 2) return
        event.preventDefault()
        event.stopImmediatePropagation()
        const step = event.key === 'ArrowRight' ? 1 : -1
        actions.current.onIndexChange((at + step + count) % count)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  if (!current) return null

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        hideClose
        className="drawing-viewer"
        data-testid="drawing-viewer"
        aria-labelledby="drawing-viewer-title"
        finalFocus={finalFocus}
      >
        <DrawingViewerPanel
          drawing={current}
          position={index}
          total={total}
          onPrev={() => onIndexChange((index - 1 + total) % total)}
          onNext={() => onIndexChange((index + 1) % total)}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
