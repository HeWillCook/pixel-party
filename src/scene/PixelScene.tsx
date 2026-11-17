import { createContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cameraTransform, compositionFor, integerScale, sceneSize, type Camera, type Composition } from './camera'
import { useSceneClock } from './useSceneClock'
import './scene.css'

export const SceneComposition = createContext<Composition>('landscape')
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

type Draw = (ctx: CanvasRenderingContext2D, frame: number, composition: Composition) => void

function SceneCanvas({ draw, composition }: { draw: Draw; composition: Composition }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const frame = useSceneClock()
  const size = sceneSize(composition)

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, size.w, size.h)
    draw(ctx, frame, composition)
  }, [draw, frame, composition, size.w, size.h])

  return <canvas ref={ref} width={size.w} height={size.h} className="pixel-scene__canvas" aria-hidden="true" />
}

export function PixelScene({ draw, camera = { x: 0, y: 0, zoom: 1 }, zoomMs = 600, children, className, 'data-testid': testId }: {
  draw: Draw
  camera?: Camera
  zoomMs?: number
  children?: ReactNode
  className?: string
  'data-testid'?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const composition = viewport.w && viewport.h ? compositionFor(viewport.w, viewport.h) : 'landscape'
  const size = sceneSize(composition)
  const scale = integerScale(viewport.w, viewport.h, composition)

  useIsomorphicLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => {
      const bounds = element.getBoundingClientRect()
      setViewport((current) => current.w === bounds.width && current.h === bounds.height ? current : { w: bounds.width, h: bounds.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const style = { '--px': `${scale}px`, '--scene-zoom-ms': `${zoomMs}ms` } as CSSProperties
  return (
    <div ref={root} className={['pixel-scene', className].filter(Boolean).join(' ')} style={style} data-testid={testId}>
      <div className="pixel-scene__center" style={{ width: size.w * scale, height: size.h * scale }}>
        <div className="pixel-scene__camera" style={{ transform: cameraTransform(camera) }}>
          <SceneCanvas draw={draw} composition={composition} />
          <SceneComposition.Provider value={composition}>{children}</SceneComposition.Provider>
        </div>
      </div>
    </div>
  )
}
