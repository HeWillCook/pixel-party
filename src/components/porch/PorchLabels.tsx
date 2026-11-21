import { useContext, type CSSProperties, type ReactNode } from 'react'
import { rectToPercent, type Composition } from '../../scene/camera'
import { SceneComposition } from '../../scene/PixelScene'
import { porchHatch, porchLayout } from '../../scene/porch/layout'
import { ChalkboardBoard } from './ChalkboardBoard'
import { EaselFaceObject, type EaselFaceMode } from './EaselFace'

/** The sign's copy sits on the sign board beside the hatch, positioned inside the hatch hotspot from the layout. */
export function signCopyStyle(composition: Composition): CSSProperties {
  const whole = porchLayout[composition].basement, board = porchHatch[composition].sign
  return {
    left: `${(board.x + 2 - whole.x) / whole.w * 100}%`, top: `${(board.y + 2 - whole.y) / whole.h * 100}%`,
    width: `${(board.w - 4) / whole.w * 100}%`, height: `${(board.h - 4) / whole.h * 100}%`,
    // A phone's sign is read at arm's length: never under 11px.
    ...(composition === 'portrait' ? { fontSize: 'max(11px, calc(var(--px) * 3.3))' } : {}),
  }
}

/**
 * What the hatch sign says. A phone's sign is narrower, so it drops "studio" (the hatch's own label still says it); on a landscape
 * screen too small for the whole line at the 11px floor (a short wide window) a container query on the sign's box drops it as well.
 */
export function BasementSignCopy({ composition }: { composition: Composition }) {
  return (
    <span className="porch-basement-sign-copy" style={signCopyStyle(composition)}>
      <span>{composition === 'portrait' ? 'Basement ↓' : <>Basement<span className="porch-basement-sign-extra"> studio</span> ↓</>}</span>
    </span>
  )
}

/**
 * Every word that is physically on a porch object (the easel's card, the chalkboard's board, the hatch sign, the gallery sign,
 * the house rules) as plain, non-interactive scene objects. A scene that keeps the porch art under it while the camera is elsewhere
 * (the gallery wall, Haiku's corner) carries them, so the camera flying back finds each word where it belongs the moment the porch
 * takes over, instead of every label popping in at the swap.
 */
export function PorchLabels({ easel, best, board, easelAway = false, basementAway = false }: {
  easel: EaselFaceMode
  best: number
  /** The chalkboard's writing: the inert board unless the page has the live one. */
  board?: ReactNode
  /** Put the easel's card (or the hatch sign's words) away while the camera rests where the object is cut by the screen's edge. */
  easelAway?: boolean
  basementAway?: boolean
}) {
  const composition = useContext(SceneComposition)
  const rect = porchLayout[composition]
  const portrait = composition === 'portrait'
  return (
    <>
      <EaselFaceObject mode={easel} best={best} away={easelAway} />
      {board ?? <ChalkboardBoard />}
      <div aria-hidden="true" className={basementAway ? 'porch-label--away' : 'porch-label'} style={{ position: 'absolute', pointerEvents: 'none', ...rectToPercent(rect.basement, composition) }}>
        <BasementSignCopy composition={composition} />
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none', ...rectToPercent(rect.gallery, composition) }}><span className="porch-gallery-sign-copy">Gallery</span></div>
      {!portrait && <div aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none', ...rectToPercent(rect.note, composition) }}><span className="porch-note-title">House rules</span></div>}
    </>
  )
}
