import { P } from '../palette'
import { drawSun } from '../procedural'
import { drawSprite } from '../sprite'
import { studioLayout } from './layout'
import { studioSprites } from './sprites'

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

function drawNewelPost(
  rect: (x: number, y: number, w: number, h: number, color: string) => void,
  x: number,
  topY: number,
  bottomY: number,
) {
  const h = Math.max(4, bottomY - topY)
  rect(x, topY, 3, h, P.wood[0])
  rect(x + 1, topY + 1, 1, h - 2, P.wood[3])
  rect(x - 1, topY - 1, 5, 2, P.wood[0])
  rect(x, topY - 1, 3, 1, P.wood[4])
}

export function drawStudio(ctx: CanvasRenderingContext2D, frame: number): void {
  const portrait = ctx.canvas.height > ctx.canvas.width
  const layout = studioLayout[portrait ? 'portrait' : 'landscape']
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  }
  ctx.imageSmoothingEnabled = false

  const ceilingBottom = portrait ? 48 : 18
  const dadoY = portrait ? 82 : 78
  const floorY = portrait ? 96 : 98

  // 1. Basement brick wall with subtle warm highlights near the big windows
  rect(0, ceilingBottom, width, dadoY - ceilingBottom, P.fur[1])
  for (let row = 0; row * 5 + ceilingBottom < dadoY; row++) {
    const y = ceilingBottom + row * 5
    rect(0, y, width, 1, P.wood[0])
    const stagger = (row % 2) * 7
    for (let x = stagger; x < width; x += 14) {
      rect(x, y + 1, 1, 4, P.wood[0])
      const nearWindow = y < dadoY - 6 && x > 58 && x < width - 16
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

    const cloudY = win.y + Math.max(3, Math.floor(skyH * 0.35))
    rect(win.x + 8, cloudY, 16, 1, P.sky[4])
    rect(win.x + 6, cloudY + 1, 20, 1, P.sky[3])
    if (win.w >= 60) {
      rect(win.x + win.w - 30, cloudY + 3, 18, 1, P.sky[4])
    }

    if (idx === layout.windows.length - 1) {
      const sunX = win.x + Math.round(win.w * 0.72)
      drawSun(ctx, sunX, horizon + 1, portrait ? 6 : 9, horizon)
    } else if (idx === 0) {
      rect(win.x + 8, horizon - 4, 16, 4, P.sky[2])
      rect(win.x + 14, horizon - 10, 3, 6, P.paper[3])
      rect(win.x + 14, horizon - 7, 3, 2, P.flame[1])
      rect(win.x + 15, horizon - 11, 1, 1, P.sun[4])
    }

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

    rect(win.x, shore, win.w, win.y + win.h - shore, P.paper[3])
    rect(win.x, shore + 3, win.w, win.y + win.h - shore - 3, P.paper[4])
    rect(win.x, shore, win.w, 1, P.sea[4])
    rect(win.x + 6, shore + 1, Math.max(8, win.w - 14), 1, P.paper[4])

    rect(win.x + 4, win.y + 3, 2, 5, P.paper[4])
    rect(win.x + 7, win.y + 4, 1, 3, P.paper[4])
    ctx.restore()

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

  // 5. Wood floor planks (clean floor under the floating Magic Easel)
  rect(0, floorY, width, height - floorY, P.wood[2])
  for (let y = floorY; y < height; y += 7) {
    rect(0, y, width, 1, P.wood[0])
    rect(0, y + 1, width, 1, P.wood[3])
    for (let x = (y * 9) % 41; x < width; x += 47) {
      rect(x, y + 2, 1, 5, P.wood[1])
      rect(x + 14, y + 4, 10, 1, P.wood[1])
    }
  }

  // 6. Stairs on the left leading up to the porch doorway, placed cleanly below the logo
  const stairs = layout.upstairs
  const doorW = portrait ? 14 : 17
  const doorH = portrait ? 14 : 16
  rect(stairs.x + 1, stairs.y, doorW, doorH, P.wood[0])
  rect(stairs.x + 3, stairs.y + 2, doorW - 4, doorH - 2, P.sun[4])
  rect(stairs.x + 4, stairs.y + 3, doorW - 6, 5, P.sky[5])
  rect(stairs.x + 4, stairs.y + 9, doorW - 6, 2, P.wood[3])

  const stepCount = 4
  const stepDx = portrait ? 4 : 5
  const stepDy = 4
  const stepW = portrait ? 13 : 16
  const strStartX = stairs.x + doorW - 1
  const strStartY = stairs.y + doorH - 1
  const strEndX = stairs.x + 2 + (stepCount - 1) * stepDx + stepW - 1
  const strEndY = stairs.y + doorH - 2 + (stepCount - 1) * stepDy + 4
  for (let x = strStartX; x <= strEndX; x++) {
    const t = (x - strStartX) / Math.max(1, strEndX - strStartX)
    const sy = Math.round(strStartY + t * (strEndY - strStartY))
    rect(x, sy - 1, 1, 5, P.wood[0])
    rect(x, sy, 1, 3, P.wood[2])
  }
  for (let i = 0; i < stepCount; i++) {
    const sx = stairs.x + 2 + i * stepDx
    const sy = stairs.y + doorH - 2 + i * stepDy
    rect(sx, sy, stepW, 4, P.wood[0])
    rect(sx + 1, sy + 1, stepW - 2, 2, i < 2 ? P.sun[3] : P.wood[4])
  }

  const topPostX = strStartX
  const topPostBottom = strStartY + 1
  const topPostTop = topPostBottom - 12
  const botPostX = strEndX - 1
  const botPostBottom = strEndY + 1
  const botPostTop = botPostBottom - 13
  const railSpanX = Math.max(1, botPostX - topPostX)
  for (let b = 1; b <= 3; b++) {
    const bx = Math.round(topPostX + (b / 4) * railSpanX)
    const t = (bx - topPostX) / railSpanX
    const railY = Math.round(topPostTop + t * (botPostTop - topPostTop)) + 2
    const deckY = Math.round(strStartY + t * (strEndY - strStartY))
    const bh = Math.max(3, deckY - railY)
    rect(bx, railY, 2, bh, P.wood[0])
    rect(bx, railY, 1, bh, P.wood[3])
  }
  for (let x = topPostX; x <= botPostX + 1; x++) {
    const t = (x - topPostX) / railSpanX
    const ry = Math.round(topPostTop + t * (botPostTop - topPostTop))
    rect(x, ry, 2, 3, P.wood[0])
    rect(x, ry + 1, 1, 1, P.wood[4])
  }
  drawNewelPost(rect, topPostX, topPostTop, topPostBottom)
  drawNewelPost(rect, botPostX, botPostTop, botPostBottom)

  // 7. Wall shelf + potted studio plant (landscape only so portrait top band stays airy)
  if (!portrait) {
    const shelf = layout.shelf
    rect(shelf.x, shelf.y, shelf.w, shelf.h, P.wood[0])
    rect(shelf.x + 1, shelf.y + 1, shelf.w - 2, 1, P.wood[4])
    rect(shelf.x + 3, shelf.y + shelf.h, 2, 3, P.wood[0])
    rect(shelf.x + shelf.w - 5, shelf.y + shelf.h, 2, 3, P.wood[0])
    drawSprite(ctx, studioSprites.plant, layout.plant.x, layout.plant.y)
  }

  // 8. Left-side Corkboard & Craftsman Workbench (prominent Top hat + Brush jar + Shelf + Paint can)
  if (!portrait) {
    const cork = layout.corkboard
    rect(cork.x, cork.y, cork.w, cork.h, P.wood[0])
    rect(cork.x + 1, cork.y + 1, cork.w - 2, cork.h - 2, P.wood[3])
    rect(cork.x + 2, cork.y + 2, cork.w - 4, cork.h - 4, P.wood[2])

    const bench = layout.workbench
    const topY = 109
    // Perspective wooden tabletop with bevelled front apron
    rect(bench.x, topY - 4, bench.w, 10, P.wood[0])
    rect(bench.x + 2, topY - 3, bench.w - 4, 4, P.wood[4])
    rect(bench.x + 1, topY + 1, bench.w - 2, 4, P.wood[3])
    rect(bench.x + 2, topY + 5, bench.w - 4, 3, P.wood[1])

    // Sturdy workbench legs & lower wooden shelf visible behind the compact order pad
    const legH = bench.y + bench.h - (topY + 6)
    rect(bench.x + 3, topY + 6, 5, legH, P.wood[0])
    rect(bench.x + 4, topY + 6, 3, legH - 1, P.wood[2])
    rect(bench.x + bench.w - 8, topY + 6, 5, legH, P.wood[0])
    rect(bench.x + bench.w - 7, topY + 6, 3, legH - 1, P.wood[2])

    // Lower workbench plank shelf with paint can on left leg side
    const shelfY = bench.y + bench.h - 14
    rect(bench.x + 6, shelfY, bench.w - 12, 4, P.wood[0])
    rect(bench.x + 7, shelfY + 1, bench.w - 14, 2, P.wood[3])
    drawPaintCan(rect, bench.x + 10, shelfY - 9, P.sea[3])

    // Right-side brush jar & prominent Magician's Top Hat standing cleanly on left tabletop
    drawSprite(ctx, studioSprites.brushJar, bench.x + bench.w - 13, topY - 10)
    drawSprite(ctx, studioSprites.topHat, bench.x + 3, topY - 18)
  }
}
