import { bayer, DETAIL, DetailGrid, dRect, drawDetailSprite, dth, shadeRegion } from '../detail'
import { P } from '../palette'
import { mulberry32 } from '../procedural'
import { defineSprite } from '../sprite'
import { paintWindowView, windowSplit } from '../porch/skyArt'
import { paintSign } from '../porch/propsArt'
import { paintStairRun } from '../porch/stairArt'
import { bolt } from '../porch/deckArt'
import { paintPlant } from '../porch/propsArt'
import { boardTone, paintPlanks } from '../woodwork'
import type { Rect } from '../camera'
import type { StudioLayout } from './layout'

type Ctx = CanvasRenderingContext2D
const WOOD = P.wood
const MID = P.woodMid
const STONE = P.stone
const FUR = P.fur
const PAPER = P.paper

export interface StudioOptions {
  portrait: boolean
  width: number
  height: number
  layout: StudioLayout
  dadoY: number
  floorY: number
}

const D = DETAIL
const hash = (a: number, b: number) => (Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663)) >>> 0

// Brick tones: [base, lighter (top edge), darker (bottom edge)].
const BRICKS: ReadonlyArray<readonly [string, string, string]> = [
  [FUR[1], FUR[2], WOOD[1]],
  [MID[1], MID[2], WOOD[1]],
  [WOOD[1], MID[1], FUR[0]],
  [FUR[0], WOOD[1], WOOD[0]],
]
const BRICKS_LIT: ReadonlyArray<readonly [string, string, string]> = [
  [MID[1], MID[2], FUR[1]],
  [MID[2], WOOD[2], MID[1]],
  [FUR[1], FUR[2], WOOD[1]],
  [WOOD[1], MID[1], FUR[0]],
]

/** Running-bond brick wall with mortar variation, shaded top/bottom edges, the odd darker or chipped brick, and warmer bricks by the windows. */
export function paintBricks(ctx: Ctx, o: { width: number; dadoY: number; windows: readonly Rect[] }): void {
  const W = o.width * D, H = o.dadoY * D
  const winLeft = o.windows[0].x * D - 14, winRight = (o.windows[o.windows.length - 1].x + o.windows[o.windows.length - 1].w) * D + 14
  shadeRegion(ctx, 0, 0, W, H, (x, y) => {
    const course = Math.floor(y / 10), ry = y % 10
    const offset = (course % 2) * 14
    const bx = Math.floor((x + offset) / 28), rx = (x + offset) % 28
    const mortar = ((Math.floor(x / 56) + course) % 5 === 0) ? FUR[0] : WOOD[0]
    if (ry < 2 || rx < 2) return mortar
    const h = hash(bx, course) % 100
    const tone = h < 56 ? 0 : h < 80 ? 1 : h < 92 ? 2 : h < 96 ? 3 : 1
    const warm = x > winLeft && x < winRight && y < H - 14
    const [base, light, dark] = (warm ? BRICKS_LIT : BRICKS)[tone]
    // The occasional chipped brick: a corner knocked off, showing mortar.
    if (hash(bx + 5, course + 9) % 17 === 3) {
      if (rx >= 24 && ry <= 4) return mortar
      if (rx >= 25 && ry === 5) return mortar
    }
    if (ry === 2) return light
    if (ry === 9) return dark
    if (rx === 27) return light
    return base
  })
}

/** Background layer: brick wall with the window views set into it. */
export function paintStudioBackground(ctx: Ctx, o: StudioOptions): void {
  paintBricks(ctx, { width: o.width, dadoY: o.dadoY, windows: o.layout.windows })
  o.layout.windows.forEach((win, i) => paintWindowView(ctx, win, {
    island: i === 0 && !o.portrait,
    sun: i === o.layout.windows.length - 1,
    birds: i > 0,
    driftwood: i === 1,
    low: true,
  }, o.portrait))
}

