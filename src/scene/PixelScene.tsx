import { createContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { cameraTransform, compositionFor, integerScale, sceneSize, type Camera, type Composition } from './camera'
import { SceneCanvas } from './SceneCanvas'
import './scene.css'

export const SceneComposition = createContext<Composition>('landscape')
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
const noSubscribe = () => () => {}

type Draw = (ctx: CanvasRenderingContext2D, frame: number, composition: Composition) => void

export function PixelScene({ draw, camera = { x: 0, y: 0, zoom: 1 }, zoomMs = 600, children, className, syncScale = false, paused = false, instant = false, 'data-testid': testId }: {
  draw: Draw
  camera?: Camera
  zoomMs?: number
  children?: ReactNode
  className?: string
  syncScale?: boolean
  paused?: boolean
  /** Apply camera changes without a CSS transition (first-measure frames). */
  instant?: boolean
  'data-testid'?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  // True only while React hydrates prerendered HTML (the landing page): React
  // reads the server snapshot then, and the client one on every other render.
  const hydrating = useSyncExternalStore(noSubscribe, () => false, () => true)
  // Seed from the window so the very first paint never falls back to the minimum
  // integer scale; the layout effect below measures the real box before paint.
  // While hydrating, start from the same 0x0 (landscape) the prerender used, or
  // a phone's portrait first render would not match the static HTML.
  const [viewport, setViewport] = useState(() => (
    hydrating || typeof window === 'undefined' ? { w: 0, h: 0 } : { w: window.innerWidth, h: window.innerHeight }
  ))
  const [moving, setMoving] = useState(false)
  // A full-page transition (the vertical floor stack) moves this scene by
  // moving an ancestor, not its camera. Pause the 12 fps art clock for that window so the scene
  // under the move is not also repainting (both a waste and a per-frame visual delta).
  const [sceneMoving, setSceneMoving] = useState(false)
  useEffect(() => {
    const doc = document.documentElement
    const sync = () => setSceneMoving(doc.hasAttribute('data-scene-moving'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(doc, { attributes: true, attributeFilter: ['data-scene-moving'] })
    return () => observer.disconnect()
  }, [])
  const cameraKey = `${camera.x}|${camera.y}|${camera.zoom}`
  const lastCameraKey = useRef(cameraKey)
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // While the camera is zoomed or travelling, the compositor owns the pixels: redrawing the
  // canvas at 12fps under a fractional CSS scale makes the nearest-neighbour raster shimmer.
  useEffect(() => {
    if (lastCameraKey.current === cameraKey) return
    lastCameraKey.current = cameraKey
    if (instant) return
    if (moveTimer.current) clearTimeout(moveTimer.current)
    setMoving(true)
    moveTimer.current = setTimeout(() => { moveTimer.current = null; setMoving(false) }, zoomMs + 80)
  }, [cameraKey, zoomMs, instant])
  useEffect(() => () => { if (moveTimer.current) clearTimeout(moveTimer.current) }, [])
  const clockPaused = paused || moving || sceneMoving || camera.zoom > 1.02
  const composition = viewport.w && viewport.h ? compositionFor(viewport.w, viewport.h) : 'landscape'
  const size = sceneSize(composition)
  const scale = integerScale(viewport.w, viewport.h, composition)

  useIsomorphicLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => {
      // `clientWidth`/`clientHeight` are the layout box. `getBoundingClientRect()`
      // includes ancestor CSS transforms, so measuring with it inside a scaled
      // transition wrapper feeds a shrunken width back into `integerScale` and
      // locks the scene at too small a scale (and the minimum of 2 when 0x0).
      const width = element.clientWidth || Math.round(element.getBoundingClientRect().width)
      const height = element.clientHeight || Math.round(element.getBoundingClientRect().height)
      if (!width || !height) return
      setViewport((current) => current.w === width && current.h === height ? current : { w: width, h: height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useIsomorphicLayoutEffect(() => {
    if (!syncScale) return
    const style = document.documentElement.style
    const previous = style.getPropertyValue('--px')
    return () => { if (previous) style.setProperty('--px', previous); else style.removeProperty('--px') }
  }, [syncScale])

  useIsomorphicLayoutEffect(() => {
    if (syncScale && viewport.w && viewport.h) document.documentElement.style.setProperty('--px', `${scale}px`)
  }, [syncScale, scale, viewport.w, viewport.h])

  const style = { '--px': `${scale}px`, '--scene-zoom-ms': `${zoomMs}ms` } as CSSProperties
  return (
    <div ref={root} className={['pixel-scene', instant ? 'pixel-scene--instant' : '', className].filter(Boolean).join(' ')} style={style} data-testid={testId}>
      <div className="pixel-scene__center" style={{ width: size.w * scale, height: size.h * scale }}>
        <div className="pixel-scene__camera" style={{ transform: cameraTransform(camera) }}>
          <SceneCanvas draw={draw} composition={composition} paused={clockPaused} />
          <SceneComposition.Provider value={composition}>{children}</SceneComposition.Provider>
        </div>
      </div>
    </div>
  )
}
