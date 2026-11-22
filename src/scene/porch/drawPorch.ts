import { EMPTY_CANVAS, PALETTE } from '../../game/config'
import { P } from '../palette'
import { blitStaticLayer, DETAIL, dRect, dth } from '../detail'
import { drawSprite } from '../sprite'
import { porchHatch, porchHaiku, porchLayout, porchRadioTable } from './layout'
import { sprites } from './sprites'
import { drawThruster } from './booster'
import { drawEasel, type EaselState } from './easelArt'
import { drawChalkboard } from './chalkboardArt'
import { drawCat } from './catArt'
import { paintHaiku } from './haikuArt'
import { paintSpill } from './spillArt'
import { drawBeam, drawLanternCore, drawTower } from './lighthouseArt'
import { drawLantern, drawRadioWaves, paintChair, paintNote, paintPlant, paintRadio, paintHatch, paintRope, paintSideTable, paintWallSign } from './propsArt'
import { paintDeckAndRailing } from './deckArt'
import { paintMailbox, paintWall, paintWindow } from './houseArt'
import { drawFoam, drawSea, paintBackdrop, paintSand } from './skyArt'

export interface PorchOptions {
  easelState: EaselState
  bob: boolean
  soundOn?: boolean
  signedIn?: boolean
  roofTop?: number
  hideEasel?: boolean
  hideChalkboard?: boolean
  /** Haiku: napping in the chair (the default), or awake and sad among his spilled paint (the 404 only). */
  haiku?: 'asleep' | 'sad'
  /** Arrival flare: the thrusters of the object the camera is settling on burn brighter for a moment. */
  flare?: { target: 'easel' | 'chalkboard'; boost: number }
  backgroundOnly?: boolean
  easelCells?: Uint8Array
}

/**
 * The roof beam across the top: soffit boards with staggered end joints and nails, a fascia with a lit lower lip,
 * and the eave's shadow beneath it. Authored on the detail grid (`ctx` is scaled by DETAIL); it spans 18 scene
 * units, and `width` is the scene width to cover. Detail rows 24-25 are the fascia's lit lip; from row 36 down it is transparent.
 */
/** The easel's and chalkboard's idle hover, in scene pixels. PorchScene mirrors it onto the DOM writing on them (`--porch-bob`). */
export function porchBob(frame: number): number {
  return [0, 0, 1, 1, 0, 0, -1, -1][Math.floor(frame / 5) % 8]
}

export function drawPorchRoof(ctx: CanvasRenderingContext2D, roofTop: number, width = ctx.canvas.width): void {
  const W = width * DETAIL, Y = roofTop * DETAIL
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, x, Y + y, w, h, c)
  // Soffit: three boards, each a dark seam over a lit lip, with end joints staggered board to board and nailed.
  R(0, 0, W, 14, P.wood[1])
  for (const [y, stagger] of [[0, 0], [5, 90], [10, 40]] as const) {
    R(0, y + 1, W, 1, P.wood[0]); R(0, y + 2, W, 1, P.wood[2])
    for (let x = stagger + 60; x < W; x += 180) {
      R(x, y + 3, 1, 3, P.wood[0]); R(x + 1, y + 3, 1, 2, P.wood[3])
      R(x - 6, y + 4, 1, 1, P.wood[0]); R(x + 6, y + 4, 1, 1, P.wood[0])
    }
  }
  // Fascia: dark top edge, a plain face with a few grain streaks and nail heads, a lit lower lip.
  R(0, 14, W, 2, P.wood[0]); R(0, 16, W, 8, P.wood[2]); R(0, 16, W, 1, P.wood[3]); R(0, 24, W, 2, P.wood[4])
  for (let x = 20; x < W - 30; x += 70 + (x * 7) % 41) R(x, 18 + (x % 3) * 2, 16 + (x % 5) * 6, 1, P.woodMid[1])
  for (let x = 44; x < W; x += 96) { R(x, 20, 2, 1, P.wood[0]); R(x + 1, 19, 1, 1, P.wood[4]) }
  // Eave shadow: solid under the fascia, then a short quantised fade.
  R(0, 26, W, 6, P.wood[1])
  for (let k = 0; k < 4; k++) for (let x = 0; x < W; x++) if (dth((3 - k) / 4, x, k)) R(x, 32 + k, 1, 1, P.wood[1])
}

