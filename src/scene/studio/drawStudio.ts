import { P } from '../palette'
import { drawSun } from '../procedural'
import { drawSprite } from '../sprite'
import { studioLayout } from './layout'
import { studioSprites } from './sprites'

export interface StudioDrawOptions {
  easelCount: number
}

function drawPaintCan(
  rect: (x: number, y: number, w: number, h: number, color: string) => void,
  x: number,
  y: number,
  dripColor: string,
) {
  rect(x + 1, y + 9, 8, 1, P.wood[0])
  rect(x, y, 9, 9, P.stone[0])
  rect(x + 1, y + 1, 7, 7, P.stone[3])
  rect(x + 1, y + 1, 2, 7, P.stone[4])
  rect(x + 1, y + 2, 7, 1, P.stone[1])
  rect(x + 1, y, 7, 2, dripColor)
  rect(x + 3, y + 2, 2, 3, dripColor)
  rect(x + 6, y + 2, 1, 2, dripColor)
}

function drawStudioEasel(
  ctx: CanvasRenderingContext2D,
  rect: (x: number, y: number, w: number, h: number, color: string) => void,
  slot: { x: number; y: number; w: number; h: number },
  artIndex: number | null,
  draped: boolean,
) {
  const cx = slot.x + Math.floor(slot.w / 2)
  const topY = slot.y + 1
  const legH = 58

  rect(cx - 12, topY + legH - 1, 24, 2, P.wood[0])
  rect(cx - 1, topY, 3, legH - 1, P.wood[0])
  rect(cx, topY + 1, 1, legH - 2, P.wood[3])
  for (let y = 10; y < legH; y++) {
    const spread = Math.floor((y - 8) * 0.22)
    rect(cx - 2 - spread, topY + y, 2, 1, P.wood[0])
    rect(cx - 1 - spread, topY + y, 1, 1, P.wood[2])
    rect(cx + 1 + spread, topY + y, 2, 1, P.wood[0])
    rect(cx + 1 + spread, topY + y, 1, 1, P.wood[3])
  }

  const frameW = 30
  const frameH = 24
  const fx = cx - Math.floor(frameW / 2)
  const fy = topY + 7

  if (draped) {
    rect(fx, fy, frameW, frameH, P.wood[0])
    rect(fx + 1, fy + 1, frameW - 2, frameH - 2, P.paper[2])
    rect(fx + 2, fy + 2, frameW - 4, frameH - 4, P.paper[3])
    for (let dy = fy + 4; dy < fy + frameH - 3; dy += 4) {
      for (let dx = fx + 4 + (dy % 3); dx < fx + frameW - 4; dx += 6) {
        rect(dx, dy, 2, 1, P.paper[2])
      }
    }
    rect(fx + 2, fy + frameH - 1, frameW - 4, 4, P.wood[0])
    rect(fx + 3, fy + frameH - 1, frameW - 6, 2, P.paper[2])
    rect(fx + 5, fy + frameH + 2, 4, 1, P.paper[3])
    rect(fx + frameW - 9, fy + frameH + 2, 5, 1, P.paper[3])
  } else {
    rect(fx, fy, frameW, frameH, P.wood[0])
    rect(fx + 1, fy + 1, frameW - 2, frameH - 2, P.wood[3])
    rect(fx + 2, fy + 2, frameW - 4, frameH - 4, P.paper[4])
    if (artIndex !== null) {
      const art = studioSprites.easelMini[artIndex % studioSprites.easelMini.length]
      drawSprite(ctx, art, cx - Math.floor(art.w / 2), fy + 3)
    }
  }

  rect(cx - 4, fy - 2, 8, 4, P.wood[0])
  rect(cx - 3, fy - 1, 6, 2, P.wood[4])
  rect(fx - 2, fy + frameH, frameW + 4, 3, P.wood[0])
  rect(fx - 1, fy + frameH, frameW + 2, 1, P.wood[4])
}

