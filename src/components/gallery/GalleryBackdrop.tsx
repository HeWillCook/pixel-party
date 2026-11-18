import { useCallback } from 'react'
import { P } from '../../scene/palette'
import { PixelScene } from '../../scene/PixelScene'
import { drawSun } from '../../scene/procedural'

export function GalleryBackdrop() {
  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const width = ctx.canvas.width
    const height = ctx.canvas.height
    const portrait = height > width
    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    }
    ctx.imageSmoothingEnabled = false

    const ceilingY = portrait ? 24 : 16
    const dadoY = Math.round(height * (portrait ? 0.78 : 0.76))
    const floorY = Math.round(height * (portrait ? 0.88 : 0.87))

    // Warm wood-panelled gallery wall
    rect(0, 0, width, ceilingY, P.wood[0])
    rect(0, 0, width, ceilingY - 2, P.wood[1])
    rect(0, ceilingY - 2, width, 1, P.wood[3])

    rect(0, ceilingY, width, dadoY - ceilingY, P.wood[2])
    const plankW = 14
    for (let x = 0; x < width; x += plankW) {
      rect(x, ceilingY, 1, dadoY - ceilingY, P.wood[1])
      rect(x + 1, ceilingY, 1, dadoY - ceilingY, P.wood[3])
      const grainY = ceilingY + 12 + ((x * 7) % Math.max(20, dadoY - ceilingY - 24))
      rect(x + 5, grainY, 1, 9, P.wood[1])
      rect(x + 9, grainY + 14, 1, 7, P.wood[3])
    }

    // Wainscoting + dado rail + baseboard
    rect(0, dadoY, width, floorY - dadoY, P.wood[1])
    for (let x = 2; x < width; x += 8) {
      rect(x, dadoY + 4, 4, floorY - dadoY - 7, P.wood[2])
      rect(x + 3, dadoY + 4, 1, floorY - dadoY - 7, P.wood[3])
    }
    rect(0, dadoY, width, 3, P.wood[0])
    rect(0, dadoY + 1, width, 1, P.wood[4])
    rect(0, floorY - 3, width, 3, P.wood[0])
    rect(0, floorY - 2, width, 1, P.wood[3])

    // Warm wooden floorboards
    rect(0, floorY, width, height - floorY, P.wood[2])
    for (let y = floorY; y < height; y += 7) {
      rect(0, y, width, 1, P.wood[0])
      rect(0, y + 1, width, 1, P.wood[3])
      for (let x = (y * 11) % 39; x < width; x += 48) {
        rect(x, y + 2, 1, 5, P.wood[1])
      }
    }

    // Sunset window overlooking the ocean
    const win = portrait
      ? { x: width - 58, y: ceilingY + 28, w: 42, h: 34 }
      : { x: width - 76, y: ceilingY + 14, w: 58, h: 48 }

    // Dithered warm sunset light cast diagonally from the window onto the wall
    const beamTop = win.y + 4
    const beamBottom = Math.min(floorY - 4, win.y + win.h + (portrait ? 56 : 72))
    for (let y = beamTop; y < beamBottom; y++) {
      const progress = (y - beamTop) / Math.max(1, beamBottom - beamTop)
      const shift = Math.round(progress * (portrait ? 64 : 96))
      const leftEdge = Math.max(0, win.x - shift)
      const rightEdge = Math.min(width - 1, win.x + win.w - shift)
      for (let x = leftEdge; x <= rightEdge; x++) {
        if (y <= win.y + win.h + 4 && x >= win.x - 4 && x <= win.x + win.w + 4) continue
        const dense = (x + y) % 2 === 0
        const sparse = (x + y) % 4 === 0
        if (progress < 0.6 ? dense : sparse) {
          rect(x, y, 1, 1, progress < 0.35 ? P.sun[3] : P.wood[4])
        }
      }
    }

    // Window frame + sunset vista
    rect(win.x - 3, win.y - 3, win.w + 6, win.h + 7, P.wood[0])
    rect(win.x - 2, win.y - 2, win.w + 4, win.h + 4, P.wood[3])
    rect(win.x - 1, win.y - 1, win.w + 2, win.h + 2, P.wood[0])

    ctx.save()
    ctx.beginPath()
    ctx.rect(win.x, win.y, win.w, win.h)
    ctx.clip()
    const horizon = win.y + Math.round(win.h * 0.56)
    const shore = win.y + Math.round(win.h * 0.82)
    for (let row = 0; row < horizon - win.y; row++) {
      const band = Math.min(P.sky.length - 1, Math.floor((row / Math.max(1, horizon - win.y)) * P.sky.length))
      rect(win.x, win.y + row, win.w, 1, P.sky[band])
    }
    drawSun(ctx, win.x + Math.round(win.w * 0.68), horizon + 1, portrait ? 8 : 11, horizon)
    rect(win.x, horizon, win.w, shore - horizon, P.sea[1])
    for (let sy = horizon + 2; sy < shore; sy += 3) {
      const sx = win.x + Math.round(win.w * 0.55) + ((sy * 3) % 8) - 4
      rect(sx, sy, 6, 1, P.sun[2])
    }
    rect(win.x, shore, win.w, win.y + win.h - shore, P.paper[3])
    rect(win.x, shore, win.w, 1, P.sea[4])
    ctx.restore()

    // Window cross mullions + warm sunlit sill
    const midX = win.x + Math.floor(win.w / 2) - 1
    const midY = win.y + Math.floor(win.h / 2) - 1
    rect(midX, win.y, 2, win.h, P.wood[0])
    rect(midX + 1, win.y, 1, win.h, P.wood[4])
    rect(win.x, midY, win.w, 2, P.wood[0])
    rect(win.x, midY + 1, win.w, 1, P.wood[4])
    rect(win.x - 4, win.y + win.h, win.w + 8, 4, P.wood[0])
    rect(win.x - 3, win.y + win.h + 1, win.w + 6, 2, P.wood[4])
  }, [])

  return (
    <div className="gallery-backdrop" aria-hidden="true">
      <PixelScene draw={draw} paused />
    </div>
  )
}