/** Letter "z" bitmaps on the 2x detail grid (1 = ink): a thick-diagonal 7x7 and a 5x5. */
const Z_GLYPHS = {
  big: ['1111111', '0000111', '0001110', '0011100', '0111000', '1110000', '1111111'],
  small: ['11111', '00011', '00110', '01100', '11111'],
} as const

/** One "z": a dark rim, then the letter, so it reads against sky, wall and chair alike. `x`/`y` are detail pixels. */
function drawZ(ctx: CanvasRenderingContext2D, x: number, y: number, size: keyof typeof Z_GLYPHS, ink: string): void {
  const rows = Z_GLYPHS[size]
  const dot = (px: number, py: number) => ctx.fillRect(px / DETAIL, py / DETAIL, 1 / DETAIL, 1 / DETAIL)
  ctx.fillStyle = P.wood[0]
  rows.forEach((row, j) => [...row].forEach((cell, i) => {
    if (cell !== '1') return
    dot(x + i - 1, y + j); dot(x + i + 1, y + j); dot(x + i, y + j - 1); dot(x + i, y + j + 1)
  }))
  ctx.fillStyle = ink
  rows.forEach((row, j) => [...row].forEach((cell, i) => { if (cell === '1') dot(x + i, y + j) }))
}

/**
 * The sleeper's Z's: small "z" glyphs that rise from her nose, grow from small to big, drift right and fade through
 * the paper ramp. `noseX`/`noseY` are the nose in scene units. Frame 0 (reduced motion) holds one small and one big z.
 */
export function drawCatSleepZs(ctx: CanvasRenderingContext2D, noseX: number, noseY: number, frame: number): void {
  const nx = Math.round(noseX * DETAIL), ny = Math.round(noseY * DETAIL)
  if (frame === 0) {
    drawZ(ctx, nx + 2, ny - 13, 'small', P.paper[4])
    drawZ(ctx, nx + 9, ny - 24, 'big', P.paper[3])
    return
  }
  const period = 36
  for (let i = 0; i < 2; i++) {
    const phase = (frame + i * 18) % period
    const step = Math.floor(phase / 3)
    if (step >= 10) continue
    const ink = step < 4 ? P.paper[4] : step < 7 ? P.paper[3] : P.paper[2]
    drawZ(ctx, nx + 2 + Math.floor(step * 0.8), ny - 11 - step * 2, step < 4 ? 'small' : 'big', ink)
  }
}

/** The porch's fixed measurements for a canvas; the far side and the near side both read them. */
function porchGeometry(ctx: CanvasRenderingContext2D) {
  const portrait = ctx.canvas.height > ctx.canvas.width
  const floor = portrait ? 232 : 154
  return {
    portrait,
    layout: porchLayout[portrait ? 'portrait' : 'landscape'],
    width: ctx.canvas.width,
    height: ctx.canvas.height,
    horizon: portrait ? 140 : 100,
    floor,
    sunX: portrait ? 131 : 232,
    shore: floor - (portrait ? 37 : 36),
    wallWidth: portrait ? 42 : 55,
  }
}

/** Static art is painted once per composition into transparent detail-resolution layers and re-blitted. */
function staticLayer(ctx: CanvasRenderingContext2D, portrait: boolean, width: number, height: number) {
  return (key: string, paint: (target: CanvasRenderingContext2D) => void) => {
    if (!blitStaticLayer(ctx, `porch|${portrait ? 'p' : 'l'}|${key}`, width, height, paint)) paint(ctx)
  }
}

