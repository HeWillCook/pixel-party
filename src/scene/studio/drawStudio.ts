import { blitStaticLayer } from '../detail'
import { studioLayout } from './layout'
import { drawLampPools, drawStudioSeas, paintStudioBackground, paintStudioForeground, type StudioOptions } from './studioArt'

/**
 * Basement studio. The brick wall with the window views, and the foreground (frames, wainscot, floor, stairs, props)
 * are painted once into cached 2x layers; only the window seas and the lamp light pools animate.
 */
export function drawStudio(ctx: CanvasRenderingContext2D, frame: number): void {
  const portrait = ctx.canvas.height > ctx.canvas.width
  const layout = studioLayout[portrait ? 'portrait' : 'landscape']
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  const o: StudioOptions = { portrait, width, height, layout, dadoY: portrait ? 82 : 78, floorY: portrait ? 96 : 98 }
  ctx.imageSmoothingEnabled = false
  const layer = (key: string, paint: (target: CanvasRenderingContext2D) => void) => {
    if (!blitStaticLayer(ctx, `studio|${portrait ? 'p' : 'l'}|${key}`, width, height, paint)) paint(ctx)
  }
  layer('bg', (target) => paintStudioBackground(target, o))
  drawStudioSeas(ctx, frame, o)
  layer('fg', (target) => paintStudioForeground(target, o))
  drawLampPools(ctx, frame, o)
}
