import { useCallback } from 'react'
import { P } from '../../scene/palette'
import { PixelScene } from '../../scene/PixelScene'
import { drawSun } from '../../scene/procedural'
import { drawSprite } from '../../scene/sprite'
import { studioSprites } from '../../scene/studio/sprites'

export function StudioBackdrop() {
  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const width = ctx.canvas.width
    const height = ctx.canvas.height
    const portrait = height > width
    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    }
    ctx.imageSmoothingEnabled = false

    const ceilingBottom = portrait ? 28 : 18
    const dadoY = portrait ? Math.round(height * 0.64) : Math.round(height * 0.68)
    const floorY = portrait ? dadoY + 20 : dadoY + 18

    // Basement brick wall
    rect(0, ceilingBottom, width, dadoY - ceilingBottom, P.fur[1])
    for (let row = 0; row * 6 + ceilingBottom < dadoY; row++) {
      const y = ceilingBottom + row * 6
      rect(0, y, width, 1, P.wood[0])
      const stagger = (row % 2) * 8
      for (let x = stagger; x < width; x += 16) {
        rect(x, y + 1, 1, 5, P.wood[0])
        if ((row + x) % 5 === 0) rect(x + 2, y + 2, 10, 2, P.wood[1])
        if ((row * 3 + x) % 7 === 0) rect(x + 3, y + 1, 7, 1, P.fur[2])
      }
    }

    // Ceiling joists
    rect(0, 0, width, ceilingBottom, P.wood[0])
    rect(0, 1, width, ceilingBottom - 2, P.wood[1])
    for (let x = 8; x < width; x += 26) {
      rect(x, 0, 5, ceilingBottom, P.wood[0])
      rect(x + 1, 0, 3, ceilingBottom - 1, P.wood[2])
      rect(x + 3, 0, 1, ceilingBottom - 1, P.wood[3])
    }
    rect(0, ceilingBottom - 2, width, 2, P.wood[0])
    rect(0, ceilingBottom - 1, width, 1, P.wood[2])

    // High basement windows on left and right margins framing the easel
    const windows = portrait
      ? [{ x: 14, y: ceilingBottom + 8, w: 42, h: 20 }, { x: width - 56, y: ceilingBottom + 8, w: 42, h: 20 }]
      : [{ x: 24, y: ceilingBottom + 8, w: 54, h: 22 }, { x: width - 78, y: ceilingBottom + 8, w: 54, h: 22 }]

    for (let idx = 0; idx < windows.length; idx++) {
      const win = windows[idx]
      rect(win.x - 2, win.y - 2, win.w + 4, win.h + 5, P.wood[0])
      rect(win.x - 1, win.y - 1, win.w + 2, win.h + 2, P.stone[1])
      ctx.save()
      ctx.beginPath()
      ctx.rect(win.x, win.y, win.w, win.h)
      ctx.clip()
      const horizon = win.y + 10
      const shore = win.y + 15
      const sky = [P.sky[1], P.sky[2], P.sky[3], P.sky[4], P.sky[5]]
      for (let r = 0; r < 10; r++) {
        rect(win.x, win.y + r, win.w, 1, sky[Math.min(sky.length - 1, Math.floor((r / 10) * sky.length))])
      }
      if (idx === 1) drawSun(ctx, win.x + win.w - 14, horizon + 1, 6, horizon)
      rect(win.x, horizon, win.w, shore - horizon, P.sea[1])
      rect(win.x + 8, horizon + 2, 10, 1, P.sea[3])
      rect(win.x, shore, win.w, win.y + win.h - shore, P.paper[3])
      rect(win.x, shore, win.w, 1, P.sea[4])
      ctx.restore()
      rect(win.x + Math.floor(win.w / 2) - 1, win.y, 2, win.h, P.wood[0])
      rect(win.x + Math.floor(win.w / 2), win.y, 1, win.h, P.wood[3])
      rect(win.x - 3, win.y + win.h, win.w + 6, 3, P.stone[0])
      rect(win.x - 2, win.y + win.h, win.w + 4, 2, P.stone[3])
      rect(win.x - 2, win.y + win.h, win.w + 4, 1, P.sun[3])
    }

    // Warm studio hanging lamps
    const lamps = portrait ? [62, width - 72] : [96, width - 106]
    for (const lx of lamps) {
      const ly = ceilingBottom + 6
      for (let y = ceilingBottom; y < ly + 1; y++) rect(lx + 4, y, 2, 1, P.stone[0])
      rect(lx + 1, ly + 7, 8, 2, P.sun[3])
      drawSprite(ctx, studioSprites.lamp, lx, ly)
    }

    // Wainscoting & dado rail
    rect(0, dadoY, width, floorY - dadoY, P.wood[2])
    for (let x = 2; x < width; x += 6) {
      rect(x, dadoY + 3, 1, floorY - dadoY - 3, P.wood[1])
      rect(x + 1, dadoY + 3, 1, floorY - dadoY - 3, P.wood[3])
    }
    rect(0, dadoY, width, 3, P.wood[0])
    rect(0, dadoY + 1, width, 1, P.wood[4])
    rect(0, floorY - 3, width, 3, P.wood[0])
    rect(0, floorY - 2, width, 1, P.wood[1])

    // Wood floor planks + woven rug under the hover easel
    rect(0, floorY, width, height - floorY, P.wood[2])
    for (let y = floorY; y < height; y += 7) {
      rect(0, y, width, 1, P.wood[0])
      rect(0, y + 1, width, 1, P.wood[3])
      for (let x = (y * 9) % 41; x < width; x += 47) {
        rect(x, y + 2, 1, 5, P.wood[1])
      }
    }

    const rugW = Math.round(width * (portrait ? 0.62 : 0.44))
    const rugX = Math.round((width - rugW) / 2)
    const rugY = floorY + 8
    const rugH = Math.max(24, height - rugY - 8)
    rect(rugX, rugY, rugW, rugH, P.wood[0])
    rect(rugX + 1, rugY + 1, rugW - 2, rugH - 2, P.ui[1])
    rect(rugX + 3, rugY + 3, rugW - 6, rugH - 6, P.ui[2])
    rect(rugX + 5, rugY + 5, rugW - 10, rugH - 10, P.paper[2])
  }, [])

  return (
    <div className="play-backdrop room-backdrop" aria-hidden="true">
      <PixelScene draw={draw} paused />
    </div>
  )
}
