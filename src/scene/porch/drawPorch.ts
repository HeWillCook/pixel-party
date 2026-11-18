import { P } from '../palette'
import { drawSea, drawSun, drawSunsetSky, mulberry32 } from '../procedural'
import { drawSprite } from '../sprite'
import { porchLayout } from './layout'
import { sprites } from './sprites'

export interface PorchOptions {
  easelState: 'draped' | 'cover' | 'finished' | 'signin'
  bob: boolean
  soundOn?: boolean
  signedIn?: boolean
  roofTop?: number
}

export function drawPorchRoof(ctx: CanvasRenderingContext2D, roofTop: number): void {
  const width = ctx.canvas.width
  const rect = (x: number, y: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h) }
  rect(0, roofTop, width, 18, P.wood[1])
  for (let x = 0; x < width; x += 18) { rect(x, roofTop, 3, 8, P.wood[0]); rect(x + 3, roofTop, 1, 8, P.wood[2]); rect(x, roofTop + 13, 3, 5, P.wood[0]) }
  rect(0, roofTop + 7, width, 6, P.wood[0]); rect(0, roofTop + 8, width, 4, P.wood[2]); rect(0, roofTop + 12, width, 1, P.wood[4])
}

export function drawPorch(ctx: CanvasRenderingContext2D, frame: number, opts: PorchOptions): void {
  const portrait = ctx.canvas.height > ctx.canvas.width
  const layout = porchLayout[portrait ? 'portrait' : 'landscape']
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  const horizon = portrait ? 140 : 100
  const floor = portrait ? 267 : 154
  const sunX = portrait ? 131 : 232
  const rect = (x: number, y: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h) }
  ctx.imageSmoothingEnabled = false
  drawSunsetSky(ctx, width, horizon, frame)
  for (let band = 1; band < 6; band++) {
    const y = Math.floor(horizon * band / 6)
    for (let row = -2; row < 2; row++) for (let x = (row & 1); x < width; x += 2) rect(x, y + row, 1, 1, P.sky[band])
  }
  for (let y = 9; y < 14; y++) for (let x = y % 2; x < width; x += 2) rect(x, y, 1, 1, P.sky[1])
  drawSun(ctx, sunX, horizon + 1, portrait ? 20 : 24, horizon)
  const clouds = portrait ? [[22, 54, 54], [81, 81, 58], [31, 102, 39]] : [[30, 52, 68], [160, 65, 78], [206, 79, 66], [100, 86, 59], [92, 30, 45], [235, 40, 53]]
  for (const [x, y, w] of clouds) {
    rect(x + 7, y, w - 14, 1, P.sky[4]); rect(x, y + 1, w, 2, P.sky[4]); rect(x + 12, y + 3, w - 28, 1, P.sky[3])
  }
  drawSea(ctx, width, horizon, height - horizon, sunX, frame, mulberry32(394))
  const shore = floor - (portrait ? 37 : 36)
  for (let y = horizon + 2; y < shore; y += 3) {
    const spread = Math.max(2, Math.floor((y - horizon) * 0.65))
    const phase = Math.floor(frame / 6)
    for (let index = 0; index < 3; index++) {
      const x = sunX - spread + ((y * (index + 3) + index * 17 + phase) % (spread * 2))
      rect(x, y, 3 + (index + y) % 4, 1, index === 1 ? P.sun[3] : P.sun[2])
    }
  }
  rect(0, shore, width, floor - shore, P.paper[3])
  rect(0, shore + 5, width, floor - shore - 5, P.paper[4])
  for (let row = 3; row < 5; row++) for (let x = row % 2; x < width; x += 2) rect(x, shore + row, 1, 1, P.paper[4])
  for (let x = 0; x < width; x += 9) {
    const offset = (x + Math.floor(frame / 8) * 2) % width
    rect(offset, shore - 1, 7, 1, P.sea[4]); rect(offset + 1, shore + (x % 3 === 0 ? 0 : 1), 5, 1, P.paper[4])
  }
  if (!portrait) { rect(104, shore + 4, 10, 1, P.wood[2]); rect(106, shore + 3, 4, 1, P.wood[3]); rect(111, shore + 5, 5, 1, P.wood[1]) }
  for (const x of [18, 47, width - 50, width - 22]) {
    const grassY = portrait ? floor - 8 : shore + 4
    rect(x, grassY, 1, 7, P.foliage[2]); rect(x - 2, grassY + 2, 1, 5, P.foliage[3]); rect(x + 2, grassY + 3, 1, 4, P.foliage[2])
  }
  if (!portrait) {
    rect(0, floor - 25, width, 25, P.wood[4])
    rect(0, floor - 25, width, 2, P.wood[3])
    for (let x = 22; x < width; x += 29) {
      const y = floor - 18 + (x % 5)
      rect(x, y, 3, 1, P.wood[3]); rect(x + 2, y + 1, 2, 1, P.wood[3])
    }
  }
  const islandX = layout.lighthouse.x - 15
  for (let x = 0; x < 55; x++) {
    const rise = Math.round(Math.sin(x / 55 * Math.PI) * 6)
    rect(islandX + x, horizon - rise, 1, rise + 1, P.sky[2])
  }
  const towerY = horizon - sprites.lighthouse.h
  for (let x = 0; x < 27; x++) {
    const middle = towerY + 4 + Math.round(Math.sin(frame / 50) * x / 14)
    const radius = Math.floor(x / 7)
    for (let y = -radius; y <= radius; y++) if ((x + y) % 2 === 0) rect(layout.lighthouse.x + 10 + x, middle + y, 1, 1, P.sky[4])
  }
  drawSprite(ctx, sprites.lighthouse, layout.lighthouse.x, towerY)

  for (const x of [0, width - 9]) {
    rect(x, 8, 9, floor - 8, P.wood[0]); rect(x + 2, 8, 4, floor - 8, P.wood[2]); rect(x + 6, 8, 1, floor - 8, P.wood[4])
    for (let y = 19; y < floor; y += 27) rect(x + 3, y, 1, 10, P.wood[1])
  }
  rect(0, floor - 29, width, 4, P.wood[1]); rect(0, floor - 29, width, 1, P.wood[4])
  for (let x = 11; x < width - 9; x += 11) {
    rect(x, floor - 25, 3, 25, P.wood[1]); rect(x + 2, floor - 25, 1, 25, P.wood[3])
  }
  rect(0, floor - 3, width, 3, P.wood[1]); rect(0, floor, width, height - floor, P.wood[2])
  for (let y = floor; y < height; y += 7) {
    rect(0, y, width, 1, P.wood[0]); rect(0, y + 1, width, 1, P.wood[3])
    for (let x = (y * 7) % 45; x < width; x += 53) { rect(x, y + 3, 17, 1, P.wood[1]); rect(x + 20, y + 5, 8, 1, P.wood[3]) }
  }
  if (!portrait) {
    for (const [center, radius] of [[172, 19], [264, 17]]) for (let row = 0; row < 4; row++) {
      const span = radius - Math.abs(row * 2 - 3) * 2
      for (let x = center - span + row % 2; x <= center + span; x += 2) rect(x, floor + 1 + row, 1, 1, P.wood[0])
    }
  }

  const wallWidth = portrait ? 42 : 55
  rect(0, 8, wallWidth, floor - 8, P.wood[2])
  for (let y = 12; y < floor; y += 7) { rect(0, y, wallWidth, 1, P.wood[1]); rect(0, y + 1, wallWidth, 1, P.wood[3]) }
  rect(wallWidth - 5, 8, 5, floor - 8, P.wood[0]); rect(wallWidth - 3, 8, 2, floor - 8, P.wood[4])
  const roofTop = opts.roofTop ?? 0
  drawPorchRoof(ctx, roofTop)
  if (!portrait) {
    rect(19, 38, 25, 32, P.wood[0]); rect(21, 40, 21, 28, P.wood[3]); rect(23, 42, 17, 24, P.sun[3])
    rect(30, 42, 2, 24, P.wood[1]); rect(23, 53, 17, 2, P.wood[1])
  }
  const gallery = layout.gallery
  for (let offset = 0; offset < 3; offset++) {
    const x = gallery.x + offset * 3, y = gallery.y + (2 - offset) * 2
    rect(x, y, 17, 24, P.wood[0]); rect(x + 1, y + 1, 15, 22, P.wood[4]); rect(x + 3, y + 3, 11, 18, P.paper[3])
  }
  rect(gallery.x + 9, gallery.y + 6, 8, 7, P.sky[3]); rect(gallery.x + 9, gallery.y + 13, 8, 6, P.sea[2]); rect(gallery.x + 14, gallery.y + 8, 2, 2, P.sun[4])

  const board = layout.chalkboard
  const boardY = board.y + (opts.bob ? [0, 0, 1, 1, 0, 0, -1, -1][Math.floor(frame / 5) % 8] : 0)
  for (let y = 0; y < board.h - 5; y++) {
    const spread = Math.floor(y * 0.32)
    rect(board.x + Math.floor(board.w / 2) - spread - 2, boardY + y, 2, 1, P.wood[0])
    rect(board.x + Math.floor(board.w / 2) + spread, boardY + y, 2, 1, P.wood[3])
  }
  rect(board.x + 2, boardY + 3, board.w - 4, board.h - 20, P.wood[0]); rect(board.x + 4, boardY + 5, board.w - 8, board.h - 24, P.wood[3])
  rect(board.x + 6, boardY + 7, board.w - 12, board.h - 28, P.foliage[0])
  rect(board.x + 3, boardY + board.h - 18, board.w - 6, 2, P.wood[2])
  for (const offset of [6, Math.floor(board.w / 2) - 2, board.w - 10]) {
    rect(board.x + offset, boardY + board.h - 9, 5, 5, P.stone[0]); rect(board.x + offset + 1, boardY + board.h - 8, 3, 2, P.stone[2])
    rect(board.x + offset + 1, boardY + board.h - 4, 3, 3 + (Math.floor(frame / 3 + offset) % 2), P.flame[1]); rect(board.x + offset + 2, boardY + board.h - 4, 1, 3, P.flame[4])
  }

  const scaledSprite = (key: 'mailbox' | 'radio' | 'plant' | 'lantern', x: number, y: number) => {
    const sprite = sprites[key]
    sprite.rows.forEach((row, rowIndex) => Array.from(row).forEach((pixel, column) => {
      if (pixel !== '.' && !(key === 'mailbox' && pixel === 'r' && opts.signedIn)) rect(x + column * 2, y + rowIndex * 2, 2, 2, sprite.palette[pixel])
    }))
  }
  if (!portrait) {
    const chairX = layout.cat.x - 3, chairY = layout.cat.y - 11
    rect(chairX, chairY, 3, 34, P.wood[0]); rect(chairX + 2, chairY + 3, 28, 2, P.wood[3])
    for (let x = chairX + 4; x < chairX + 29; x += 4) rect(x, chairY + 4, 2, 18, P.wood[2])
    rect(chairX + 2, chairY + 21, 31, 5, P.wood[0]); rect(chairX + 4, chairY + 20, 27, 3, P.paper[2])
    rect(chairX + 4, chairY + 26, 3, 8, P.wood[1]); rect(chairX + 27, chairY + 26, 3, 8, P.wood[1]); rect(chairX, chairY + 33, 34, 2, P.wood[0])
    rect(layout.radio.x, layout.radio.y + 9, 19, 3, P.wood[0]); rect(layout.radio.x + 2, layout.radio.y + 12, 2, floor - layout.radio.y - 12, P.wood[2]); rect(layout.radio.x + 15, layout.radio.y + 12, 2, floor - layout.radio.y - 12, P.wood[2])
    drawSprite(ctx, sprites.radio, layout.radio.x + 1, layout.radio.y)
    if (opts.soundOn) { rect(layout.radio.x + 15, layout.radio.y - 5, 1, 4, P.sun[4]); rect(layout.radio.x + 13, layout.radio.y - 2, 2, 1, P.sun[4]) }
  }
  scaledSprite('mailbox', layout.mailbox.x, layout.mailbox.y)
  if (!portrait) drawSprite(ctx, sprites.plant, layout.plant.x, floor - sprites.plant.h)
  const lanternX = layout.lantern.x
  for (let y = 8; y < layout.lantern.y; y += 2) rect(lanternX + 9, y, 1, 1, P.wood[3])
  scaledSprite('lantern', lanternX, layout.lantern.y)
  if (!portrait) {
    const catY = layout.cat.y + (Math.floor(frame / 12) % 2)
    drawSprite(ctx, sprites.cat, layout.cat.x, catY)
    rect(layout.cat.x + 4, catY + 5, 3, 1, P.fur[0]); rect(layout.cat.x + 19, catY + 8, 4, 1, P.fur[4])
  }
  const note = layout.note
  rect(note.x, note.y, 13, 18, P.wood[0]); rect(note.x + 1, note.y + 1, 11, 15, P.paper[3]); rect(note.x + 6, note.y, 2, 2, P.flame[1])
  for (let y = 4; y < 13; y += 3) rect(note.x + 3, note.y + y, 7, 1, P.paper[0])

  const easel = layout.easel
  const bob = opts.bob ? [0, 0, 1, 1, 0, 0, -1, -1][Math.floor(frame / 5) % 8] : 0
  const ex = easel.x, ey = easel.y + bob
  rect(ex + 32, ey, 4, 108, P.wood[0]); rect(ex + 33, ey, 2, 108, P.wood[3])
  for (let y = 0; y < 108; y++) {
    const spread = Math.floor(y * 0.18)
    rect(ex + 32 - spread, ey + y, 3, 1, P.wood[0]); rect(ex + 34 + spread, ey + y, 3, 1, P.wood[2])
  }
  rect(ex + 11, ey + 18, 47, 61, P.wood[0]); rect(ex + 13, ey + 20, 43, 57, P.wood[3]); rect(ex + 15, ey + 23, 39, 51, opts.easelState === 'draped' ? P.paper[2] : P.paper[4])
  for (let y = ey + 25; y < ey + 73; y += 4) for (let x = ex + 17 + (y % 3); x < ex + 53; x += 7) rect(x, y, 2, 1, P.paper[3])
  rect(ex + 28, ey + 15, 12, 5, P.wood[0]); rect(ex + 30, ey + 16, 8, 2, P.wood[4])
  rect(ex + 4, ey + 78, 61, 4, P.wood[0]); rect(ex + 5, ey + 78, 60, 1, P.wood[4])
  rect(ex + 11, ey + 76, 8, 2, P.stone[2]); rect(ex + 23, ey + 76, 6, 2, P.flame[1]); rect(ex + 45, ey + 75, 9, 1, P.wood[4]); rect(ex + 53, ey + 74, 3, 2, P.stone[1])
  for (const offset of [13, 32, 51]) {
    rect(ex + offset, ey + 103, 7, 7, P.stone[0]); rect(ex + offset + 1, ey + 104, 5, 4, P.stone[2])
    rect(ex + offset + 2, ey + 110, 3, 5 + (Math.floor(frame / 3 + offset) % 3), P.flame[1]); rect(ex + offset + 3, ey + 110, 1, 4, P.flame[4])
  }
  const hatch = layout.hatch
  for (let row = 0; row < 9; row++) {
    const inset = Math.floor((8 - row) / 2)
    rect(hatch.x + inset, hatch.y + row, hatch.w - inset * 2, 1, row === 0 || row === 8 ? P.wood[0] : P.wood[3])
    if (row > 0 && row < 8) { rect(hatch.x + Math.floor(hatch.w / 2), hatch.y + row, 1, 1, P.sun[3]); rect(hatch.x + inset, hatch.y + row, 1, 1, P.wood[0]); rect(hatch.x + hatch.w - inset - 1, hatch.y + row, 1, 1, P.wood[0]) }
  }
  for (const offset of [6, hatch.w - 9]) { rect(hatch.x + offset, hatch.y + 2, 3, 2, P.stone[0]); rect(hatch.x + offset - 1, hatch.y + 6, 4, 1, P.stone[0]) }
  rect(hatch.x + Math.floor(hatch.w / 2) - 3, hatch.y + 5, 2, 2, P.stone[0]); rect(hatch.x + Math.floor(hatch.w / 2) - 2, hatch.y + 5, 1, 1, P.stone[3])
  if (opts.soundOn) { rect(hatch.x + 9, hatch.y - 6, 1, 5, P.sun[4]); rect(hatch.x + 7, hatch.y - 2, 2, 2, P.sun[4]); rect(hatch.x + 11, hatch.y - 6, 3, 1, P.sun[4]) }
}
