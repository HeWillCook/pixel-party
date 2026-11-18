import { P } from '../palette'
import { drawSun } from '../procedural'
import { drawSprite } from '../sprite'
import { studioLayout } from './layout'
import { studioSprites } from './sprites'

export interface StudioDrawOptions {
  easelCount: number
  hasDefaultBoard?: boolean
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

  const ceilingBottom = portrait ? 36 : 12
  const dadoY = portrait ? 132 : 95
  const floorY = portrait ? 168 : 114

  // 1. Basement brick wall with subtle warm lighting under windows and lamps
  rect(0, ceilingBottom, width, dadoY - ceilingBottom, P.fur[1])
  for (let row = 0; row * 5 + ceilingBottom < dadoY; row++) {
    const y = ceilingBottom + row * 5
    rect(0, y, width, 1, P.wood[0])
    const stagger = (row % 2) * 7
    for (let x = stagger; x < width; x += 14) {
      rect(x, y + 1, 1, 4, P.wood[0])
      // Gentle sunset warmth near upper-middle brick courses under windows
      const nearWindow = y < ceilingBottom + 42 && x > 60 && x < width - 50
      if (nearWindow && (row + x) % 3 === 0) {
        rect(x + 2, y + 1, 10, 3, P.wood[2])
      } else if ((row + x) % 5 === 0) {
        rect(x + 2, y + 2, 9, 2, P.wood[1])
      }
      if ((row * 3 + x) % 7 === 0) rect(x + 3, y + 1, 6, 1, P.fur[2])
    }
  }

  // 2. High basement windows showing beach, sea & sunset outside
  for (let idx = 0; idx < layout.windows.length; idx++) {
    const win = layout.windows[idx]
    // Outer stone/wood window well & sill
    rect(win.x - 2, win.y - 2, win.w + 4, win.h + 5, P.wood[0])
    rect(win.x - 1, win.y - 1, win.w + 2, win.h + 2, P.stone[1])

    ctx.save()
    ctx.beginPath()
    ctx.rect(win.x, win.y, win.w, win.h)
    ctx.clip()
    const horizon = win.y + 11
    const shore = win.y + 17
    const skyColors = [P.sky[1], P.sky[2], P.sky[3], P.sky[4], P.sky[5]]
    for (let row = 0; row < 11; row++) {
      const color = skyColors[Math.min(skyColors.length - 1, Math.floor((row / 11) * skyColors.length))]
      rect(win.x, win.y + row, win.w, 1, color)
    }
    if (idx === layout.windows.length - 1) {
      drawSun(ctx, win.x + win.w - 14, horizon + 1, 7, horizon)
    } else if (idx === 0) {
      rect(win.x + 10, horizon - 4, 16, 4, P.sky[2])
      rect(win.x + 16, horizon - 9, 3, 5, P.paper[3])
      rect(win.x + 16, horizon - 7, 3, 2, P.flame[1])
      rect(win.x + 17, horizon - 10, 1, 1, P.sun[4])
    }
    rect(win.x, horizon, win.w, shore - horizon, P.sea[1])
    const phase = Math.floor(frame / 5)
    for (let sy = horizon + 1; sy < shore; sy += 2) {
      rect(win.x + ((sy * 7 + phase) % Math.max(4, win.w - 8)), sy, 6, 1, P.sea[3])
      if (idx === layout.windows.length - 1) {
        rect(win.x + win.w - 17 + (sy % 3), sy, 6 - (sy - horizon) % 3, 1, P.sun[3])
      }
    }
    rect(win.x, shore, win.w, win.y + win.h - shore, P.paper[3])
    rect(win.x, shore, win.w, 1, P.sea[4])
    ctx.restore()

    // Window frame mullions & sun-warmed sill
    rect(win.x + Math.floor(win.w / 2) - 1, win.y, 2, win.h, P.wood[0])
    rect(win.x + Math.floor(win.w / 2), win.y, 1, win.h, P.wood[3])
    rect(win.x - 3, win.y + win.h, win.w + 6, 3, P.stone[0])
    rect(win.x - 2, win.y + win.h, win.w + 4, 2, P.stone[3])
    rect(win.x - 2, win.y + win.h, win.w + 4, 1, P.sun[3])
  }