/** The porch's far side: sky, sun, clouds, the island with its lighthouse and the sea. */
function drawPorchBack(ctx: CanvasRenderingContext2D, frame: number): void {
  const { portrait, layout, width, height, horizon, sunX, shore } = porchGeometry(ctx)
  ctx.imageSmoothingEnabled = false
  const layer = staticLayer(ctx, portrait, width, height)

  // --- Sky, sun, clouds, island and the sea's base tone ---------------------------------------
  const clouds: ReadonlyArray<readonly [number, number, number]> = portrait ? [[22, 54, 54], [81, 81, 58], [31, 102, 39]] : [[30, 52, 68], [160, 65, 78], [206, 79, 66], [100, 86, 59], [92, 30, 45], [235, 40, 53]]
  layer('back', (target) => paintBackdrop(target, { width, horizon, shore, sunX, sunR: portrait ? 20 : 24, clouds, islandX: layout.lighthouse.x - 15 }))

  // --- Lighthouse: rotating beam and halo behind the tower, then the tower and its flashing lantern ---
  drawBeam(ctx, layout.lighthouse.x, horizon, frame)
  drawTower(ctx, layout.lighthouse.x, horizon)
  drawLanternCore(ctx, layout.lighthouse.x, horizon, frame)

  // --- Sea: layered swells and the sun's glitter path -----------------------------------------
  drawSea(ctx, frame, width, horizon, shore, sunX)
}

/** The near side: sand and foam, the notice, the house, deck, railing and props. */
function drawPorchFront(ctx: CanvasRenderingContext2D, frame: number, opts: PorchOptions): void {
  const { portrait, layout, width, height, floor, shore, wallWidth } = porchGeometry(ctx)
  const roofTop = opts.roofTop ?? 0
  ctx.imageSmoothingEnabled = false
  const layer = staticLayer(ctx, portrait, width, height)

  // --- Sand, foam, grass ------------------------------------------------------------------------
  layer('sand', (target) => paintSand(target, {
    width, shore, floor, driftwood: !portrait,
    tufts: [18, 47, width - 50, width - 8].map(x => [x, portrait ? floor - 8 : shore + 4] as const),
  }))
  drawFoam(ctx, frame, width, shore)
  if (opts.backgroundOnly) return

  // --- Static foreground: railing and posts, deck boards, house wall, roof, window, gallery, furniture ---
  layer(`front|${roofTop}|${opts.signedIn ? 1 : 0}|${opts.haiku === 'sad' ? 1 : 0}`, (target) => paintFront(target, { portrait, layout, width, height, floor, wallWidth, roofTop, signedIn: Boolean(opts.signedIn), sad: opts.haiku === 'sad' }))

  if (opts.haiku === 'sad') {
    // Awake, on the cushion (or the deck, with no chair), among the paint he knocked over.
    const { sit } = porchHaiku[portrait ? 'portrait' : 'landscape']
    ctx.save()
    ctx.translate(sit.x, sit.y)
    paintHaiku('sad', frame, true).flush(ctx)
    ctx.restore()
  } else {
    drawCat(ctx, layout.cat.x, layout.cat.y, frame, !portrait)
    // Her nose is at the left end of the cat, under the head's muzzle.
    drawCatSleepZs(ctx, layout.cat.x + 7, layout.cat.y + 9, frame)
  }
  if (!portrait && opts.soundOn) drawRadioWaves(ctx, layout.radio.x, layout.radio.y, frame)
  drawLantern(ctx, layout.lantern.x, layout.lantern.y - 2, frame)

  if (!opts.hideEasel) {
    const easel = layout.easel
    const bob = opts.bob ? porchBob(frame) : 0
    const ex = easel.x, ey = easel.y
    const cellColour = (c: number, p: number) => c === 0 ? EMPTY_CANVAS[p % 2] : (PALETTE[c] ?? EMPTY_CANVAS[p % 2])
    drawEasel(ctx, ex, ey, bob, opts.easelState, opts.easelCells, cellColour)
    // Two front feet seated in their collars, and a smaller one on the rear leg, which lands higher and further back.
    const easelBoost = opts.flare?.target === 'easel' ? opts.flare.boost : 0
    for (const offset of [10, 50]) drawThruster(ctx, ex + offset, ey + bob + 101, frame + offset, false, easelBoost)
    drawThruster(ctx, ex + 30.5, ey + bob + 98, frame + 31, true, easelBoost)
  }
  if (!opts.hideChalkboard) {
    const board = layout.chalkboard
    const boardBob = opts.bob ? porchBob(frame) : 0
    drawChalkboard(ctx, board, boardBob, portrait ? 3 : 5)
    for (const offset of [8, Math.floor(board.w / 2) - 4, board.w - 16]) {
      drawThruster(ctx, board.x + offset, board.y + boardBob + board.h - 12, frame + Math.round(offset), false, opts.flare?.target === 'chalkboard' ? opts.flare.boost : 0)
    }
  }
  layer('hatch', (target) => paintHatchLayer(target, portrait))
}

