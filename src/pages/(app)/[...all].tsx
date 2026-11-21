import { useCallback, useEffect, type CSSProperties } from 'react'
import { projectRect, type Rect } from '../../scene/camera'
import { useAuthProfileReady } from 'deepspace'
import { PorchWall } from '../../components/gallery/PorchWall'
import { PorchLabels } from '../../components/porch/PorchLabels'
import { isPrimaryClick } from '../../components/porch/returnFlag'
import { usePorchCloseup } from '../../components/porch/usePorchCloseup'
import { APP_NAME } from '../../constants'
import { useDaily } from '../../hooks/DailyAttemptProvider'
import { PixelScene } from '../../scene/PixelScene'
import { drawPorch } from '../../scene/porch/drawPorch'
import { haikuLayout } from '../../scene/porch/haikuCamera'
import { porchHatch, porchHaiku, porchLayout } from '../../scene/porch/layout'
import '../../components/haiku/lost.css'

/**
 * The 404 is Haiku's corner of the porch: the camera flies onto his chair, where he sits awake and sad among the paint he spilled
 * (the one cat, who is napping there at the porch's rest pose). His speech bubble is HTML glued to him, with the way back; so are
 * Escape and the porch anywhere around him. An unknown URL reached from inside the app flies here from the porch.
 */
export default function NotFoundPage() {
  const { user } = useAuthProfileReady({ requireUser: false })
  const { state: daily } = useDaily()
  const closeup = usePorchCloseup({
    pose: 'haiku',
    kind: 'haiku',
    focus: (composition) => porchHaiku[composition].bubble,
    anchorSelector: '[data-testid="not-found-bubble"]',
    flyIn: true,
  })
  const { backdropRef, viewport, composition, leaving, flying, startExit } = closeup
  const toPorch = useCallback(() => startExit('rest', '/home'), [startExit])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') toPorch() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toPorch])

  const easelMode = !user ? 'signin' : daily.status === 'ended' ? 'finished' : 'cover'
  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    const width = backdropRef.current?.clientWidth ?? window.innerWidth
    const height = backdropRef.current?.clientHeight ?? window.innerHeight
    const scale = Math.max(2, Math.ceil(Math.max(width / ctx.canvas.width, height / ctx.canvas.height)))
    const roofTop = Math.max(0, Math.floor((ctx.canvas.height - height / scale) / 2))
    drawPorch(ctx, frame, { easelState: easelMode, bob: false, soundOn: false, signedIn: Boolean(user), roofTop, haiku: 'sad' })
  }, [backdropRef, easelMode, user])

  // Where the bubble settles on screen: laid out on exactly the landing camera's projection.
  const spot = viewport.w && viewport.h ? haikuLayout(closeup.landing, viewport, composition) : null
  const portrait = composition === 'portrait'
  // Words glued to an object the screen cuts through (the easel's card, the hatch sign) step away while Haiku's corner rests.
  const cut = (rect: Rect) => {
    if (!viewport.w || !viewport.h) return false
    const on = projectRect(rect, closeup.landing, viewport, composition)
    return on.x < -1 || on.x + on.w > viewport.w + 1 || on.y < closeup.navHeight - 1 || on.y + on.h > viewport.h + 1
  }
  const easel = porchLayout[composition].easel
  const settled = !leaving && !flying
  const easelAway = settled && cut({ x: easel.x + easel.w * 0.23, y: easel.y + easel.h * 0.28, w: easel.w * 0.55, h: easel.h * 0.45 })
  const basementAway = settled && cut(porchHatch[composition].sign)

  return (
    <div className="lost-page" data-testid="not-found-page" data-phase={leaving ? 'leaving' : 'active'}>
      <title>{`Not found · ${APP_NAME}`}</title>
      <meta name="robots" content="noindex" />
      <div
        ref={backdropRef}
        className={leaving ? 'lost-backdrop' : 'lost-backdrop lost-backdrop--dismiss'}
        data-camera="haiku"
        data-testid="scene-dismiss"
        onClick={toPorch}
      >
        <PixelScene draw={draw} className="lost-backdrop__scene" camera={closeup.camera} zoomMs={closeup.zoomMs} instant={!leaving && !flying}>
          <PorchWall />
          <PorchLabels easel={easelMode} best={daily.best} easelAway={easelAway} basementAway={basementAway} />
        </PixelScene>
      </div>
      <div ref={closeup.registerRef} className="lost-register" data-registered="">
        {spot && (
          <div
            className={portrait ? 'lost-bubble lost-bubble--above' : 'lost-bubble'}
            data-testid="not-found-bubble"
            role="status"
            style={{ left: spot.bubble.x, top: spot.bubble.y, width: spot.bubble.w, height: spot.bubble.h, '--lost-u': `${spot.unit}px` } as CSSProperties}
            onClick={(event) => event.stopPropagation()}
          >
            <h1 className="lost-bubble__title">Oops — this page doesn&apos;t exist.</h1>
            <p className="lost-bubble__copy">I may have spilled it.</p>
            <a
              href="/home"
              className="lost-bubble__back"
              data-testid="not-found-porch-sign"
              onClick={(event) => { if (!isPrimaryClick(event)) return; event.preventDefault(); toPorch() }}
            >
              ← Back to the porch
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
