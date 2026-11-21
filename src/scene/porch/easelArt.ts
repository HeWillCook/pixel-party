import { DETAIL, dRect, stampRegion } from '../detail'
import { P } from '../palette'
import { mulberry32 } from '../procedural'
import { drawThruster } from './booster'
import { bolt } from './deckArt'
import { PORCH_EASEL_ART, PORCH_EASEL_CANVAS, PORCH_EASEL_FRAME } from './layout'

type Ctx = CanvasRenderingContext2D
const WOOD = P.wood
const MID = P.woodMid
const STONE = P.stone

export type EaselState = 'draped' | 'cover' | 'finished' | 'signin'
const EASEL_W = 68
const EASEL_H = 116
/** Detail-pixel row where the front legs end, seated in their thruster collars. The rear leg stands further back, so its foot lands higher. */
const LEG_END = 203
const REAR_END = 196
const LEG_START = 24

const spread = (row: number) => Math.round(0.18 * row)

/** Everything on the easel that does not move relative to the easel: pole, legs, brace, frame, clamp, tray. */
function paintEaselBody(ctx: Ctx, ex: number, ey: number, state: EaselState): void {
  const X = ex * DETAIL, Y = ey * DETAIL
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, X + x, Y + y, w, h, c)
  const rng = mulberry32(8123)

  // Rear leg (the centre pole): slimmer, lit on the right, ending higher than the front legs because its foot
  // stands further back on the deck. Short grain runs.
  const poleCols = [WOOD[0], WOOD[1], WOOD[2], WOOD[3], WOOD[4], WOOD[0]]
  poleCols.forEach((colour, i) => R(65 + i, 0, 1, REAR_END, colour))
  for (let y = 10; y < REAR_END - 12; y += 17 + Math.floor(rng() * 20)) R(67 + Math.floor(rng() * 2), y, 1, 6 + Math.floor(rng() * 8), MID[1])

  // Front legs splay from just below the apex. The left leg is in its own shade, the right leg catches the sun.
  const left = [WOOD[0], WOOD[1], WOOD[1], WOOD[1], MID[1], WOOD[2]]
  const right = [WOOD[1], WOOD[2], WOOD[2], WOOD[2], WOOD[3], WOOD[4]]
  for (let row = LEG_START; row < LEG_END; row++) {
    const s = spread(row)
    left.forEach((colour, i) => R(63 - s + i, row, 1, 1, colour))
    right.forEach((colour, i) => R(69 + s + i, row, 1, 1, colour))
  }
  for (let row = LEG_START + 6; row < LEG_END - 16; row += 27 + Math.floor(rng() * 10)) {
    const s = spread(row)
    R(63 - s + 2, row, 1, 7, WOOD[0]); R(69 + s + 2, row + 5, 1, 8, MID[2])
  }

  // Cross brace between the front legs, lit on top, bolted through each leg.
  const braceY = 164, braceH = 6
  const sBrace = spread(braceY)
  const xl = 63 - sBrace + 3, xr = 69 + sBrace + 3
  R(xl, braceY, xr - xl, braceH, WOOD[2])
  R(xl, braceY, xr - xl, 1, WOOD[4]); R(xl, braceY + 1, xr - xl, 1, WOOD[3]); R(xl, braceY + braceH - 1, xr - xl, 1, WOOD[0]); R(xl, braceY + braceH - 2, xr - xl, 1, WOOD[1])
  for (let x = xl + 10; x < xr - 14; x += 19 + Math.floor(rng() * 14)) R(x, braceY + 2 + Math.floor(rng() * 2), 6 + Math.floor(rng() * 6), 1, MID[1])
  bolt(ctx, X + xl - 2, Y + braceY + 2); bolt(ctx, X + xr - 1, Y + braceY + 2)
  // Brace passes in front of the pole: a short shadow where it crosses.
  R(65, braceY + braceH, 6, 2, WOOD[1])

  // Picture frame (38x38 logical): outline, mitred timber band lit from the top and right, inner bevel.
  const f = { x: PORCH_EASEL_FRAME.x * 2, y: PORCH_EASEL_FRAME.y * 2, s: PORCH_EASEL_FRAME.w * 2 }
  R(f.x, f.y, f.s, f.s, WOOD[0])
  R(f.x + 1, f.y + 1, f.s - 2, f.s - 2, WOOD[3])
  R(f.x + 1, f.y + 1, f.s - 2, 1, WOOD[4]); R(f.x + 1, f.y + 2, f.s - 2, 1, WOOD[3]); R(f.x + 1, f.y + 3, f.s - 3, 1, WOOD[2])
  R(f.x + f.s - 4, f.y + 1, 1, f.s - 2, WOOD[2]); R(f.x + f.s - 3, f.y + 1, 1, f.s - 2, WOOD[3]); R(f.x + f.s - 2, f.y + 1, 1, f.s - 2, WOOD[4])
  R(f.x + 1, f.y + 1, 1, f.s - 2, WOOD[3]); R(f.x + 2, f.y + 1, 1, f.s - 2, WOOD[3]); R(f.x + 3, f.y + 3, 1, f.s - 5, WOOD[2])
  R(f.x + 1, f.y + f.s - 2, f.s - 2, 1, WOOD[2]); R(f.x + 1, f.y + f.s - 3, f.s - 2, 1, WOOD[1]); R(f.x + 1, f.y + f.s - 4, f.s - 2, 1, WOOD[2])
  for (let i = 0; i < 3; i++) { // mitre joints
    R(f.x + 1 + i, f.y + 1 + i, 1, 1, WOOD[1]); R(f.x + f.s - 2 - i, f.y + 1 + i, 1, 1, WOOD[1])
    R(f.x + 1 + i, f.y + f.s - 2 - i, 1, 1, WOOD[1]); R(f.x + f.s - 2 - i, f.y + f.s - 2 - i, 1, 1, WOOD[1])
  }
  // Canvas / mat.
  const c = { x: PORCH_EASEL_CANVAS.x * 2, y: PORCH_EASEL_CANVAS.y * 2, s: PORCH_EASEL_CANVAS.w * 2 }
  R(c.x, c.y, c.s, c.s, state === 'draped' ? P.paper[2] : P.paper[4])
  R(c.x, c.y, c.s, 1, P.paper[3]); R(c.x, c.y, 1, c.s, P.paper[3]) // shadowed top and left inner edges
  if (state === 'draped') { // cloth folds
    for (const [fx, w] of [[10, 3], [26, 2], [44, 3], [58, 2]] as const) { R(c.x + fx, c.y + 2, w, c.s - 4, P.paper[1]); R(c.x + fx + w, c.y + 2, 1, c.s - 4, P.paper[3]) }
  } else if (state !== 'finished') {
    for (let y = PORCH_EASEL_CANVAS.y + 2; y < PORCH_EASEL_CANVAS.y + PORCH_EASEL_CANVAS.h - 2; y += 4) {
      for (let x = PORCH_EASEL_CANVAS.x + 2 + (y % 3); x < PORCH_EASEL_CANVAS.x + PORCH_EASEL_CANVAS.w - 2; x += 7) R(x * 2, y * 2, 4, 2, P.paper[3])
    }
  }

  // Top clamp: iron jaw sitting on the frame, a threaded rod and a wooden thumb-wheel, rubber pads below.
  R(56, 38, 24, 7, STONE[0]); R(57, 39, 22, 5, STONE[2]); R(57, 39, 22, 1, STONE[4]); R(57, 43, 22, 1, STONE[1]); R(72, 39, 7, 5, STONE[3]); R(77, 39, 2, 5, STONE[4])
  R(58, 45, 6, 2, WOOD[0]); R(72, 45, 6, 2, WOOD[0])
  R(66, 29, 4, 9, STONE[0]); R(67, 29, 2, 9, STONE[2])
  for (let y = 30; y < 38; y += 2) R(67, y, 2, 1, STONE[1])
  R(59, 25, 18, 5, WOOD[0]); R(60, 26, 16, 3, WOOD[3]); R(60, 26, 16, 1, WOOD[4]); R(73, 26, 3, 3, WOOD[4]); R(60, 28, 16, 1, WOOD[2])
  bolt(ctx, X + 58, Y + 40)

  // Paint tray: lit top face, grained front, shadow beneath, two cleats where it rests on the legs.
  const tray = { x: 18, y: 120, w: 100 }
  R(tray.x, tray.y, tray.w, 8, WOOD[2])
  R(tray.x, tray.y, tray.w, 2, WOOD[4]); R(tray.x, tray.y + 2, tray.w, 1, WOOD[3]); R(tray.x, tray.y + 7, tray.w, 1, WOOD[0]); R(tray.x, tray.y + 6, tray.w, 1, WOOD[1])
  R(tray.x, tray.y, 1, 8, WOOD[0]); R(tray.x + tray.w - 1, tray.y, 1, 8, WOOD[0])
  for (let x = tray.x + 8; x < tray.x + tray.w - 14; x += 21 + Math.floor(rng() * 17)) R(x, tray.y + 3 + Math.floor(rng() * 2), 8 + Math.floor(rng() * 12), 1, MID[1])
  R(tray.x + 20, tray.y + 8, 7, 3, WOOD[1]); R(tray.x + 20, tray.y + 8, 7, 1, WOOD[0]); R(tray.x + 74, tray.y + 8, 7, 3, WOOD[1]); R(tray.x + 74, tray.y + 8, 7, 1, WOOD[0])
  // Paint tin (grey, lit right), a red pot and a brush with ferrule.
  R(22, 114, 16, 6, STONE[0]); R(23, 115, 14, 4, STONE[2]); R(34, 115, 3, 4, STONE[3]); R(23, 115, 14, 1, STONE[4]); R(23, 117, 14, 1, STONE[1])
  R(46, 115, 12, 5, WOOD[0]); R(47, 116, 10, 3, P.flame[1]); R(47, 116, 10, 1, P.flame[3]); R(53, 116, 4, 3, P.flame[2])
  R(90, 114, 17, 3, WOOD[0]); R(91, 114, 16, 1, WOOD[4]); R(91, 115, 16, 1, WOOD[3])
  R(106, 113, 6, 5, STONE[0]); R(107, 114, 4, 3, STONE[3]); R(107, 114, 4, 1, STONE[4])
  R(112, 114, 5, 3, WOOD[0]); R(112, 114, 4, 2, P.flame[1]); R(112, 114, 3, 1, P.flame[3])
}