export function drawPorch(ctx: CanvasRenderingContext2D, frame: number, opts: PorchOptions): void {
  drawPorchBack(ctx, frame)
  drawPorchFront(ctx, frame, opts)
}

interface FrontOptions {
  portrait: boolean
  layout: (typeof porchLayout)['landscape']
  width: number
  height: number
  floor: number
  wallWidth: number
  roofTop: number
  signedIn: boolean
  sad: boolean
}

/**
 * Where the hovering boards' thrusters land on the deck: the easel's two front feet and its smaller, further-back
 * rear foot, and the chalkboard's three. Each shadow sits a short way below its flame.
 */
function hoverShadows(layout: FrontOptions['layout'], portrait: boolean): ReadonlyArray<readonly [number, number, number]> {
  const { easel, chalkboard: board } = layout
  const front = portrait ? 248 : 157, rear = portrait ? 245 : 155.5, boardY = portrait ? 247 : 155.5
  return [
    [easel.x + 14.5, 5, front], [easel.x + 54.5, 5, front], [easel.x + 34, 3.5, rear],
    ...[12.5, board.w / 2 - 4 + 4.5, board.w - 16 + 4.5].map(dx => [board.x + dx, 5, boardY] as const),
  ]
}

/** Everything in the porch foreground that never animates; painted once into a cached layer. */
function paintFront(ctx: CanvasRenderingContext2D, o: FrontOptions): void {
  const { portrait, layout, width, height, floor, wallWidth, roofTop } = o
  const rect = (x: number, y: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h) }
  paintDeckAndRailing(ctx, {
    width, height, floor, portrait, wallWidth,
    newels: portrait ? [] : [104, 218],
    shadows: hoverShadows(layout, portrait),
  })
  paintWall(ctx, { wallWidth, floor, roofTop })
  drawPorchRoof(ctx, roofTop)
  if (!portrait) paintWindow(ctx, { x: 19, y: 38, w: 25, h: 32 })
  paintWallSign(ctx, layout.gallery)
  if (!portrait) {
    paintChair(ctx, layout.cat.x - 3, layout.cat.y - 11)
    paintSideTable(ctx, porchRadioTable(), floor)
    paintRadio(ctx, layout.radio.x, layout.radio.y)
    paintPlant(ctx, layout.plant.x, floor)
  }
  if (o.sad) paintSpill(ctx, portrait ? 'portrait' : 'landscape')
  paintMailbox(ctx, { x: layout.mailbox.x, y: layout.mailbox.y, signedIn: o.signedIn })
  paintRope(ctx, layout.lantern.x + 9, roofTop + 13, layout.lantern.y - 2)
  paintNote(ctx, layout.note)
}

/** The deck hatch with its sign: drawn last, in front of the animated props, from its own cached layer. */
function paintHatchLayer(ctx: CanvasRenderingContext2D, portrait: boolean): void {
  paintHatch(ctx, porchHatch[portrait ? 'portrait' : 'landscape'])
}
