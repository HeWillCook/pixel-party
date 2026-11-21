import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { sceneSize, type Composition } from './camera'
import { bindLogicalCanvas, DETAIL } from './detail'
import { useSceneClock } from './useSceneClock'

// Layout effects: a canvas that mounts as part of a route swap must be measured and painted before the browser
// paints its first frame, otherwise the swap shows one empty scene.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export type Draw = (ctx: CanvasRenderingContext2D, frame: number, composition: Composition) => void

/**
 * Draws at DETAIL x the logical resolution into an offscreen canvas (the draw callback still works in
 * logical units; `ctx.canvas.width/height` stay 320x180), then blits to a visible canvas backed at
 * CSS size x devicePixelRatio with smoothing off. When scale x DPR is even, every detail pixel is a whole
 * number of device pixels. The visible canvas keeps `width/height: 100%`, so the CSS box never changes.
 */
export function SceneCanvas({ draw, composition, paused }: { draw: Draw; composition: Composition; paused: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const frame = useSceneClock(12, paused)
  const size = sceneSize(composition)
  const [device, setDevice] = useState({ w: 0, h: 0, dpr: 1 })
  const target = useRef<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number } | null>(null)

  useIsomorphicLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const measure = () => {
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      setDevice((current) => current.w === w && current.h === h && current.dpr === dpr ? current : { w, h, dpr })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    // devicePixelRatio changes (browser zoom, dragging between displays) fire resize and this media query.
    let query: MediaQueryList | null = null
    const watchDpr = () => {
      query?.removeEventListener('change', onDpr)
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      query.addEventListener('change', onDpr)
    }
    const onDpr = () => { measure(); watchDpr() }
    watchDpr()
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); query?.removeEventListener('change', onDpr); window.removeEventListener('resize', measure) }
  }, [])

  useIsomorphicLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas || !device.w || !device.h) return
    // Resizing a canvas resets its context, so only touch width/height when the backing size really changed.
    if (canvas.width !== device.w) canvas.width = device.w
    if (canvas.height !== device.h) canvas.height = device.h
    const out = canvas.getContext('2d')
    if (!out) return
    let buffer = target.current
    const detailW = size.w * DETAIL, detailH = size.h * DETAIL
    if (!buffer || buffer.w !== detailW || buffer.h !== detailH) {
      const offscreen = document.createElement('canvas')
      offscreen.width = detailW
      offscreen.height = detailH
      const ctx = offscreen.getContext('2d')
      if (!ctx) return
      bindLogicalCanvas(ctx, size.w, size.h)
      buffer = target.current = { canvas: offscreen, ctx, w: detailW, h: detailH }
    }
    const { ctx } = buffer
    ctx.setTransform(DETAIL, 0, 0, DETAIL, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, size.w, size.h)
    ctx.save()
    draw(ctx, frame, composition)
    ctx.restore()
    out.imageSmoothingEnabled = false
    out.drawImage(buffer.canvas, 0, 0, detailW, detailH, 0, 0, device.w, device.h)
  }, [draw, frame, composition, size.w, size.h, device])

  return <canvas ref={ref} className="pixel-scene__canvas" aria-hidden="true" />
}
