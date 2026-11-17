import { P } from '../palette'
import { drawSea, drawSun, drawSunsetSky, mulberry32 } from '../procedural'
import { drawSprite } from '../sprite'
import { porchLayout } from './layout'
import { sprites } from './sprites'

export interface PorchOptions {
  easelState: 'draped' | 'cover' | 'finished' | 'signin'
  bob: boolean
  soundOn?: boolean
}

export function drawPorch(ctx: CanvasRenderingContext2D, frame: number, opts: PorchOptions): void {
  const portrait = ctx.canvas.height > ctx.canvas.width
  const layout = porchLayout[portrait ? 'portrait' : 'landscape']
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  const horizon = portrait ? 140 : 100
  const floor = portrait ? 267 : 149
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
  for (let y = horizon + 2; y < floor; y += 3) {
    const spread = Math.max(2, Math.floor((y - horizon) * 0.65))
    const phase = Math.floor(frame / 6)
    for (let index = 0; index < 3; index++) {
      const x = sunX - spread + ((y * (index + 3) + index * 17 + phase) % (spread * 2))
      rect(x, y, 3 + (index + y) % 4, 1, index === 1 ? P.sun[3] : P.sun[2])
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

  rect(0, 0, width, 8, P.wood[0]); rect(0, 5, width, 2, P.wood[2]); rect(0, 7, width, 1, P.wood[4])
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

  const door = layout.door
  rect(door.x, door.y, door.w, door.h, P.wood[0]); rect(door.x + 3, door.y + 3, door.w - 6, door.h - 6, P.wood[1])
  rect(door.x + 5, door.y + 7, door.w - 10, 22, P.wood[3]); rect(door.x + 7, door.y + 9, door.w - 14, 18, P.sun[3])
  rect(door.x + 12, door.y + 9, 2, 18, P.wood[1]); rect(door.x + 7, door.y + 17, door.w - 14, 2, P.wood[1])
  for (let y = door.y + 38; y < door.y + door.h - 9; y += 25) { rect(door.x + 6, y, door.w - 12, 19, P.wood[0]); rect(door.x + 8, y + 2, door.w - 16, 15, P.wood[2]) }
  rect(door.x + door.w - 8, door.y + 64, 2, 3, P.sun[4])

  const board = layout.chalkboard
  rect(board.x + 3, board.y + 8, 3, board.h - 4, P.wood[0]); rect(board.x + board.w - 6, board.y + 8, 3, board.h - 4, P.wood[0])
  rect(board.x, board.y, board.w, board.h - 10, P.wood[0]); rect(board.x + 2, board.y + 2, board.w - 4, board.h - 14, P.wood[3])
  rect(board.x + 5, board.y + 5, board.w - 10, board.h - 20, P.foliage[0])
  for (let x = board.x + 8; x < board.x + board.w - 8; x += 7) rect(x, board.y + board.h - 24 + (x % 2), 1, 1, P.foliage[1])
  rect(board.x + 3, board.y + board.h - 12, board.w - 6, 3, P.wood[2])

  const scaledSprite = (key: 'mailbox' | 'radio' | 'plant' | 'lantern', x: number, y: number) => {
    const sprite = sprites[key]
    sprite.rows.forEach((row, rowIndex) => Array.from(row).forEach((pixel, column) => {
      if (pixel !== '.') rect(x + column * 2, y + rowIndex * 2, 2, 2, sprite.palette[pixel])
    }))
  }
  rect(layout.radio.x + 3, layout.radio.y + 17, 25, 8, P.wood[0]); rect(layout.radio.x + 5, layout.radio.y + 19, 21, 5, P.wood[2])
  rect(layout.radio.x + 5, layout.radio.y + 25, 3, Math.max(0, floor - layout.radio.y - 25), P.wood[1])
  rect(layout.radio.x + 24, layout.radio.y + 25, 3, Math.max(0, floor - layout.radio.y - 25), P.wood[3])
  scaledSprite('radio', layout.radio.x, layout.radio.y)
  if (opts.soundOn) {
    rect(layout.radio.x + 26, layout.radio.y - 8, 1, 7, P.sun[4]); rect(layout.radio.x + 24, layout.radio.y - 3, 2, 2, P.sun[4]); rect(layout.radio.x + 27, layout.radio.y - 8, 3, 1, P.sun[4])
  }
  scaledSprite('mailbox', layout.mailbox.x, layout.mailbox.y)
  rect(layout.mailbox.x + 7, layout.mailbox.y + 24, 4, Math.max(0, floor - layout.mailbox.y - 24), P.wood[1])
  rect(layout.plant.x, layout.plant.y + 20, 26, 2, P.wood[3])
  if (portrait) {
    rect(layout.plant.x + 3, layout.plant.y + 22, 2, Math.max(0, floor - layout.plant.y - 22), P.wood[1])
    rect(layout.plant.x + 22, layout.plant.y + 22, 2, Math.max(0, floor - layout.plant.y - 22), P.wood[3])
  }
  scaledSprite('plant', layout.plant.x, layout.plant.y)
  const lanternX = layout.lantern.x
  for (let y = 8; y < layout.lantern.y; y += 2) rect(lanternX + 9, y, 1, 1, P.wood[3])
  scaledSprite('lantern', lanternX, layout.lantern.y)
  const catY = layout.cat.y + (Math.floor(frame / 12) % 2)
  drawSprite(ctx, sprites.cat, layout.cat.x, catY)
  rect(layout.cat.x + 4, catY + 5, 3, 1, P.fur[0])
  rect(layout.cat.x + 19, catY + 8, 4, 1, P.fur[4])
  const note = layout.note
  rect(note.x, note.y, 13, 18, P.wood[0]); rect(note.x + 1, note.y + 1, 11, 15, P.paper[3]); rect(note.x + 6, note.y, 2, 2, P.flame[1])
  for (let y = 4; y < 13; y += 3) rect(note.x + 3, note.y + y, 7, 1, P.paper[0])

  const easel = layout.easel
  const bob = opts.bob ? [0, 0, 1, 1, 0, 0, -1, -1][Math.floor(frame / 5) % 8] : 0
  const ex = easel.x, ey = easel.y + bob
  rect(ex + 32, ey, 4, 100, P.wood[0]); rect(ex + 33, ey, 2, 100, P.wood[3])
  for (let y = 0; y < 101; y++) {
    const spread = Math.floor(y * 0.22)
    rect(ex + 32 - spread, ey + y, 3, 1, P.wood[0]); rect(ex + 34 + spread, ey + y, 3, 1, P.wood[2])
  }
  rect(ex + 11, ey + 18, 47, 61, P.wood[0]); rect(ex + 13, ey + 20, 43, 57, P.wood[3]); rect(ex + 15, ey + 23, 39, 51, opts.easelState === 'draped' ? P.paper[2] : P.paper[4])
  for (let y = ey + 25; y < ey + 73; y += 4) for (let x = ex + 17 + (y % 3); x < ex + 53; x += 7) rect(x, y, 2, 1, P.paper[3])
  rect(ex + 28, ey + 15, 12, 5, P.wood[0]); rect(ex + 30, ey + 16, 8, 2, P.wood[4])
  rect(ex + 4, ey + 78, 61, 4, P.wood[0]); rect(ex + 5, ey + 78, 60, 1, P.wood[4])
  rect(ex + 11, ey + 76, 8, 2, P.stone[2]); rect(ex + 23, ey + 76, 6, 2, P.flame[1]); rect(ex + 45, ey + 75, 9, 1, P.wood[4]); rect(ex + 53, ey + 74, 3, 2, P.stone[1])
  for (const offset of [15, 32, 49]) {
    rect(ex + offset, ey + 91, 7, 7, P.stone[0]); rect(ex + offset + 1, ey + 92, 5, 4, P.stone[2])
    rect(ex + offset + 2, ey + 98, 3, 5 + (Math.floor(frame / 3 + offset) % 3), P.flame[1]); rect(ex + offset + 3, ey + 98, 1, 4, P.flame[4])
  }
  const steps = layout.steps
  rect(steps.x - 3, steps.y + 22, steps.w + 6, 10, P.sun[2])
  for (let row = 0; row < 4; row++) { rect(steps.x + row * 2, steps.y + row * 7, steps.w - row * 4, 6, P.wood[0]); rect(steps.x + row * 2 + 1, steps.y + row * 7, steps.w - row * 4 - 2, 2, P.wood[4]) }
}
