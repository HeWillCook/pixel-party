import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthProfileReady } from 'deepspace'
import { GalleryWall } from '../../../components/gallery/GalleryWall'
import { TempDebugPaintings } from '../../../components/gallery/TempDebugPaintings'
import { WallEmpty } from '../../../components/gallery/WallEmpty'
import { useGalleryItems } from '../../../components/gallery/useGalleryItems'
import { useWallPager } from '../../../components/gallery/useWallPager'
import { PorchLabels } from '../../../components/porch/PorchLabels'
import { isPrimaryClick } from '../../../components/porch/returnFlag'
import { usePorchCloseup } from '../../../components/porch/usePorchCloseup'
import { useDaily } from '../../../hooks/DailyAttemptProvider'
import { PixelScene } from '../../../scene/PixelScene'
import { drawPorch } from '../../../scene/porch/drawPorch'
import { wallPageCount, wallPageLayout } from '../../../scene/porch/wallLayout'
import { integerScale } from '../../../scene/camera'
import '../../../components/gallery/gallery.css'

/** A wheel or trackpad gesture turns one page once it has travelled this far, then waits for the gesture to end (no event for this long). */
const WHEEL_TURN = 40
const WHEEL_IDLE_MS = 140
/** A touch swipe turns one page past this many px sideways. */
const SWIPE_PX = 48

/**
 * A player's gallery is the wall of the house to the left of the porch. The camera pans along the porch onto it at the porch's own
 * zoom; the paintings are HTML frames in scene units that pan with the siding, a page at a time. The arrow signs, the arrow keys,
 * a swipe or one wheel gesture turn a page, round and round. The wall outside a painting, Escape and the button pan back.
 */
export default function ProfilePage() {
  const { userId = '' } = useParams()
  const { user } = useAuthProfileReady({ requireUser: false })
  const { state: daily } = useDaily()
  const ownPath = `/u/${encodeURIComponent(userId)}`
  const isSelf = useCallback((path: string) => path === ownPath, [ownPath])
  const { items, status, name } = useGalleryItems(userId)
  const closeup = usePorchCloseup({ pose: 'gallery', kind: 'gallery', isSelf })
  const { backdropRef, viewport, composition, navHeight, leaving, startExit } = closeup
  const toPorch = useCallback(() => startExit('rest', '/home'), [startExit])
  const onPorchLink = useCallback((event: MouseEvent) => {
    if (!isPrimaryClick(event)) return
    event.preventDefault()
    toPorch()
  }, [toPorch])

  const isOwner = Boolean(user?.id && user.id === userId)
  const heading = isOwner ? 'Your gallery' : name ? `${name}'s gallery` : 'Gallery'
  const perPage = useMemo(() => {
    const scale = integerScale(viewport.w, viewport.h, composition)
    return viewport.w && viewport.h ? wallPageLayout(composition, viewport, scale, items.length).perPage : 1
  }, [viewport, composition, items.length])
  const pages = status === 'loading' || status === 'error' ? 0 : wallPageCount(items.length, perPage)
  const { page, turn, go, finish } = useWallPager(userId, pages)
  const goRef = useRef(go)
  goRef.current = go

  // One wheel or trackpad gesture (either axis) is one page: it counts its travel, turns once, then ignores the rest of the gesture
  // (an inertial tail included) until no event has come for a moment. `passive: false` so the page itself never scrolls under the wall.
  useEffect(() => {
    const host = backdropRef.current
    if (!host || leaving) return
    const gesture = { sum: 0, locked: false, timer: 0 }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? 400 : 1)
      if (!gesture.locked) {
        gesture.sum += delta
        if (Math.abs(gesture.sum) >= WHEEL_TURN) { gesture.locked = true; goRef.current(gesture.sum > 0 ? 1 : -1) }
      }
      window.clearTimeout(gesture.timer)
      gesture.timer = window.setTimeout(() => { gesture.locked = false; gesture.sum = 0 }, WHEEL_IDLE_MS)
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => { host.removeEventListener('wheel', onWheel); window.clearTimeout(gesture.timer) }
  }, [backdropRef, leaving])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (leaving || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'Escape') { event.preventDefault(); toPorch() }
      else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); if (!event.repeat) goRef.current(event.key === 'ArrowRight' ? 1 : -1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leaving, toPorch])

  // A touch (or pen) swipe along the wall turns one page. A swipe is never a click: the wall outside the frames would otherwise pan back at the end of it.
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const onPointerDown = (event: PointerEvent) => { if (event.pointerType !== 'mouse') swipe.current = { x: event.clientX, y: event.clientY } }
  const onPointerUp = (event: PointerEvent) => {
    const start = swipe.current
    swipe.current = null
    if (!start) return
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return
    swiped.current = true
    window.setTimeout(() => { swiped.current = false }, 0)
    goRef.current(dx < 0 ? 1 : -1)
  }
  const onBackdropClick = () => { if (!swiped.current) toPorch() }

  const easelMode = !user ? 'signin' : daily.status === 'ended' ? 'finished' : 'cover'
  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    const width = backdropRef.current?.clientWidth ?? window.innerWidth
    const height = backdropRef.current?.clientHeight ?? window.innerHeight
    const scale = Math.max(2, Math.ceil(Math.max(width / ctx.canvas.width, height / ctx.canvas.height)))
    const roofTop = Math.max(0, Math.floor((ctx.canvas.height - height / scale) / 2))
    drawPorch(ctx, frame, {
      easelState: easelMode,
      easelCells: undefined,
      bob: false,
      soundOn: false,
      signedIn: Boolean(user),
      roofTop,
    })
  }, [backdropRef, user, easelMode])

  return (
    <div
      className={leaving ? 'gallery-page gallery-page--leaving' : 'gallery-page'}
      data-testid="gallery-page"
      data-phase={leaving ? 'leaving' : 'active'}
      style={{ '--gallery-nav': `${navHeight}px` } as CSSProperties}
    >
      <div
        ref={backdropRef}
        className={leaving ? 'gallery-backdrop' : 'gallery-backdrop gallery-backdrop--dismiss'}
        data-camera="gallery"
        data-testid="scene-dismiss"
        onClick={onBackdropClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { swipe.current = null }}
      >
        <PixelScene
          draw={draw}
          className="gallery-backdrop__scene"
          camera={closeup.camera}
          zoomMs={closeup.zoomMs}
          instant={!leaving && !closeup.flying && closeup.continuing}
          paused={!leaving}
        >
          <PorchLabels easel={easelMode} best={daily.best} />
          <GalleryWall
            items={items}
            page={page}
            turn={turn}
            onTurn={finish}
            onGo={go}
            loading={status === 'loading'}
            failed={status === 'error'}
            empty={<WallEmpty onPaint={onPorchLink} />}
          />
        </PixelScene>
      </div>
      <header className="gallery-hud" onClick={(event) => event.stopPropagation()}>
        <h1 className="gallery-hud__title">{heading}</h1>
        <Link to="/home" onClick={onPorchLink} data-testid="gallery-back" className="pp-chip">← Back to the porch</Link>
      </header>
      {/* DEV ONLY (__DEBUG_TOOLS__) */}
      {__DEBUG_TOOLS__ && isOwner && <TempDebugPaintings />}
    </div>
  )
}
