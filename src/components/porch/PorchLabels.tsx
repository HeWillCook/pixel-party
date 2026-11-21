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
  }
}

/**
 * Every word that is physically on a porch object (the easel's card, the chalkboard's board, the hatch sign, the gallery sign,
 * the house rules) as plain, non-interactive scene objects. A scene that keeps the porch art under it while the camera is elsewhere
 * (the gallery wall, Haiku's corner) carries them, so the camera flying back finds each word where it belongs the moment the porch
 * takes over, instead of every label popping in at the swap.
 */
export function PorchLabels({ easel, best, board }: { easel: EaselFaceMode; best: number; /** The chalkboard's writing: the inert board unless the page has the live one. */ board?: ReactNode }) {
  const composition = useContext(SceneComposition)
  const rect = porchLayout[composition]
  const portrait = composition === 'portrait'
  return (
    <>
      <EaselFaceObject mode={easel} best={best} />
      {board ?? <ChalkboardBoard />}
      <div aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none', ...rectToPercent(rect.basement, composition) }}>
        <span className="porch-basement-sign-copy" style={signCopyStyle(composition)}>Basement studio ↓</span>
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none', ...rectToPercent(rect.gallery, composition) }}><span className="porch-gallery-sign-copy">Gallery</span></div>
      {!portrait && <div aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none', ...rectToPercent(rect.note, composition) }}><span className="porch-note-title">House rules</span></div>}
    </>
  )
}