function drawNewelPost(
  rect: (x: number, y: number, w: number, h: number, color: string) => void,
  x: number,
  topY: number,
  bottomY: number,
) {
  const h = Math.max(4, bottomY - topY)
  rect(x, topY, 3, h, P.wood[0])
  rect(x + 1, topY + 1, 1, h - 2, P.wood[3])
  // Turned cap
  rect(x - 1, topY - 1, 5, 2, P.wood[0])
  rect(x, topY - 1, 3, 1, P.wood[4])
}

export function drawStudio(ctx: CanvasRenderingContext2D, frame: number, opts: StudioDrawOptions): void {
  const portrait = ctx.canvas.height > ctx.canvas.width
  const layout = studioLayout[portrait ? 'portrait' : 'landscape']
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  }
  ctx.imageSmoothingEnabled = false

  const ceilingBottom = portrait ? 44 : 24
  const dadoY = portrait ? 122 : 90
  const floorY = portrait ? 142 : 110

  // 1. Basement brick wall with subtle warm highlights near the big windows
  rect(0, ceilingBottom, width, dadoY - ceilingBottom, P.fur[1])
  for (let row = 0; row * 5 + ceilingBottom < dadoY; row++) {
    const y = ceilingBottom + row * 5
    rect(0, y, width, 1, P.wood[0])
    const stagger = (row % 2) * 7
    for (let x = stagger; x < width; x += 14) {
      rect(x, y + 1, 1, 4, P.wood[0])
      const nearWindow = y < dadoY - 8 && x > 58 && x < width - 16
      if (nearWindow && (row + x) % 3 === 0) {
        rect(x + 2, y + 1, 10, 3, P.wood[2])
      } else if ((row + x) % 5 === 0) {
        rect(x + 2, y + 2, 9, 2, P.wood[1])
      }
      if ((row * 3 + x) % 7 === 0) rect(x + 3, y + 1, 6, 1, P.fur[2])
    }
  }

  // 2. Ceiling joists
  rect(0, 0, width, ceilingBottom, P.wood[0])
  rect(0, 2, width, ceilingBottom - 3, P.wood[1])
  for (let x = 6; x < width; x += 22) {
    rect(x, 0, 5, ceilingBottom, P.wood[0])
    rect(x + 1, 0, 3, ceilingBottom - 1, P.wood[2])
    rect(x + 3, 0, 1, ceilingBottom - 1, P.wood[3])
  }
  rect(0, ceilingBottom - 2, width, 2, P.wood[0])
  rect(0, ceilingBottom - 1, width, 1, P.wood[2])

  // 3. Large back-wall windows looking out onto the beach and sunset sea
  for (let idx = 0; idx < layout.windows.length; idx++) {
    const win = layout.windows[idx]
    // Outer frame casing
    rect(win.x - 2, win.y - 2, win.w + 4, win.h + 5, P.wood[0])
    rect(win.x - 1, win.y - 1, win.w + 2, win.h + 2, P.wood[3])

    ctx.save()
    ctx.beginPath()
    ctx.rect(win.x, win.y, win.w, win.h)
    ctx.clip()

    const skyH = Math.round(win.h * 0.48)
    const seaH = Math.round(win.h * 0.28)
    const horizon = win.y + skyH
    const shore = horizon + seaH
    const skyColors = [P.sky[1], P.sky[2], P.sky[3], P.sky[4], P.sky[5]]
    for (let row = 0; row < skyH; row++) {
      const color = skyColors[Math.min(skyColors.length - 1, Math.floor((row / Math.max(1, skyH)) * skyColors.length))]
      rect(win.x, win.y + row, win.w, 1, color)
    }

    // Soft clouds across the sunset sky
    const cloudY = win.y + Math.max(4, Math.floor(skyH * 0.35))
    rect(win.x + 8, cloudY, 16, 1, P.sky[4])
    rect(win.x + 6, cloudY + 1, 20, 1, P.sky[3])
    if (win.w >= 60) {
      rect(win.x + win.w - 30, cloudY + 3, 18, 1, P.sky[4])
    }

    // Setting sun in the rightmost window; distant lighthouse point in the leftmost window
    if (idx === layout.windows.length - 1) {
      const sunX = win.x + Math.round(win.w * 0.72)
      drawSun(ctx, sunX, horizon + 1, portrait ? 7 : 9, horizon)
    } else if (idx === 0) {
      rect(win.x + 8, horizon - 4, 16, 4, P.sky[2])
      rect(win.x + 14, horizon - 10, 3, 6, P.paper[3])
      rect(win.x + 14, horizon - 7, 3, 2, P.flame[1])
      rect(win.x + 15, horizon - 11, 1, 1, P.sun[4])
    }

    // Sea + animated sun reflection & wave glints
    rect(win.x, horizon, win.w, shore - horizon, P.sea[1])
    rect(win.x, horizon, win.w, 2, P.sea[2])
    const phase = Math.floor(frame / 5)
    for (let sy = horizon + 1; sy < shore; sy += 2) {
      const spread = 6 + (sy - horizon)
      const glintX = win.x + ((sy * 11 + phase) % Math.max(6, win.w - 10))
      rect(glintX, sy, 6, 1, P.sea[3])
      if (idx === layout.windows.length - 1) {
        const sunX = win.x + Math.round(win.w * 0.72)
        rect(sunX - Math.floor(spread / 2) + (sy % 2), sy, Math.max(4, spread - (sy % 3)), 1, P.sun[3])
      }
    }

    // Sunlit beach & surf line
    rect(win.x, shore, win.w, win.y + win.h - shore, P.paper[3])
    rect(win.x, shore + 3, win.w, win.y + win.h - shore - 3, P.paper[4])
    rect(win.x, shore, win.w, 1, P.sea[4])
    rect(win.x + 6, shore + 1, Math.max(8, win.w - 14), 1, P.paper[4])

    // Subtle diagonal glass glare
    rect(win.x + 4, win.y + 3, 2, 5, P.paper[4])
    rect(win.x + 7, win.y + 4, 1, 3, P.paper[4])
    ctx.restore()

    // Window mullions + transom bar + stone sill
    const midX = win.x + Math.floor(win.w / 2)
    const transomY = win.y + Math.floor(win.h * 0.46)
    rect(midX - 1, win.y, 2, win.h, P.wood[0])
    rect(midX, win.y, 1, win.h, P.wood[3])
    rect(win.x, transomY, win.w, 2, P.wood[0])
    rect(win.x, transomY, win.w, 1, P.wood[3])

    rect(win.x - 3, win.y + win.h, win.w + 6, 3, P.stone[0])
    rect(win.x - 2, win.y + win.h, win.w + 4, 2, P.stone[3])
    rect(win.x - 2, win.y + win.h, win.w + 4, 1, P.sun[3])
  }

  // 4. Wood wainscoting & dado rail
  rect(0, dadoY, width, floorY - dadoY, P.wood[2])
  for (let x = 2; x < width; x += 6) {
    rect(x, dadoY + 3, 1, floorY - dadoY - 3, P.wood[1])
    rect(x + 1, dadoY + 3, 1, floorY - dadoY - 3, P.wood[3])
  }
  rect(0, dadoY, width, 3, P.wood[0])
  rect(0, dadoY + 1, width, 1, P.wood[4])
  rect(0, floorY - 3, width, 3, P.wood[0])
  rect(0, floorY - 2, width, 1, P.wood[1])

  // 5. Wood floor planks + woven rug on the right / Magic Easel zone
  rect(0, floorY, width, height - floorY, P.wood[2])
  for (let y = floorY; y < height; y += 7) {
    rect(0, y, width, 1, P.wood[0])
    rect(0, y + 1, width, 1, P.wood[3])
    for (let x = (y * 9) % 41; x < width; x += 47) {
      rect(x, y + 2, 1, 5, P.wood[1])
      rect(x + 14, y + 4, 10, 1, P.wood[1])
    }
  }

  const rug = portrait ? { x: 34, y: 162, w: 112, h: 52 } : { x: 184, y: 128, w: 120, h: 36 }
  rect(rug.x, rug.y, rug.w, rug.h, P.wood[0])
  rect(rug.x + 1, rug.y + 1, rug.w - 2, rug.h - 2, P.ui[1])
  rect(rug.x + 3, rug.y + 3, rug.w - 6, rug.h - 6, P.ui[2])
  rect(rug.x + 5, rug.y + 5, rug.w - 10, rug.h - 10, P.paper[2])
  for (let x = rug.x + 6; x < rug.x + rug.w - 6; x += 6) {
    rect(x, rug.y + 3, 3, 1, P.sun[3])
    rect(x, rug.y + rug.h - 4, 3, 1, P.sun[3])
  }
  for (let y = rug.y + 2; y < rug.y + rug.h - 2; y += 2) {
    rect(rug.x - 2, y, 2, 1, P.paper[3])
    rect(rug.x + rug.w, y, 2, 1, P.paper[3])
  }

  // 6. Stairs on the far left leading up to the porch doorway, with a proper angled banister
  const stairs = layout.upstairs
  const doorW = portrait ? 16 : 20
  const doorH = portrait ? 22 : 22
  // Porch doorway & warm light spilling onto top treads
  rect(stairs.x + 1, stairs.y, doorW, doorH, P.wood[0])
  rect(stairs.x + 3, stairs.y + 2, doorW - 4, doorH - 2, P.sun[4])
  rect(stairs.x + 4, stairs.y + 3, doorW - 6, 7, P.sky[5])
  rect(stairs.x + 4, stairs.y + 11, doorW - 6, 2, P.wood[3])

  const stepCount = 5
  const stepDx = portrait ? 4 : 5
  const stepDy = portrait ? 5 : 4
  const stepW = portrait ? 15 : 20
  // Sloped outer stringer supporting the steps
  const strStartX = stairs.x + doorW - 1
  const strStartY = stairs.y + doorH - 1
  const strEndX = stairs.x + 2 + (stepCount - 1) * stepDx + stepW - 1
  const strEndY = stairs.y + doorH - 2 + (stepCount - 1) * stepDy + 4
  for (let x = strStartX; x <= strEndX; x++) {
    const t = (x - strStartX) / Math.max(1, strEndX - strStartX)
    const sy = Math.round(strStartY + t * (strEndY - strStartY))
    rect(x, sy - 1, 1, 6, P.wood[0])
    rect(x, sy, 1, 4, P.wood[2])
  }
  // Stair treads
  for (let i = 0; i < stepCount; i++) {
    const sx = stairs.x + 2 + i * stepDx
    const sy = stairs.y + doorH - 2 + i * stepDy
    rect(sx, sy, stepW, 5, P.wood[0])
    rect(sx + 1, sy + 1, stepW - 2, 2, i < 2 ? P.sun[3] : P.wood[4])
    rect(sx + 1, sy + 3, stepW - 2, 1, P.wood[2])
  }

  // Banister: top newel post, bottom newel post, sloped handrail, and vertical balusters along the stringer
  const topPostX = strStartX
  const topPostBottom = strStartY + 1
  const topPostTop = topPostBottom - 15
  const botPostX = strEndX - 1
  const botPostBottom = strEndY + 2
  const botPostTop = botPostBottom - 17

  const railSpanX = Math.max(1, botPostX - topPostX)
  // Draw balusters behind the top/bottom posts and rail
  const balusterCount = 4
  for (let b = 1; b <= balusterCount; b++) {
    const bx = Math.round(topPostX + (b / (balusterCount + 1)) * railSpanX)
    const t = (bx - topPostX) / railSpanX
    const railY = Math.round(topPostTop + t * (botPostTop - topPostTop)) + 2
    const deckY = Math.round(strStartY + t * (strEndY - strStartY))
    const bh = Math.max(4, deckY - railY)
    rect(bx, railY, 2, bh, P.wood[0])
    rect(bx, railY, 1, bh, P.wood[3])
  }
  // Diagonal handrail following the stair angle
  for (let x = topPostX; x <= botPostX + 1; x++) {
    const t = (x - topPostX) / railSpanX
    const ry = Math.round(topPostTop + t * (botPostTop - topPostTop))
    rect(x, ry, 2, 3, P.wood[0])
    rect(x, ry + 1, 1, 1, P.wood[4])
  }
  drawNewelPost(rect, topPostX, topPostTop, topPostBottom)
  drawNewelPost(rect, botPostX, botPostTop, botPostBottom)

  // 7. Wall shelf + potted studio plant (minimal workshop prop)
  const shelf = layout.shelf
  rect(shelf.x, shelf.y, shelf.w, shelf.h, P.wood[0])
  rect(shelf.x + 1, shelf.y + 1, shelf.w - 2, 1, P.wood[4])
  rect(shelf.x + 3, shelf.y + shelf.h, 2, 3, P.wood[0])
  rect(shelf.x + shelf.w - 5, shelf.y + shelf.h, 2, 3, P.wood[0])
  if (!portrait) {
    drawSprite(ctx, studioSprites.brushJar, shelf.x + 4, shelf.y - 8)
  }
  drawSprite(ctx, studioSprites.plant, layout.plant.x, layout.plant.y)

  // 8. Simplified studio workbench on the left half
  if (!portrait) {
    const bench = layout.workbench
    const boardBox = layout.workbenchBoard
    // Clean wooden tabletop at y = workbenchBoard.y - 4
    const topY = boardBox.y - 4
    rect(bench.x, topY, bench.w, 5, P.wood[0])
    rect(bench.x + 1, topY + 1, bench.w - 2, 2, P.wood[3])
    rect(bench.x + 1, topY + 1, bench.w - 2, 1, P.wood[4])
    // Framed lower backboard for the order pad
    rect(boardBox.x + 1, boardBox.y, boardBox.w - 2, boardBox.h, P.wood[0])
    rect(boardBox.x + 2, boardBox.y + 1, boardBox.w - 4, boardBox.h - 2, P.wood[2])
    rect(boardBox.x + 3, boardBox.y + 2, boardBox.w - 6, boardBox.h - 4, P.wood[1])
    // Workbench legs grounded cleanly
    rect(bench.x + 2, topY + 5, 4, bench.y + bench.h - (topY + 5), P.wood[0])
    rect(bench.x + 3, topY + 5, 2, bench.y + bench.h - (topY + 5), P.wood[2])
    rect(bench.x + bench.w - 6, topY + 5, 4, bench.y + bench.h - (topY + 5), P.wood[0])
    rect(bench.x + bench.w - 5, topY + 5, 2, bench.y + bench.h - (topY + 5), P.wood[2])
    drawPaintCan(rect, bench.x + 8, bench.y + bench.h - 10, P.sea[3])
  }

  // 9. Studio easels on the rug (temporarily kept until S3 replaces with the Magic Easel)
  const visibleEasels = Math.min(opts.easelCount, layout.easels.length)
  if (visibleEasels === 0) {
    for (let i = 0; i < layout.easels.length; i++) {
      drawStudioEasel(ctx, rect, layout.easels[i], null, true)
    }
  } else {
    for (let i = 0; i < visibleEasels; i++) {
      drawStudioEasel(ctx, rect, layout.easels[i], i, false)
    }
  }
}