const paintings = new WeakMap<Uint8Array, HTMLCanvasElement>()
function paintingCanvas(cells: Uint8Array, colour: (c: number, p: number) => string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  let canvas = paintings.get(cells)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = 32; canvas.height = 32
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    for (let py = 0; py < 32; py++) for (let px = 0; px < 32; px++) { ctx.fillStyle = colour(cells[py * 32 + px] ?? 0, px + py); ctx.fillRect(px, py, 1, 1) }
    paintings.set(cells, canvas)
  }
  return canvas
}

/** Easel with its body cached and stamped at the bob offset; the player's painting is drawn live on top. */
export function drawEasel(ctx: Ctx, ex: number, ey: number, bob: number, state: EaselState, cells: Uint8Array | undefined, colour: (c: number, p: number) => string): void {
  const finished = state === 'finished' && cells && cells.length >= 1024
  const key = `easel|${ex}|${ey}|${state === 'draped' ? 'draped' : finished ? 'finished' : 'blank'}`
  const paint = (target: Ctx) => paintEaselBody(target, ex, ey, state === 'draped' ? 'draped' : finished ? 'finished' : 'cover')
  if (!stampRegion(ctx, key, ex, ey, EASEL_W, EASEL_H, paint, { dy: bob })) { ctx.save(); ctx.translate(0, bob); paint(ctx); ctx.restore() }
  if (finished && cells) {
    ctx.fillStyle = WOOD[1]
    ctx.fillRect(ex + PORCH_EASEL_ART.x - 1, ey + bob + PORCH_EASEL_ART.y - 1, PORCH_EASEL_ART.w + 2, PORCH_EASEL_ART.h + 2)
    const art = paintingCanvas(cells, colour)
    if (art) ctx.drawImage(art, ex + PORCH_EASEL_ART.x, ey + bob + PORCH_EASEL_ART.y, 32, 32)
    else for (let py = 0; py < 32; py++) for (let px = 0; px < 32; px++) { ctx.fillStyle = colour(cells[py * 32 + px] ?? 0, px + py); ctx.fillRect(ex + PORCH_EASEL_ART.x + px, ey + bob + PORCH_EASEL_ART.y + py, 1, 1) }
  }
}

