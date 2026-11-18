import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { PixelScene } from '../../scene/PixelScene'
import { cameraFor, compositionFor, type Camera } from '../../scene/camera'
import { drawPorch } from '../../scene/porch/drawPorch'
import { porchLayout } from '../../scene/porch/layout'

export type PlayTransition = 'entering' | 'active' | 'leaving'

export function PlayBackdrop({ phase, onTransitionEnd }: { phase: PlayTransition; onTransitionEnd: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [duration, setDuration] = useState(0)
  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    drawPorch(ctx, frame, { easelState: 'cover', bob: false, hideEasel: phase === 'active', backgroundOnly: phase === 'active' })
  }, [phase])

  useLayoutEffect(() => {
    const scene = root.current
    const canvas = document.querySelector('[data-testid="pixel-canvas"]')
    if (!scene || !canvas) return
    const measure = () => {
      const bounds = scene.getBoundingClientRect()
      const target = canvas.getBoundingClientRect()
      const composition = compositionFor(bounds.width, bounds.height)
      const easel = porchLayout[composition].easel
      const focus = { x: easel.x + 15, y: easel.y + 23, w: 39, h: 51 }
      return cameraFor(focus, { x: target.left - bounds.left, y: target.top - bounds.top, w: target.width, h: target.height }, { w: bounds.width, h: bounds.height }, composition)
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced && phase !== 'active') { setDuration(0); setCamera(phase === 'entering' ? measure() : { x: 0, y: 0, zoom: 1 }); onTransitionEnd(); return }
    let started = phase === 'active'
    const observer = new ResizeObserver(() => { if (started && phase !== 'leaving') setCamera(measure()) })
    observer.observe(scene)
    observer.observe(canvas)
    if (phase === 'active') { setDuration(0); setCamera(measure()); return () => observer.disconnect() }
    setDuration(600)
    const request = requestAnimationFrame(() => { started = true; setCamera(phase === 'entering' ? measure() : { x: 0, y: 0, zoom: 1 }) })
    const timer = window.setTimeout(onTransitionEnd, 600)
    return () => { observer.disconnect(); cancelAnimationFrame(request); clearTimeout(timer) }
  }, [phase, onTransitionEnd])

  return <div ref={root} className="play-backdrop" data-camera="easel"><PixelScene draw={draw} camera={camera} zoomMs={duration} /></div>
}