  // 3. Ceiling rafters & beams (top)
  rect(0, 0, width, ceilingBottom, P.wood[0])
  rect(0, 2, width, ceilingBottom - 4, P.wood[1])
  for (let x = 8; x < width; x += 28) {
    rect(x, 0, 5, ceilingBottom, P.wood[0])
    rect(x + 1, 0, 3, ceilingBottom - 1, P.wood[2])
    rect(x + 3, 0, 1, ceilingBottom - 1, P.wood[3])
  }
  rect(0, ceilingBottom - 2, width, 2, P.wood[0])
  rect(0, ceilingBottom - 1, width, 1, P.wood[2])

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

  // 5. Wood floor planks + cosy woven studio rug
  rect(0, floorY, width, height - floorY, P.wood[2])
  for (let y = floorY; y < height; y += 7) {
    rect(0, y, width, 1, P.wood[0])
    rect(0, y + 1, width, 1, P.wood[3])
    for (let x = (y * 9) % 41; x < width; x += 47) {
      rect(x, y + 2, 1, 5, P.wood[1])
      rect(x + 14, y + 4, 10, 1, P.wood[1])
    }
  }

  const rug = portrait ? { x: 35, y: 176, w: 110, h: 66 } : { x: 93, y: 122, w: 126, h: 38 }
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

  // 6. Hanging studio workshop lamps with subtle warm bulb glow
  const flicker = Math.floor(frame / 4) % 3
  for (const lamp of layout.lamps) {
    for (let y = ceilingBottom; y < lamp.y + 1; y++) {
      rect(lamp.x + 4, y, 2, 1, P.stone[0])
    }
    // Soft warm glow ring right beneath lamp shade (no harsh grid)
    rect(lamp.x + 1, lamp.y + 7, 8, 2, P.sun[3])
    rect(lamp.x + 2, lamp.y + 9, 6, 1, P.sun[2])
    drawSprite(ctx, studioSprites.lamp, lamp.x, lamp.y)
    if (flicker === 0) rect(lamp.x + 4, lamp.y + 7, 2, 1, P.paper[4])
  }

  // 7. Upstairs stairs on the left side leading up to the porch doorway
  const stairs = layout.upstairs
  const doorW = portrait ? 18 : 22
  const doorH = portrait ? 26 : 30
  rect(stairs.x + 1, stairs.y, doorW, doorH, P.wood[0])
  rect(stairs.x + 3, stairs.y + 2, doorW - 4, doorH - 2, P.sun[4])
  rect(stairs.x + 4, stairs.y + 3, doorW - 6, 8, P.sky[5])
  rect(stairs.x + 4, stairs.y + 13, doorW - 6, 2, P.wood[3])
  const steps = portrait ? 6 : 7
  for (let i = 0; i < steps; i++) {
    const sx = stairs.x + 2 + i * (portrait ? 4 : 6)
    const sy = stairs.y + doorH - 2 + i * 5
    const sw = portrait ? 18 : 24
    rect(sx, sy, sw, 6, P.wood[0])
    rect(sx + 1, sy + 1, sw - 2, 2, i < 2 ? P.sun[3] : P.wood[4])
    rect(sx + 1, sy + 3, sw - 2, 2, P.wood[2])
  }
  // Solid stepped wooden handrail & posts
  const railStartX = stairs.x + doorW
  const railStartY = stairs.y + 11
  const railEndX = stairs.x + (portrait ? 28 : 42)
  const railEndY = stairs.y + doorH + steps * 5 - 13
  rect(railStartX, railStartY, 2, 20, P.wood[0])
  rect(railEndX, railEndY, 3, 18, P.wood[0])
  rect(railEndX + 1, railEndY + 1, 1, 16, P.wood[3])
  const spanX = railEndX - railStartX
  const spanY = railEndY - railStartY
  for (let x = 0; x <= spanX; x++) {
    const ry = railStartY + Math.round((x / Math.max(1, spanX)) * spanY)
    rect(railStartX + x, ry, 2, 3, P.wood[0])
    rect(railStartX + x, ry + 1, 1, 1, P.wood[4])
  }

