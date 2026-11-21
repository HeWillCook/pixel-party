import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useArrivalFlare } from '../../scene/useArrivalFlare'
import { PixelScene } from '../../scene/PixelScene'
import { cameraFor, compositionFor, type Camera } from '../../scene/camera'
import { drawPorch } from '../../scene/porch/drawPorch'
import { porchEaselBoardRect } from '../../scene/porch/layout'
import { untransformedRect } from '../../scene/registration'
import { SCENE_ZOOM_MS } from '../../scene/zoom'

export type PlayTransition = 'entering' | 'active' | 'leaving'

export function PlayBackdrop({
  hostRef,
  phase,
  onTransitionEnd,
  boardKey,
  soundOn = true,
  signedIn = true,
  easelState = 'cover',
  easelCells,
  onDismiss,
}: {
  /** The backdrop element; the registered close-up reads the scene's live camera through it. */
  hostRef: RefObject<HTMLDivElement | null>
  phase: PlayTransition
  onTransitionEnd: () => void
  boardKey?: string
  soundOn?: boolean
  signedIn?: boolean
  easelState?: 'cover' | 'finished'
  easelCells?: Uint8Array
  /** Set while the close-up is a finished result: clicking the scene around the board zooms back out. */
  onDismiss?: () => void
}) {
  const root = hostRef
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [duration, setDuration] = useState(0)
  // The easel's thrusters flare as the camera settles on it (entering only).
  const previousPhase = useRef(phase)
  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    setArrived(previousPhase.current === 'entering' && phase === 'active')
    previousPhase.current = phase
  }, [phase])
  const flare = useArrivalFlare(arrived)
  const flareBoost = useRef(flare.boost)
  flareBoost.current = flare.boost
  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    const height = root.current?.clientHeight ?? window.innerHeight
    const width = root.current?.clientWidth ?? window.innerWidth
    const scale = Math.max(2, Math.ceil(Math.max(width / ctx.canvas.width, height / ctx.canvas.height)))
    const roofTop = Math.max(0, Math.floor((ctx.canvas.height - height / scale) / 2))
    drawPorch(ctx, frame, { easelState, bob: false, soundOn, signedIn, roofTop, easelCells, flare: { target: 'easel', boost: flareBoost.current() } })
  }, [easelState, easelCells, soundOn, signedIn, root])

  const measureCamera = useCallback(() => {
    const scene = root.current
    const canvas = document.querySelector('[data-testid="pixel-canvas"]') as HTMLElement | null
    if (!scene || !canvas) return null
    const bounds = scene.getBoundingClientRect()
    // Layout rect, not the transformed one: while the close-up is registered to the small easel the
    // board is scaled down, and measuring that would aim the camera at the wrong size.
    const target = untransformedRect(canvas as HTMLElement)
    if (!bounds.width || !bounds.height || !target.w || !target.h) return null
    const composition = compositionFor(bounds.width, bounds.height)
    const focus = porchEaselBoardRect(composition)
    return cameraFor(
      focus,
      { x: target.x - bounds.left, y: target.y - bounds.top, w: target.w, h: target.h },
      { w: bounds.width, h: bounds.height },
      composition,
    )
  }, [])

  useLayoutEffect(() => {
    const scene = root.current
    const canvas = document.querySelector('[data-testid="pixel-canvas"]')
    if (!scene || !canvas) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced && phase !== 'active') {
      setDuration(0)
      setCamera(phase === 'entering' ? (measureCamera() ?? { x: 0, y: 0, zoom: 1 }) : { x: 0, y: 0, zoom: 1 })
      onTransitionEnd()
      return
    }
    const observer = new ResizeObserver(() => {
      if (phase === 'active') {
        const next = measureCamera()
        if (next) setCamera(next)
      }
    })
    observer.observe(scene)
    observer.observe(canvas)
    if (phase === 'active') {
      setDuration(0)
      const next = measureCamera()
      if (next) setCamera(next)
      return () => observer.disconnect()
    }
    setDuration(SCENE_ZOOM_MS)
    let request = 0
    // One frame at rest, then fly: the transition must own the whole curve, entry and reverse.
    const delay = window.setTimeout(() => {
      request = requestAnimationFrame(() => {
        setCamera(phase === 'entering' ? (measureCamera() ?? { x: 0, y: 0, zoom: 1 }) : { x: 0, y: 0, zoom: 1 })
      })
    }, 0)
    const timer = window.setTimeout(onTransitionEnd, SCENE_ZOOM_MS)
    return () => {
      observer.disconnect()
      clearTimeout(delay)
      cancelAnimationFrame(request)
      clearTimeout(timer)
    }
  }, [phase, onTransitionEnd, measureCamera])

  useLayoutEffect(() => {
    if (phase !== 'active') return
    const next = measureCamera()
    if (next) setCamera(next)
  }, [phase, boardKey, measureCamera])

  return (
    <div
      ref={root}
      className={onDismiss ? 'play-backdrop play-backdrop--dismiss' : 'play-backdrop'}
      data-camera="easel"
      data-phase={phase}
      onClick={onDismiss}
      data-testid={onDismiss ? 'scene-dismiss' : undefined}
    >
      <PixelScene draw={draw} camera={camera} zoomMs={duration} paused={phase === 'active' && !flare.running} instant={phase === 'active'} syncScale />
    </div>
  )
}
