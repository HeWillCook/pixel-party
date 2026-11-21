import { useContext } from 'react'
import { rectToPercent } from '../../scene/camera'
import { SceneComposition } from '../../scene/PixelScene'
import { porchLayout } from '../../scene/porch/layout'

export type EaselFaceMode = 'signin' | 'finished' | 'cover'

/** The words on the porch easel's face: the prompt card, the finished-painting tag, or the sign-in call. */
export function EaselFaceText({ mode, best }: { mode: EaselFaceMode; best: number }) {
  if (mode === 'signin') return <span className="porch-easel-action">Sign in to paint</span>
  if (mode === 'finished') return <span className="porch-easel-tag" data-testid="porch-easel-tag">Today&apos;s painting · {best}/1000</span>
  return <><strong>Today’s prompt</strong><span>5 minutes · your best grade counts</span><span className="porch-easel-action">Start painting</span></>
}

/**
 * The same easel face as a plain, non-interactive object of the porch scene. Close-ups that keep the porch art
 * under them (scores, gallery) carry it so the card is already on the easel when the camera comes back.
 */
export function EaselFaceObject({ mode, best }: { mode: EaselFaceMode; best: number }) {
  const composition = useContext(SceneComposition)
  return (
    <div aria-hidden="true" className="porch-easel-object" style={{ position: 'absolute', pointerEvents: 'none', ...rectToPercent(porchLayout[composition].easel, composition) }}>
      <span className={mode === 'finished' ? 'porch-easel-copy porch-easel-copy--tag' : 'porch-easel-copy'}>
        <EaselFaceText mode={mode} best={best} />
      </span>
    </div>
  )
}