  // 8. Potted studio plant
  drawSprite(ctx, studioSprites.plant, layout.plant.x, layout.plant.y)

  // 9. Featured Public Board — big framed communal canvas on the main wall
  const board = layout.publicBoardArt
  const centerX = board.x + Math.floor(board.w / 2)
  for (let i = 0; i < 6; i++) {
    rect(centerX - i * 3, board.y - 5 + Math.floor(i * 0.7), 3, 1, P.wood[0])
    rect(centerX + i * 3 - 1, board.y - 5 + Math.floor(i * 0.7), 3, 1, P.wood[0])
  }
  rect(centerX - 1, board.y - 6, 2, 2, P.sun[3])
  rect(board.x - 3, board.y - 3, board.w + 6, board.h + 6, P.wood[0])
  rect(board.x - 2, board.y - 2, board.w + 4, board.h + 4, P.wood[2])
  rect(board.x - 1, board.y - 1, board.w + 2, board.h + 2, P.wood[4])
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
  drawSun(ctx, mx + Math.floor(mw * 0.72), my + mSkyH + 1, 7, my + mSkyH)
  const mShore = my + Math.floor(mh * 0.78)
  rect(mx, my + mSkyH, mw, mShore - (my + mSkyH), P.sea[2])
  for (let ry = my + mSkyH + 2; ry < mShore; ry += 2) {
    rect(mx + Math.floor(mw * 0.65) + (ry % 3), ry, 6, 1, P.sun[3])
    rect(mx + 6 + ((ry * 7) % Math.max(8, mw - 18)), ry, 5, 1, P.sea[3])
  }
  rect(mx, mShore, mw, my + mh - mShore, P.paper[3])
  const lx = mx + Math.floor(mw * 0.24)
  rect(lx - 4, my + mSkyH - 2, 10, 3, P.foliage[1])
  rect(lx - 1, my + mSkyH - 12, 4, 10, P.paper[4])
  rect(lx - 1, my + mSkyH - 9, 4, 2, P.flame[1])
  rect(lx - 1, my + mSkyH - 5, 4, 2, P.flame[1])
  rect(lx, my + mSkyH - 14, 2, 2, P.sun[4])
  const bx = mx + Math.floor(mw * 0.5)
  rect(bx, mShore - 3, 7, 2, P.wood[2])
  rect(bx + 2, mShore - 8, 3, 5, P.paper[4])

  // 10. Landscape-only Ticket Booth & Workbench props drawn in scene
  if (!portrait) {
    // Ticket booth / Slot box by the stairs
    const booth = layout.joinBooth
    rect(booth.x, booth.y, booth.w, booth.h, P.wood[0])
    rect(booth.x + 1, booth.y + 1, booth.w - 2, booth.h - 2, P.wood[2])
    rect(booth.x + 2, booth.y + 2, booth.w - 4, 6, P.wood[3])
    rect(booth.x + 2, booth.y + 2, booth.w - 4, 1, P.wood[4])
    drawSprite(ctx, studioSprites.ticketSlot, booth.x + Math.floor(booth.w / 2) - 5, booth.y + 2)

    // Right-side studio workbench & wooden supply shelf
    const bench = layout.workbench
    // Wooden upper supply shelf with paint jars & mini framed sketch
    rect(bench.x + 3, bench.y + 12, bench.w - 6, 3, P.wood[0])
    rect(bench.x + 4, bench.y + 13, bench.w - 8, 1, P.wood[4])
    // Paint tubes / jars on shelf
    rect(bench.x + 8, bench.y + 5, 5, 7, P.wood[0])
    rect(bench.x + 9, bench.y + 6, 3, 5, P.flame[1])
    rect(bench.x + 15, bench.y + 4, 5, 8, P.wood[0])
    rect(bench.x + 16, bench.y + 5, 3, 6, P.sea[3])
    rect(bench.x + 22, bench.y + 6, 5, 6, P.wood[0])
    rect(bench.x + 23, bench.y + 7, 3, 4, P.sun[3])
    // Small framed color-swatch study pinned on wall above bench
    rect(bench.x + 36, bench.y + 1, 14, 11, P.wood[0])
    rect(bench.x + 37, bench.y + 2, 12, 9, P.paper[4])
    rect(bench.x + 39, bench.y + 4, 3, 5, P.flame[2])
    rect(bench.x + 43, bench.y + 4, 4, 5, P.sea[3])
    // Clamp lamp attached to left edge of shelf & brush jar on right
    rect(bench.x + 2, bench.y + 1, 2, 12, P.stone[0])
    rect(bench.x + 3, bench.y + 1, 6, 2, P.stone[2])
    rect(bench.x + 7, bench.y + 2, 5, 3, P.stone[0])
    rect(bench.x + 8, bench.y + 3, 3, 1, P.sun[4])
    drawSprite(ctx, studioSprites.brushJar, bench.x + bench.w - 16, bench.y + 4)

    // Workbench tabletop & solid legs
    rect(bench.x, 114, bench.w, 6, P.wood[0])
    rect(bench.x + 1, 115, bench.w - 2, 3, P.wood[3])
    rect(bench.x + 1, 115, bench.w - 2, 1, P.wood[4])
    rect(bench.x + 4, 120, 5, 44, P.wood[0])
    rect(bench.x + 5, 120, 3, 44, P.wood[2])
    rect(bench.x + bench.w - 9, 120, 5, 44, P.wood[0])
    rect(bench.x + bench.w - 8, 120, 3, 44, P.wood[2])
  }

