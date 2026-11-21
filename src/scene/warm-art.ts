import { sceneSize, type Composition } from './camera'
import { DETAIL, bindLogicalCanvas } from './detail'
import { drawPorch } from './porch/drawPorch'
import { drawStudio } from './studio/drawStudio'

/**
 * The scene art is painted into cached static layers on first use. On a slow machine the first
 * paint of the porch or the basement can take ~60 ms, which lands inside the first camera move
 * (or the first cold frame) as a dropped frame. Paint each scene once into an offscreen canvas
 * while the browser is idle, so the layers are already warm when a move needs them.
 */
let warmed = false

export function warmSceneArt(): void {
  if (warmed || typeof document === 'undefined') return
  warmed = true
  const paint = (composition: Composition) => {
    {
      const size = sceneSize(composition)
      const canvas = document.createElement('canvas')
      canvas.width = size.w
      canvas.height = size.h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      ctx.scale(DETAIL, DETAIL)
      bindLogicalCanvas(ctx, size.w, size.h)
      try {
        drawPorch(ctx, 0, { easelState: 'cover', bob: false, soundOn: false, signedIn: true, roofTop: 0 })
      } catch { /* decorative warm-up only */ }
      try {
        drawStudio(ctx, 0)
      } catch { /* decorative warm-up only */ }
    }
  }
  const current: Composition = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait'
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback
  // Warm the composition in use early (still off the first-paint critical path), and the other
  // one long after load so its one-off paint never competes with a transition.
  const runNow = () => paint(current)
  if (idle) idle(runNow, { timeout: 150 })
  else window.setTimeout(runNow, 200)
  window.setTimeout(() => paint(current === 'landscape' ? 'portrait' : 'landscape'), 6000)
}
