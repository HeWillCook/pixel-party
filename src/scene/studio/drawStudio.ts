import { P } from '../palette'
import { drawSun } from '../procedural'
import { drawSprite } from '../sprite'
import { studioLayout } from './layout'
import { studioSprites } from './sprites'

export interface StudioDrawOptions {
  easelCount: number
}

function drawStool(
  rect: (x: number, y: number, w: number, h: number, color: string) => void,
  x: number,
  y: number,
) {
  // Ground shadow
  rect(x + 1, y + 14, 12, 1, P.wood[0])
  // Stool legs + crossbar
  rect(x + 2, y + 4, 2, 10, P.wood[0])
  rect(x + 3, y + 4, 1, 9, P.wood[2])
  rect(x + 10, y + 4, 2, 10, P.wood[0])
  rect(x + 10, y + 4, 1, 9, P.wood[2])
  rect(x + 6, y + 4, 2, 9, P.wood[1])
  rect(x + 3, y + 9, 8, 2, P.wood[0])
  rect(x + 4, y + 9, 6, 1, P.wood[3])
  // Round-ish wooden seat
  rect(x + 1, y, 12, 4, P.wood[0])
  rect(x + 2, y + 1, 10, 2, P.wood[3])
  rect(x + 3, y + 1, 8, 1, P.wood[4])
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
  // Paint rim & drip
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

  // Soft solid ground shadow on rug
  rect(cx - 12, topY + legH - 1, 24, 2, P.wood[0])

  // Center mast + splayed A-frame legs (same construction family as porch easel)
  rect(cx - 1, topY, 3, legH - 1, P.wood[0])
  rect(cx, topY + 1, 1, legH - 2, P.wood[3])
  for (let y = 10; y < legH; y++) {
    const spread = Math.floor((y - 8) * 0.22)
    rect(cx - 2 - spread, topY + y, 2, 1, P.wood[0])
    rect(cx - 1 - spread, topY + y, 1, 1, P.wood[2])
    rect(cx + 1 + spread, topY + y, 2, 1, P.wood[0])
    rect(cx + 1 + spread, topY + y, 1, 1, P.wood[3])
  }

  // Framed canvas (30x24 outer, matches porch easel proportions)
  const frameW = 30
  const frameH = 24
  const fx = cx - Math.floor(frameW / 2)
  const fy = topY + 7

  if (draped) {
    // Draped drop-cloth over spare studio easel (matches porch draped easel texture)
    rect(fx, fy, frameW, frameH, P.wood[0])
    rect(fx + 1, fy + 1, frameW - 2, frameH - 2, P.paper[2])
    rect(fx + 2, fy + 2, frameW - 4, frameH - 4, P.paper[3])
    for (let dy = fy + 4; dy < fy + frameH - 3; dy += 4) {
      for (let dx = fx + 4 + (dy % 3); dx < fx + frameW - 4; dx += 6) {
        rect(dx, dy, 2, 1, P.paper[2])
      }
    }
    // Draped fabric bottom hem hanging past the tray
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

  // Top clamp (porch style)
  rect(cx - 4, fy - 2, 8, 4, P.wood[0])
  rect(cx - 3, fy - 1, 6, 2, P.wood[4])

  // Chunky wooden tray + paint tubes & brush
  rect(fx - 2, fy + frameH, frameW + 4, 3, P.wood[0])
  rect(fx - 1, fy + frameH, frameW + 2, 1, P.wood[4])
  if (!draped) {
    rect(fx + 3, fy + frameH - 1, 4, 1, P.stone[2])
    rect(fx + 9, fy + frameH - 1, 3, 1, P.flame[1])
    rect(fx + 19, fy + frameH - 2, 5, 1, P.wood[4])
    rect(fx + 24, fy + frameH - 2, 2, 1, P.paper[4])
  }
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
  const dadoY = portrait ? 122 : 93
  const floorY = portrait ? 142 : 112

  // 1. Basement brick wall with subtle warmth under windows
  rect(0, ceilingBottom, width, dadoY - ceilingBottom, P.fur[1])
  for (let row = 0; row * 5 + ceilingBottom < dadoY; row++) {
    const y = ceilingBottom + row * 5
    rect(0, y, width, 1, P.wood[0])
    const stagger = (row % 2) * 7
    for (let x = stagger; x < width; x += 14) {
      rect(x, y + 1, 1, 4, P.wood[0])
      const nearWindow = y < ceilingBottom + 28 && x > 76 && x < width - 70
      if (nearWindow && (row + x) % 3 === 0) {
        rect(x + 2, y + 1, 10, 3, P.wood[2])
      } else if ((row + x) % 5 === 0) {
        rect(x + 2, y + 2, 9, 2, P.wood[1])
      }
      if ((row * 3 + x) % 7 === 0) rect(x + 3, y + 1, 6, 1, P.fur[2])
    }
  }

  // 2. High basement ceiling joists (backdrop behind the porch roof/beam & hanging nav signs)
  rect(0, 0, width, ceilingBottom, P.wood[0])
  rect(0, 2, width, ceilingBottom - 3, P.wood[1])
  for (let x = 6; x < width; x += 22) {
    rect(x, 0, 5, ceilingBottom, P.wood[0])
    rect(x + 1, 0, 3, ceilingBottom - 1, P.wood[2])
    rect(x + 3, 0, 1, ceilingBottom - 1, P.wood[3])
  }
  rect(0, ceilingBottom - 2, width, 2, P.wood[0])
  rect(0, ceilingBottom - 1, width, 1, P.wood[2])

  // 3. High basement windows showing beach, sea & sunset outside
  for (let idx = 0; idx < layout.windows.length; idx++) {
    const win = layout.windows[idx]
    rect(win.x - 2, win.y - 2, win.w + 4, win.h + 5, P.wood[0])
    rect(win.x - 1, win.y - 1, win.w + 2, win.h + 2, P.stone[1])

    ctx.save()
    ctx.beginPath()
    ctx.rect(win.x, win.y, win.w, win.h)
    ctx.clip()
    const horizon = win.y + 9
    const shore = win.y + 14
    const skyColors = [P.sky[1], P.sky[2], P.sky[3], P.sky[4], P.sky[5]]
    for (let row = 0; row < 9; row++) {
      const color = skyColors[Math.min(skyColors.length - 1, Math.floor((row / 9) * skyColors.length))]
      rect(win.x, win.y + row, win.w, 1, color)
    }
    if (idx === layout.windows.length - 1) {
      drawSun(ctx, win.x + win.w - 13, horizon + 1, 6, horizon)
    } else if (idx === 0) {
      rect(win.x + 8, horizon - 3, 14, 3, P.sky[2])
      rect(win.x + 13, horizon - 7, 3, 4, P.paper[3])
      rect(win.x + 13, horizon - 5, 3, 1, P.flame[1])
      rect(win.x + 14, horizon - 8, 1, 1, P.sun[4])
    }
    rect(win.x, horizon, win.w, shore - horizon, P.sea[1])
    const phase = Math.floor(frame / 5)
    for (let sy = horizon + 1; sy < shore; sy += 2) {
      rect(win.x + ((sy * 7 + phase) % Math.max(4, win.w - 8)), sy, 5, 1, P.sea[3])
      if (idx === layout.windows.length - 1) {
        rect(win.x + win.w - 16 + (sy % 3), sy, 5 - ((sy - horizon) % 3), 1, P.sun[3])
      }
    }
    rect(win.x, shore, win.w, win.y + win.h - shore, P.paper[3])
    rect(win.x, shore, win.w, 1, P.sea[4])
    ctx.restore()

    // Window mullions & sunlit sill
    rect(win.x + Math.floor(win.w / 2) - 1, win.y, 2, win.h, P.wood[0])
    rect(win.x + Math.floor(win.w / 2), win.y, 1, win.h, P.wood[3])
    rect(win.x - 3, win.y + win.h, win.w + 6, 3, P.stone[0])
    rect(win.x - 2, win.y + win.h, win.w + 4, 2, P.stone[3])
    rect(win.x - 2, win.y + win.h, win.w + 4, 1, P.sun[3])
  }

  // 4. Wood wainscoting (lower wall) & dado rail
  rect(0, dadoY, width, floorY - dadoY, P.wood[2])
  for (let x = 2; x < width; x += 6) {
    rect(x, dadoY + 3, 1, floorY - dadoY - 3, P.wood[1])
    rect(x + 1, dadoY + 3, 1, floorY - dadoY - 3, P.wood[3])
  }
  rect(0, dadoY, width, 3, P.wood[0])
  rect(0, dadoY + 1, width, 1, P.wood[4])
  rect(0, floorY - 3, width, 3, P.wood[0])
  rect(0, floorY - 2, width, 1, P.wood[1])

  // 5. Wood floor planks + woven studio rug
  rect(0, floorY, width, height - floorY, P.wood[2])
  for (let y = floorY; y < height; y += 7) {
    rect(0, y, width, 1, P.wood[0])
    rect(0, y + 1, width, 1, P.wood[3])
    for (let x = (y * 9) % 41; x < width; x += 47) {
      rect(x, y + 2, 1, 5, P.wood[1])
      rect(x + 14, y + 4, 10, 1, P.wood[1])
    }
  }

  const rug = portrait ? { x: 34, y: 158, w: 112, h: 52 } : { x: 86, y: 122, w: 132, h: 46 }
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

  // 6. Hanging studio workshop lamps with warm bulb glow
  const flicker = Math.floor(frame / 4) % 3
  for (const lamp of layout.lamps) {
    for (let y = ceilingBottom; y < lamp.y + 1; y++) {
      rect(lamp.x + 4, y, 2, 1, P.stone[0])
    }
    rect(lamp.x + 1, lamp.y + 7, 8, 2, P.sun[3])
    rect(lamp.x + 2, lamp.y + 9, 6, 1, P.sun[2])
    drawSprite(ctx, studioSprites.lamp, lamp.x, lamp.y)
    if (flicker === 0) rect(lamp.x + 4, lamp.y + 7, 2, 1, P.paper[4])
  }

  // 7. Upstairs stairs on the left leading up to the porch doorway
  const stairs = layout.upstairs
  const doorW = portrait ? 17 : 20
  const doorH = portrait ? 23 : 26
  rect(stairs.x + 1, stairs.y, doorW, doorH, P.wood[0])
  rect(stairs.x + 3, stairs.y + 2, doorW - 4, doorH - 2, P.sun[4])
  rect(stairs.x + 4, stairs.y + 3, doorW - 6, 7, P.sky[5])
  rect(stairs.x + 4, stairs.y + 12, doorW - 6, 2, P.wood[3])
  const steps = portrait ? 5 : 6
  for (let i = 0; i < steps; i++) {
    const sx = stairs.x + 2 + i * (portrait ? 4 : 5)
    const sy = stairs.y + doorH - 2 + i * 5
    const sw = portrait ? 17 : 22
    rect(sx, sy, sw, 6, P.wood[0])
    rect(sx + 1, sy + 1, sw - 2, 2, i < 2 ? P.sun[3] : P.wood[4])
    rect(sx + 1, sy + 3, sw - 2, 2, P.wood[2])
  }
  const railStartX = stairs.x + doorW
  const railStartY = stairs.y + 10
  const railEndX = stairs.x + (portrait ? 26 : 38)
  const railEndY = stairs.y + doorH + steps * 5 - 12
  rect(railStartX, railStartY, 2, 18, P.wood[0])
  rect(railEndX, railEndY, 3, 16, P.wood[0])
  rect(railEndX + 1, railEndY + 1, 1, 14, P.wood[3])
  const spanX = railEndX - railStartX
  const spanY = railEndY - railStartY
  for (let x = 0; x <= spanX; x++) {
    const ry = railStartY + Math.round((x / Math.max(1, spanX)) * spanY)
    rect(railStartX + x, ry, 2, 3, P.wood[0])
    rect(railStartX + x, ry + 1, 1, 1, P.wood[4])
  }

  // 8. Featured Public Board — smaller framed mural on the main wall (~25% smaller)
  const board = layout.publicBoardArt
  const centerX = board.x + Math.floor(board.w / 2)
  for (let i = 0; i < 5; i++) {
    rect(centerX - i * 3, board.y - 4 + Math.floor(i * 0.6), 3, 1, P.wood[0])
    rect(centerX + i * 3 - 1, board.y - 4 + Math.floor(i * 0.6), 3, 1, P.wood[0])
  }
  rect(centerX - 1, board.y - 5, 2, 2, P.sun[3])
  rect(board.x - 2, board.y - 2, board.w + 4, board.h + 4, P.wood[0])
  rect(board.x - 1, board.y - 1, board.w + 2, board.h + 2, P.wood[3])
  rect(board.x, board.y, board.w, board.h, P.paper[4])

  const mx = board.x + 2
  const my = board.y + 2
  const mw = board.w - 4
  const mh = board.h - 4
  const mSkyH = Math.floor(mh * 0.52)
  P.sky.forEach((color, idx) => {
    const bandY = my + Math.floor((idx / P.sky.length) * mSkyH)
    const nextY = my + Math.floor(((idx + 1) / P.sky.length) * mSkyH)
    rect(mx, bandY, mw, Math.max(1, nextY - bandY), color)
  })
  drawSun(ctx, mx + Math.floor(mw * 0.72), my + mSkyH + 1, 5, my + mSkyH)
  const mShore = my + Math.floor(mh * 0.78)
  rect(mx, my + mSkyH, mw, mShore - (my + mSkyH), P.sea[2])
  for (let ry = my + mSkyH + 1; ry < mShore; ry += 2) {
    rect(mx + Math.floor(mw * 0.65) + (ry % 3), ry, 5, 1, P.sun[3])
    rect(mx + 4 + ((ry * 7) % Math.max(6, mw - 14)), ry, 4, 1, P.sea[3])
  }
  rect(mx, mShore, mw, my + mh - mShore, P.paper[3])
  const lx = mx + Math.floor(mw * 0.24)
  rect(lx - 3, my + mSkyH - 2, 8, 2, P.foliage[1])
  rect(lx - 1, my + mSkyH - 9, 3, 7, P.paper[4])
  rect(lx - 1, my + mSkyH - 7, 3, 2, P.flame[1])
  rect(lx, my + mSkyH - 10, 1, 1, P.sun[4])
  const bx = mx + Math.floor(mw * 0.5)
  rect(bx, mShore - 2, 6, 2, P.wood[2])
  rect(bx + 2, mShore - 6, 2, 4, P.paper[4])

  // 9. Landscape Ticket Booth Counter & Workbench + Pegboard
  if (!portrait) {
    // Left Ticket Box: header signboard + counter with slot & brass bell + paneled base
    const booth = layout.joinBooth
    // Wooden support posts & upper sign marquee
    rect(booth.x + 2, booth.y, 3, 14, P.wood[0])
    rect(booth.x + 3, booth.y + 1, 1, 12, P.wood[3])
    rect(booth.x + booth.w - 5, booth.y, 3, 14, P.wood[0])
    rect(booth.x + booth.w - 4, booth.y + 1, 1, 12, P.wood[3])
    // Marquee board ("Got a code?" sits cleanly inside this sign header!)
    rect(booth.x + 1, booth.y, booth.w - 2, 11, P.wood[0])
    rect(booth.x + 2, booth.y + 1, booth.w - 4, 9, P.wood[1])
    rect(booth.x + 3, booth.y + 2, booth.w - 6, 7, P.paper[4])
    // Countertop ledge with slot & service bell
    rect(booth.x - 1, booth.y + 14, booth.w + 2, 6, P.wood[0])
    rect(booth.x, booth.y + 15, booth.w, 3, P.wood[3])
    rect(booth.x, booth.y + 15, booth.w, 1, P.wood[4])
    drawSprite(ctx, studioSprites.bell, booth.x + 4, booth.y + 9)
    drawSprite(ctx, studioSprites.ticketSlot, booth.x + booth.w - 16, booth.y + 14)
    // Paneled booth base below counter with brass ticket-window grille
    rect(booth.x, booth.y + 20, booth.w, booth.h - 20, P.wood[0])
    rect(booth.x + 1, booth.y + 21, booth.w - 2, booth.h - 22, P.wood[2])
    rect(booth.x + 3, booth.y + 23, booth.w - 6, booth.h - 27, P.wood[1])
    // Ticket window opening & brass bars
    rect(booth.x + 8, booth.y + 24, booth.w - 16, 11, P.wood[0])
    rect(booth.x + 9, booth.y + 25, booth.w - 18, 9, P.sky[0])
    for (let gx = booth.x + 14; gx < booth.x + booth.w - 12; gx += 6) {
      rect(gx, booth.y + 25, 1, 9, P.sun[3])
    }
    rect(booth.x + 8, booth.y + 34, booth.w - 16, 2, P.wood[4])
    rect(booth.x + 3, booth.y + booth.h - 5, booth.w - 6, 4, P.wood[0])

    // Right-side studio workbench: Upper supply shelf + wooden pegboard/back board + tabletop
    const bench = layout.workbench
    const boardBox = layout.workbenchBoard
    // Upper supply shelf clearly above the backboard
    rect(bench.x + 2, boardBox.y - 4, bench.w - 4, 3, P.wood[0])
    rect(bench.x + 3, boardBox.y - 3, bench.w - 6, 1, P.wood[4])
    // Clamp lamp attached to left of upper shelf
    rect(bench.x + 3, boardBox.y - 16, 2, 12, P.stone[0])
    rect(bench.x + 4, boardBox.y - 16, 7, 2, P.stone[2])
    rect(bench.x + 9, boardBox.y - 15, 5, 3, P.stone[0])
    rect(bench.x + 10, boardBox.y - 14, 3, 1, P.sun[4])
    // Paint jars, swatch frame & brush jar standing on upper shelf
    rect(bench.x + 16, boardBox.y - 11, 5, 7, P.wood[0])
    rect(bench.x + 17, boardBox.y - 10, 3, 5, P.flame[1])
    rect(bench.x + 23, boardBox.y - 12, 5, 8, P.wood[0])
    rect(bench.x + 24, boardBox.y - 11, 3, 6, P.sea[3])
    rect(bench.x + 30, boardBox.y - 10, 5, 6, P.wood[0])
    rect(bench.x + 31, boardBox.y - 9, 3, 4, P.sun[3])
    rect(bench.x + 40, boardBox.y - 15, 13, 11, P.wood[0])
    rect(bench.x + 41, boardBox.y - 14, 11, 9, P.paper[4])
    rect(bench.x + 43, boardBox.y - 12, 3, 5, P.flame[2])
    rect(bench.x + 47, boardBox.y - 12, 3, 5, P.sea[3])
    drawSprite(ctx, studioSprites.brushJar, bench.x + bench.w - 15, boardBox.y - 12)

    // Workbench framed pegboard / back board (holds the pinned "Set up an easel" order sheet)
    rect(boardBox.x, boardBox.y, boardBox.w, boardBox.h, P.wood[0])
    rect(boardBox.x + 1, boardBox.y + 1, boardBox.w - 2, boardBox.h - 2, P.wood[2])
    rect(boardBox.x + 2, boardBox.y + 2, boardBox.w - 4, boardBox.h - 4, P.wood[1])

    // Workbench tabletop & solid legs
    rect(bench.x, floorY, bench.w, 6, P.wood[0])
    rect(bench.x + 1, floorY + 1, bench.w - 2, 3, P.wood[3])
    rect(bench.x + 1, floorY + 1, bench.w - 2, 1, P.wood[4])
    rect(bench.x + 4, floorY + 6, 5, 48, P.wood[0])
    rect(bench.x + 5, floorY + 6, 3, 48, P.wood[2])
    rect(bench.x + bench.w - 9, floorY + 6, 5, 48, P.wood[0])
    rect(bench.x + bench.w - 8, floorY + 6, 3, 48, P.wood[2])
    // Paint cans & rolled canvas tucked underneath workbench
    drawPaintCan(rect, bench.x + 14, floorY + 34, P.sea[3])
    drawPaintCan(rect, bench.x + 26, floorY + 36, P.flame[1])
  }

  // 10. Studio stools & paint cans around the rug so the studio always feels inhabited
  if (portrait) {
    drawStool(rect, 29, 204)
    drawStool(rect, 136, 206)
    drawPaintCan(rect, 46, 212, P.flame[1])
    drawPaintCan(rect, 124, 214, P.sea[3])
    // Corner floor palette crate on bottom right
    rect(128, 224, 22, 12, P.wood[0])
    rect(129, 225, 20, 10, P.wood[3])
    rect(131, 227, 16, 6, P.wood[1])
  } else {
    drawStool(rect, 72, 148)
    drawStool(rect, 213, 146)
    drawPaintCan(rect, 88, 158, P.flame[1])
    drawPaintCan(rect, 206, 159, P.sun[4])
  }

  // 11. Potted studio plant grounded solidly on the floor
  rect(layout.plant.x + 1, layout.plant.y + 8, 8, 1, P.wood[0])
  drawSprite(ctx, studioSprites.plant, layout.plant.x, layout.plant.y)

  // 12. Room Easels on the studio rug (or 2-3 cloth-draped spare easels when 0 custom rooms exist)
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