  // 11. Room Easels around the studio rug (up to visible slots)
  const visibleEasels = Math.min(opts.easelCount, layout.easels.length)
  for (let i = 0; i < visibleEasels; i++) {
    const slot = layout.easels[i]
    const cx = slot.x + Math.floor(slot.w / 2)
    const topY = slot.y + 2
    const easelH = portrait ? 52 : 42
    rect(cx - 10, topY + easelH - 1, 20, 1, P.wood[0])
    for (let y = 0; y < easelH; y++) {
      const spread = Math.floor(y * 0.24)
      rect(cx - 1, topY + y, 2, 1, P.wood[1])
      rect(cx - 2 - spread, topY + y, 2, 1, P.wood[0])
      rect(cx + 1 + spread, topY + y, 2, 1, P.wood[2])
    }
    const art = studioSprites.easelMini[i % studioSprites.easelMini.length]
    const artX = cx - Math.floor(art.w / 2)
    const artY = topY + 6
    drawSprite(ctx, art, artX, artY)
    rect(cx - 3, artY - 2, 6, 3, P.wood[0])
    rect(cx - 2, artY - 1, 4, 1, P.wood[4])
    rect(artX - 2, artY + art.h, art.w + 4, 3, P.wood[0])
    rect(artX - 1, artY + art.h, art.w + 2, 1, P.wood[4])
    rect(artX + 2, artY + art.h - 1, 2, 1, P.flame[1])
    rect(artX + 6, artY + art.h - 1, 2, 1, P.sea[3])
    rect(artX + 10, artY + art.h - 1, 2, 1, P.sun[4])
  }

  // If 0 custom rooms, draw one folded/draped spare easel standing on the studio rug
  if (visibleEasels === 0 && layout.easels[0]) {
    const slot = layout.easels[1] ?? layout.easels[0]
    const cx = slot.x + Math.floor(slot.w / 2)
    const topY = slot.y + 2
    const easelH = portrait ? 52 : 42
    rect(cx - 9, topY + easelH - 1, 18, 1, P.wood[0])
    for (let y = 0; y < easelH; y++) {
      const spread = Math.floor(y * 0.18)
      rect(cx - 1, topY + y, 2, 1, P.wood[1])
      rect(cx - 2 - spread, topY + y, 2, 1, P.wood[0])
      rect(cx + 1 + spread, topY + y, 2, 1, P.wood[2])
    }
    rect(cx - 7, topY + 5, 14, 15, P.wood[0])
    rect(cx - 6, topY + 6, 12, 13, P.paper[2])
    rect(cx - 8, topY + 20, 16, 2, P.wood[0])
  }
}