/** Width, in scene units, of the base drawn by `paintEaselBase`. */
export const EASEL_BASE_W = 66
/** Height of the base for a given leg length: legs, the thruster (7 units) and its flame, and the floor shadow. */
export const easelBaseHeight = (legs: number) => legs + 14

/**
 * What a hovering HTML easel stands on, drawn from the tray's underside down: two front legs splaying outward with a
 * crossbar, a shorter rear leg, each leg seated in a thruster collar (the rear thruster is smaller and sits higher,
 * as its foot is further back), and a flat shadow under each. The same construction as the porch easel, at the same
 * relative thruster size. `ctx` must be scaled by DETAIL; `frame` drives the flames.
 */
export function paintEaselBase(ctx: Ctx, legs: number, frame: number): void {
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, x, y, w, h, c)
  const centre = EASEL_BASE_W, drop = legs * DETAIL, slope = 0.3
  const leftTop = 30, rightTop = centre * 2 - 30 - 6
  const offset = (row: number) => Math.round(slope * row)
  // Rear leg first (it is behind): slim, ending a little higher than the front legs.
  ;[WOOD[0], WOOD[1], WOOD[2], WOOD[3], WOOD[4], WOOD[0]].forEach((c, i) => R(centre - 3 + i, 0, 1, drop - 4, c))
  // Front legs splayed outward, one in its own shade and one in the sun.
  for (let row = 0; row < drop; row++) {
    ;[WOOD[0], WOOD[1], WOOD[1], WOOD[1], MID[1], WOOD[2]].forEach((c, i) => R(leftTop - offset(row) + i, row, 1, 1, c))
    ;[WOOD[1], WOOD[2], WOOD[2], WOOD[2], WOOD[3], WOOD[4]].forEach((c, i) => R(rightTop + offset(row) + i, row, 1, 1, c))
  }
  // Crossbar between the front legs, bolted through both.
  const barY = Math.max(2, Math.round(drop * 0.45)), o = offset(barY)
  const barX = leftTop - o + 6, barW = rightTop + o - barX
  R(barX, barY, barW, 4, WOOD[2]); R(barX, barY, barW, 1, WOOD[4]); R(barX, barY + 3, barW, 1, WOOD[0])
  bolt(ctx, barX - 2, barY + 1); bolt(ctx, barX + barW, barY + 1)
  // Flat shadows on the floor under each foot (the rear one is further back), then the thrusters over the foot ends.
  const ground = (legs + 14) * DETAIL - 3
  const shadow = (cx: number, cy: number, rx: number) => { for (let y = -1; y <= 1; y++) { const half = y === 0 ? rx : rx - 3; R(cx - half, cy + y, half * 2, 1, WOOD[1]) } }
  const footLeft = leftTop - offset(drop) + 3, footRight = rightTop + offset(drop) + 3
  shadow(footLeft, ground, 10); shadow(footRight, ground, 10); shadow(centre, ground - 6, 7)
  drawThruster(ctx, (footLeft - 9) / DETAIL, legs, frame)
  drawThruster(ctx, (footRight - 9) / DETAIL, legs, frame + 1)
  drawThruster(ctx, (centre - 7) / DETAIL, legs - 2, frame + 2, true)
}