/** Animated sea in each window: perspective swell lines drifting in alternating directions, glints under the sun. */
export function drawStudioSeas(ctx: Ctx, frame: number, o: StudioOptions): void {
  o.layout.windows.forEach((win, idx) => {
    const x0 = win.x * D, w = win.w * D
    const { skyH, seaH } = windowSplit(win, true)
    const top = win.y * D + skyH + 1
    const sunCx = x0 + Math.round(w * 0.72)
    const sun = idx === o.layout.windows.length - 1
    const rows = [0.1, 0.26, 0.48, 0.74]
    rows.forEach((frac, line) => {
      const y = top + 2 + Math.round(frac * (seaH - 6))
      const period = 14 + Math.round(frac * 40) + (line % 2) * 4
      const length = Math.round(period * 0.55)
      const dir = line % 2 ? 1 : -1
      const shift = Math.floor(frame * dir * (0.2 + frac * 0.4))
      const start = ((shift + idx * 7 + line * 5) % period + period) % period - period
      for (let x = x0 + start; x < x0 + w; x += period) {
        const mid = x + length / 2
        const inPath = sun && Math.abs(mid - sunCx) < 14 + frac * 30
        const cx = Math.max(x, x0), ex = Math.min(x + length, x0 + w)
        if (ex <= cx) continue
        dRect(ctx, cx, y, ex - cx, 1, inPath ? P.sun[3] : P.sea[3])
        if (ex - cx > 4) dRect(ctx, Math.min(cx + 2, ex - 2), y + 1, Math.max(2, ex - cx - 4), 1, inPath ? P.sun[1] : P.sea[0])
      }
    })
    if (sun) {
      for (let i = 0; i < 6; i++) {
        if ((frame + i * 3) % 9 > 3) continue
        const gx = sunCx - 16 + ((i * 11) % 34), gy = top + 3 + ((i * 7) % Math.max(4, seaH - 8))
        dRect(ctx, gx, gy, 2, 1, P.sun[4])
      }
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Foreground
// ---------------------------------------------------------------------------------------------

export function paintWindowFrame(ctx: Ctx, win: Rect): void {
  const x = win.x * D, y = win.y * D, w = win.w * D, h = win.h * D
  const R = (rx: number, ry: number, rw: number, rh: number, c: string) => dRect(ctx, rx, ry, rw, rh, c)
  // Depth: the reveal shades the top and left of the glass; the sill catches light.
  R(x, y, w, 3, WOOD[1]); R(x, y, 3, h, WOOD[1]); R(x, y + 3, w - 3, 1, MID[1]); R(x + 3, y + 3, 1, h - 3, MID[1])
  R(x + w - 1, y, 1, h, WOOD[3])
  // Mullion and transom with lit and shaded edges.
  const midX = x + Math.floor(w / 2)
  const transomY = y + Math.floor(h * 0.46)
  R(midX - 2, y, 4, h, WOOD[0]); R(midX - 1, y, 2, h, WOOD[3]); R(midX + 1, y, 1, h, WOOD[4]); R(midX - 2, y, 1, h, WOOD[1])
  R(x, transomY, w, 4, WOOD[0]); R(x, transomY + 1, w, 2, WOOD[3]); R(x, transomY + 1, w, 1, WOOD[4]); R(x, transomY + 3, w, 1, WOOD[1])
  // Frame band, mitred at the corners, with a dark outline.
  const o = 6
  R(x - o, y - o, w + o * 2, o, WOOD[0]); R(x - o, y - o, o, h + o + 2, WOOD[0]); R(x + w, y - o, o, h + o + 2, WOOD[0])
  R(x - o + 1, y - o + 1, w + o * 2 - 2, 1, WOOD[4]); R(x - o + 1, y - o + 2, w + o * 2 - 2, 2, WOOD[3]); R(x - o + 1, y - o + 4, w + o * 2 - 2, 1, WOOD[2])
  R(x - o + 1, y - o + 1, 1, h + o, WOOD[3]); R(x - o + 2, y - o + 1, 1, h + o, WOOD[3]); R(x - o + 3, y - o + 5, 2, h + o - 4, WOOD[2])
  R(x + w + 1, y - o + 1, 1, h + o, WOOD[2]); R(x + w + 2, y - o + 1, 2, h + o, WOOD[3]); R(x + w + 4, y - o + 1, 1, h + o, WOOD[4])
  for (let i = 0; i < 5; i++) { R(x - o + 1 + i, y - o + 1 + i, 1, 1, WOOD[1]); R(x + w + o - 2 - i, y - o + 1 + i, 1, 1, WOOD[1]) }
  // Stone sill with a lit top, chamfered face and a drip shadow.
  R(x - 8, y + h + 2, w + 16, 2, P.sun[3]); R(x - 8, y + h + 4, w + 16, 4, STONE[3]); R(x - 8, y + h + 4, w + 16, 1, STONE[4]); R(x - 8, y + h + 8, w + 16, 2, STONE[0])
  R(x + w + 4, y + h + 4, 4, 4, STONE[4]); R(x - 8, y + h + 4, 1, 6, STONE[1])
  R(x - 6, y + h + 10, w + 12, 2, WOOD[1])
}

/** Tongue-and-groove wainscot with a capped dado rail and a baseboard. */
export function paintWainscot(ctx: Ctx, o: { width: number; dadoY: number; floorY: number }): void {
  const W = o.width * D, top = o.dadoY * D, bottom = o.floorY * D
  shadeRegion(ctx, 0, top, W, bottom - top, (x, y) => {
    const k = y - top
    if (k < 6) return k < 2 ? WOOD[4] : k < 3 ? WOOD[3] : k < 5 ? WOOD[2] : WOOD[0]
    if (k < 9) return WOOD[1]
    if (y >= bottom - 6) return y === bottom - 6 ? WOOD[3] : y >= bottom - 1 ? WOOD[0] : WOOD[1]
    return boardTone(x, y)
  })
  for (let x = 4; x < W; x += 36) { dRect(ctx, x + 5, top + 6, 2, 1, WOOD[0]); dRect(ctx, x + 5, bottom - 8, 2, 1, WOOD[0]) }
}

/**
 * The stair that comes down through the ceiling directly under the porch hatch: treads from the top of the room to
 * the floor, a handrail, a floor plate at its foot, and the "Upstairs" sign planted beside the foot. The label is a DOM overlay.
 */
function paintStairs(ctx: Ctx, o: StudioOptions): void {
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, x, y, w, h, c)
  const st = o.layout.stairs
  const x = st.x * D, w = st.w * D, floor = o.floorY * D
  // A little shade on the brick where the stair stands, thrown left by the sun.
  shadeRegion(ctx, x - 8, 0, 8, floor, (px, py) => dth((px - (x - 8)) / 8 * 0.9, px, py, 2) ? WOOD[0] : null)
  paintStairRun(ctx, x, w, 0, floor)
  // Foot: a plate bolted to the floor, with the stair's shadow stretching left across the boards.
  R(x - 4, floor, w + 12, 4, STONE[1]); R(x - 4, floor, w + 12, 1, STONE[3]); bolt(ctx, x + 2, floor + 1); bolt(ctx, x + w - 4, floor + 1)
  shadeRegion(ctx, x - 40, floor + 4, 44, 6, (px, py) => dth(((px - (x - 40)) / 44) * 0.9, px, py, 2) ? WOOD[1] : null)
  // The Upstairs sign: a board on two posts with an engraved up-arrow, standing at the foot.
  const s = o.layout.upstairs
  paintSign(ctx, s, 11)
  const sx = (s.x + 1) * D, sy = (s.y + 1) * D
  const cx = sx + 14, cy = sy + 7
  for (let i = 0; i < 5; i++) { R(cx - i + 1, cy + i + 1, 2 * i + 2, 1, P.paper[3]); R(cx - i, cy + i, 2 * i + 2, 1, WOOD[0]) }
  R(cx, cy + 6, 4, 6, P.paper[3]); R(cx - 1, cy + 5, 4, 6, WOOD[0])
}

/** Pendant lamp: cord, hat-shaped copper shade lit warm on the right, glowing bulb. */
function paintLamp(ctx: Ctx, x: number, bottom: number): void {
  const R = (rx: number, ry: number, w: number, h: number, c: string) => dRect(ctx, x * D + rx, ry, w, h, c)
  R(-1, 36, 2, bottom * D - 36 - 22, WOOD[0]); R(0, 36, 1, bottom * D - 36 - 22, WOOD[2])
  const top = bottom * D - 22
  R(-3, top, 6, 3, STONE[0]); R(-2, top, 3, 1, STONE[3])
  for (let r = 0; r < 9; r++) { const hw = 3 + r * 1.4; R(-Math.round(hw), top + 3 + r, Math.round(hw * 2), 1, r < 3 ? WOOD[3] : WOOD[2]); R(-Math.round(hw), top + 3 + r, 1, 1, WOOD[0]); R(Math.round(hw) - 1, top + 3 + r, 1, 1, WOOD[0]); R(Math.round(hw) - 3, top + 3 + r, 2, 1, WOOD[4]) }
  R(-8, top + 12, 16, 2, WOOD[0]); R(-7, top + 12, 14, 1, WOOD[4]); R(4, top + 12, 3, 1, P.paper[4])
  R(-3, top + 14, 6, 4, P.sun[4]); R(-2, top + 18, 4, 2, P.sun[3]); R(-1, top + 20, 2, 1, P.sun[2])
}

/** Animated light pool a lamp throws on the wall: clean quantised dither rings that breathe over a three-frame loop. */
export function drawLampPools(ctx: Ctx, frame: number, o: StudioOptions): void {
  const f = frame % 3
  ctx.save()
  for (const lamp of lampPositions(o)) {
    const cx = lamp.x * D, top = lamp.bottom * D
    for (const [radius, alpha] of [[26 + f, 0.1], [18 + f, 0.1], [10 + f, 0.1]] as const) {
      ctx.globalAlpha = alpha
      const cy = top + 6 + Math.round(radius * 0.5), ry = Math.round(radius * 0.6)
      for (let dy = -ry; dy <= ry; dy++) {
        const half = Math.round(radius * 0.95 * Math.sqrt(1 - (dy / ry) ** 2))
        dRect(ctx, cx - half, cy + dy, half * 2, 1, P.sun[3])
      }
    }
  }
  ctx.restore()
}

function lampPositions(o: StudioOptions): Array<{ x: number; bottom: number }> {
  return o.portrait ? [{ x: 46, bottom: 34 }, { x: 88, bottom: 34 }] : [{ x: 94, bottom: 33 }, { x: 247, bottom: 33 }]
}

/**
 * A top hat lying brim-up on the desk: the brim flares into a wide ring around a dark open crown, a band with a
 * brass buckle under the brim, and a slip of paper going in from above. `cx`/`bottom` are the detail-pixel centre
 * and the row of the crown's base on the desktop.
 */
function paintTopHat(ctx: Ctx, cx: number, bottom: number): void {
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, x, y, w, h, c)
  const top = bottom - 46
  const brimY = top + 6
  const rim = (x: number, y: number, frontOnly: boolean): string | null => {
    const e = Math.hypot((x - cx) / 29, (y - brimY) / 5)
    if (e > 1.02) return null
    if (frontOnly && y < brimY) return null
    const inner = Math.hypot((x - cx) / 17, (y - (brimY - 0.5)) / 3.4)
    if (inner <= 1) return frontOnly ? null : (y < brimY - 2 ? WOOD[0] : P.sky[0])
    if (e > 0.88) return x > cx + 8 ? STONE[3] : x < cx - 12 ? STONE[1] : STONE[2]
    return x > cx + 12 ? STONE[2] : STONE[0]
  }
  // Crown below the brim, narrowing toward the desk: shade left, a lit stripe right, rounded where it meets the boards.
  shadeRegion(ctx, cx - 24, brimY, 48, bottom - brimY + 2, (x, y) => {
    const hw = 17
    const dx = x - cx
    if (Math.abs(dx) > hw || y > bottom) return null
    if (y > bottom - 3 && Math.abs(dx) > hw - (y - (bottom - 3)) * 2) return null
    if (Math.abs(dx) > hw - 1) return WOOD[0]
    const band = y >= brimY + 6 && y < brimY + 13
    if (band) return dx > hw - 5 ? P.flame[2] : dx < -hw + 5 ? P.flame[0] : P.flame[1]
    return dx > hw - 5 ? STONE[1] : dx < -hw + 6 ? STONE[0] : P.sky[0]
  })
  R(cx - 4, brimY + 7, 9, 6, WOOD[0]); R(cx - 3, brimY + 8, 7, 4, P.sun[3]); R(cx - 2, brimY + 9, 5, 2, WOOD[0]); R(cx - 3, brimY + 8, 7, 1, P.sun[4])
  shadeRegion(ctx, cx - 30, brimY - 8, 60, 16, (x, y) => rim(x, y, false))
  // Shadow of the hat on the desk, thrown left.
  shadeRegion(ctx, cx - 40, bottom - 1, 52, 5, (x, y) => Math.hypot((x - (cx - 12)) / 26, (y - (bottom + 1)) / 2) <= 1 ? WOOD[1] : null)
  // The paper slip: leaning in from above, lines of text, one dog-eared corner, passing behind the front rim.
  for (let r = 0; r < 22; r++) {
    const x = cx + 2 + Math.round(r * 0.35), y = brimY - 18 + r
    R(x, y, 13, 1, r < 1 ? WOOD[0] : PAPER[3]); R(x, y, 1, 1, WOOD[0]); R(x + 12, y, 1, 1, WOOD[0])
    if (r > 2 && r < 18 && r % 4 === 2) R(x + 2, y, 8, 1, PAPER[0])
  }
  R(cx + 10, brimY - 18, 3, 3, PAPER[1]); R(cx + 10, brimY - 18, 2, 2, PAPER[2])
  shadeRegion(ctx, cx - 30, brimY, 60, 8, (x, y) => rim(x, y, true))
}

/** Workbench: lit top with grained apron, chamfered legs, a lower shelf, plus the paint can, brush jar and top hat. */
function paintBench(ctx: Ctx, o: StudioOptions): void {
  const bench = o.layout.workbench
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, x, y, w, h, c)
  const bx = bench.x * D, topY = 109 * D
  const bw = bench.w * D
  // Legs and lower shelf first, so the top overlaps them.
  const legH = (bench.y + bench.h) * D - (topY + 12)
  for (const lx of [bx + 6, bx + bw - 16]) { R(lx, topY + 12, 10, legH, WOOD[0]); R(lx + 1, topY + 12, 8, legH - 1, WOOD[2]); R(lx + 1, topY + 12, 2, legH - 1, WOOD[1]); R(lx + 7, topY + 12, 2, legH - 1, WOOD[3]); R(lx + 8, topY + 12, 1, legH - 1, WOOD[4]) }
  const shelfY = (bench.y + bench.h) * D - 28
  R(bx + 12, shelfY, bw - 24, 8, WOOD[0]); R(bx + 14, shelfY + 1, bw - 28, 4, WOOD[3]); R(bx + 14, shelfY + 1, bw - 28, 1, WOOD[4]); R(bx + 14, shelfY + 5, bw - 28, 2, WOOD[1])
  // Tabletop: lit face, rounded front edge, grained apron, shadow underneath.
  R(bx, topY - 8, bw, 20, WOOD[0])
  R(bx + 4, topY - 6, bw - 8, 8, WOOD[4]); R(bx + 4, topY - 6, bw - 8, 1, P.paper[3]); R(bx + 4, topY + 1, bw - 8, 1, MID[3])
  R(bx + 2, topY + 2, bw - 4, 8, WOOD[3]); R(bx + 2, topY + 2, bw - 4, 1, WOOD[4]); R(bx + bw - 8, topY + 2, 6, 8, WOOD[4])
  R(bx + 4, topY + 10, bw - 8, 6, WOOD[1]); R(bx + 4, topY + 10, bw - 8, 1, WOOD[0])
  const rng = mulberry32(909)
  for (let x = bx + 12; x < bx + bw - 24; x += 24 + Math.floor(rng() * 20)) { R(x, topY - 3 + Math.floor(rng() * 4), 12 + Math.floor(rng() * 16), 1, MID[3]); R(x + 4, topY + 4 + Math.floor(rng() * 3), 10 + Math.floor(rng() * 12), 1, WOOD[2]) }
  // Paint can on the lower shelf.
  const cx = bx + 20, cy = shelfY - 20
  R(cx, cy + 2, 18, 18, WOOD[0]); R(cx + 1, cy + 3, 16, 16, STONE[3]); R(cx + 1, cy + 3, 4, 16, STONE[4]); R(cx + 13, cy + 3, 4, 16, STONE[2]); R(cx + 16, cy + 3, 1, 16, STONE[1])
  R(cx - 1, cy, 20, 4, STONE[0]); R(cx, cy + 1, 18, 2, STONE[2]); R(cx, cy + 1, 18, 1, STONE[4])
  R(cx + 3, cy + 6, 12, 5, P.paper[3]); R(cx + 3, cy + 6, 12, 1, P.paper[4]); R(cx + 5, cy + 8, 6, 1, P.sea[2]); R(cx + 5, cy + 10, 8, 1, P.sea[3])
  R(cx, cy - 1, 18, 3, P.sea[3]); R(cx + 3, cy + 2, 3, 6, P.sea[3]); R(cx + 11, cy + 2, 2, 4, P.sea[3]); R(cx + 3, cy + 7, 1, 1, P.sea[4])
  R(cx + 2, cy + 20, 14, 2, WOOD[1])
  // Brush jar: glazed ceramic with a lit band and three brushes of different heights.
  const jx = bx + bw - 26, jy = topY - 20
  R(jx + 6, jy - 6, 2, 12, WOOD[3]); R(jx + 6, jy - 8, 2, 3, P.flame[1]); R(jx + 7, jy - 8, 1, 2, P.flame[3])
  R(jx + 10, jy - 3, 2, 9, WOOD[2]); R(jx + 10, jy - 5, 2, 3, P.sea[3]); R(jx + 11, jy - 5, 1, 2, P.sea[4])
  R(jx + 14, jy - 5, 2, 11, WOOD[3]); R(jx + 14, jy - 8, 2, 4, P.sun[3]); R(jx + 15, jy - 8, 1, 3, P.sun[4])
  R(jx + 3, jy + 4, 16, 16, WOOD[0]); R(jx + 4, jy + 5, 14, 14, STONE[0]); R(jx + 4, jy + 5, 3, 14, STONE[1]); R(jx + 12, jy + 5, 4, 14, STONE[3]); R(jx + 15, jy + 5, 2, 14, STONE[4])
  R(jx + 4, jy + 10, 14, 3, STONE[2]); R(jx + 4, jy + 10, 14, 1, STONE[4]); R(jx + 3, jy + 19, 16, 1, WOOD[0])
  paintTopHat(ctx, bx + 36, topY - 3)
}

/** Corkboard frame (the ticket panel is a DOM overlay): mitred frame, cork surface, corner pins. */
function paintCorkboard(ctx: Ctx, o: StudioOptions): void {
  const c = o.layout.corkboard
  const x = c.x * D, y = c.y * D, w = c.w * D, h = c.h * D
  const R = (rx: number, ry: number, rw: number, rh: number, col: string) => dRect(ctx, rx, ry, rw, rh, col)
  R(x - 1, y - 1, w + 2, h + 2, WOOD[0]); R(x, y, w, h, WOOD[3])
  R(x, y, w, 1, WOOD[4]); R(x, y + 1, w, 1, WOOD[3]); R(x + w - 4, y, 4, h, WOOD[4]); R(x, y, 1, h, MID[3]); R(x, y + h - 4, w, 4, WOOD[2])
  for (let i = 0; i < 4; i++) { R(x + i, y + i, 1, 1, WOOD[1]); R(x + w - 1 - i, y + i, 1, 1, WOOD[1]); R(x + i, y + h - 1 - i, 1, 1, WOOD[1]); R(x + w - 1 - i, y + h - 1 - i, 1, 1, WOOD[1]) }
  R(x + 6, y + 6, w - 12, h - 12, WOOD[1]); R(x + 7, y + 7, w - 14, h - 14, MID[2])
  for (const [px, py] of [[x + 10, y + 10], [x + w - 13, y + 10], [x + 10, y + h - 13], [x + w - 13, y + h - 13]]) { R(px, py, 3, 3, WOOD[0]); R(px, py, 2, 2, P.flame[1]); R(px, py, 1, 1, P.flame[3]) }
}

/** Foreground layer for the studio: frames, wainscot, floor, stairs, lamps, shelf, plant, corkboard and bench props. */
export function paintStudioForeground(ctx: Ctx, o: StudioOptions): void {
  o.layout.windows.forEach(win => paintWindowFrame(ctx, win))
  paintWainscot(ctx, o)
  paintPlanks(ctx, 0, o.floorY * D, o.width * D, (o.height - o.floorY) * D, { plank: 14, joistStart: 24, joistPitch: 62 })
  paintStairs(ctx, o)
  if (!o.portrait) {
    const shelf = o.layout.shelf
    const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, x, y, w, h, c)
    const sx = shelf.x * D, sy = shelf.y * D
    paintPlant(ctx, o.layout.plant.x - 2, shelf.y)
    R(sx - 2, sy, shelf.w * D + 4, 6, WOOD[0]); R(sx - 1, sy + 1, shelf.w * D + 2, 1, WOOD[4]); R(sx - 1, sy + 2, shelf.w * D + 2, 2, WOOD[3]); R(sx - 1, sy + 4, shelf.w * D + 2, 1, WOOD[1])
    for (const bx of [sx + 4, sx + shelf.w * D - 8]) { R(bx, sy + 6, 4, 10, WOOD[0]); R(bx + 1, sy + 6, 2, 9, WOOD[2]); R(bx + 2, sy + 6, 1, 9, WOOD[3]); R(bx - 2, sy + 14, 8, 2, WOOD[0]); bolt(ctx, bx, sy + 8) }
    paintCorkboard(ctx, o)
    paintBench(ctx, o)
  }
  for (const lamp of lampPositions(o)) paintLamp(ctx, lamp.x, lamp.bottom)
  void drawDetailSprite; void defineSprite; void DetailGrid
}
