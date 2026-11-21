import { useContext, type CSSProperties, type MouseEvent } from 'react'
import { Leaderboard } from '../daily/Leaderboard'
import { useDaily } from '../../hooks/DailyAttemptProvider'
import { rectToPercent } from '../../scene/camera'
import { SceneComposition } from '../../scene/PixelScene'
import { porchChalkboardRect } from '../../scene/porch/layout'
import { scoresTargetCamera, scoresTargetLayout } from '../../scene/porch/scoresCamera'
import { useStageMeasure } from './useStageMeasure'
import '../scores/scores.css'

const stop = (event: MouseEvent) => event.stopPropagation()

/**
 * The porch chalkboard's writing: the real Scores board, one object at every distance. It is laid out at the size the Scores
 * close-up shows it (the slate at that camera) and scaled down by that camera's own zoom to stand on the porch's chalkboard, so
 * at rest it is the same board, small, and zooming onto it only brings it back to full size: nothing swaps, in any scene a
 * camera can fly through to or from Scores. A copy on the porch is inert (no pointer, no focus); the `/scores` page's is live.
 */
export function ChalkboardBoard({ live = false, onPorch, onSelectPainter }: { live?: boolean; onPorch?: () => void; onSelectPainter?: (href: string) => void }) {
  const composition = useContext(SceneComposition)
  const { state } = useDaily()
  const { viewport, navHeight } = useStageMeasure()
  if (!viewport.w || !viewport.h) return null
  const zoom = scoresTargetCamera(viewport, composition, navHeight).zoom
  const layout = scoresTargetLayout(viewport, composition, navHeight)
  const style = { ...rectToPercent(porchChalkboardRect(composition), composition), '--scores-slate-h': `${layout.slateMinHeight}px` } as CSSProperties
  return (
    <div className={live ? 'board-face board-face--live' : 'board-face'} style={style} aria-hidden={live ? undefined : true} inert={live ? undefined : true} onClick={live ? stop : undefined}>
      <div className="board-face__stage" style={{ width: layout.stageMaxWidth, transform: `scale(${1 / zoom})` }}>
        <Leaderboard day={state.day} ended={state.status === 'ended'} onPorch={live ? onPorch : undefined} onSelectPainter={live ? onSelectPainter : undefined} />
      </div>
    </div>
  )
}
