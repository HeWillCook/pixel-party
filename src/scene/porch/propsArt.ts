import { bayer, DETAIL, DetailGrid, dRect, drawDetailSprite, dth, shadeRegion, stampRegion } from '../detail'
import { P } from '../palette'
import { mulberry32 } from '../procedural'
import { defineSprite } from '../sprite'
import { bolt } from './deckArt'
import { paintStairRun } from './stairArt'
import type { Rect } from '../camera'

type Ctx = CanvasRenderingContext2D
const WOOD = P.wood
const MID = P.woodMid
const STONE = P.stone
const PAPER = P.paper

/** Slatted porch chair: chamfered back slats, capped post, a framed seat with apron and stretcher, striped cushion. */
export function paintChair(ctx: Ctx, cx: number, cy: number): void {
  const X = cx * 2, Y = cy * 2
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, X + x, Y + y, w, h, c)
  const rng = mulberry32(4401)
  // Back post with a capped top and grain.
  R(0, 0, 6, 68, WOOD[0]); R(1, 0, 4, 68, WOOD[2]); R(1, 0, 1, 68, WOOD[1]); R(4, 0, 1, 68, WOOD[3]); R(5, 0, 1, 68, WOOD[4])
  R(-1, 0, 8, 3, WOOD[1]); R(-1, 0, 8, 1, WOOD[4]); R(0, 2, 6, 1, WOOD[0])
  for (let y = 8; y < 56; y += 13 + Math.floor(rng() * 9)) R(2, y, 1, 5 + Math.floor(rng() * 7), MID[1])
  // Top rail, lit on top.
  R(4, 6, 56, 4, WOOD[2]); R(4, 6, 56, 1, WOOD[4]); R(4, 7, 56, 1, WOOD[3]); R(4, 9, 56, 1, WOOD[0])
  // Slats: chamfered, shaded on the left, lit on the right, nailed to the rail and seat.
  for (let x = 8; x < 58; x += 8) {
    R(x, 10, 4, 36, WOOD[2]); R(x, 10, 1, 36, WOOD[0]); R(x + 1, 10, 1, 36, WOOD[1]); R(x + 3, 10, 1, 36, WOOD[3])
    R(x + 1, 12, 1, 1, WOOD[0]); R(x + 2, 43, 1, 1, WOOD[0])
  }
  // Seat frame with a front apron and a cushion.
  R(4, 42, 62, 10, WOOD[0]); R(5, 43, 60, 8, WOOD[1]); R(5, 43, 60, 1, WOOD[3]); R(5, 50, 60, 1, WOOD[0]); R(62, 43, 3, 8, WOOD[2])
  R(8, 40, 54, 6, PAPER[2]); R(8, 40, 54, 1, PAPER[4]); R(8, 45, 54, 1, PAPER[1]); R(8, 40, 1, 6, PAPER[3]); R(61, 40, 1, 6, PAPER[3])
  for (let x = 14; x < 60; x += 9) R(x, 41, 3, 4, PAPER[3])
  // Legs with a lit edge and a stretcher between them.
  for (const lx of [8, 54]) { R(lx, 52, 6, 16, WOOD[0]); R(lx + 1, 52, 4, 15, WOOD[1]); R(lx + 4, 52, 1, 15, WOOD[3]); R(lx + 5, 52, 1, 15, WOOD[4]) }
  R(14, 62, 40, 3, WOOD[0]); R(14, 62, 40, 1, WOOD[3]); R(14, 63, 40, 1, WOOD[2])
  R(-1, 66, 70, 3, WOOD[0]); R(0, 66, 68, 1, WOOD[1])
}

/** Wooden radio with a speaker grille, a lit tuning dial with needle, knobs, a carry strap and rabbit-ear antenna, standing on the rack's capping rail. */
export function paintRadio(ctx: Ctx, rx: number, ry: number): void {
  const X = (rx + 1) * 2, Y = ry * 2
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, X + x, Y + y, w, h, c)
  // Antenna.
  for (let i = 0; i < 7; i++) { R(8 - Math.floor(i * 0.7), 4 - i, 1, 1, STONE[3]); R(13 + Math.floor(i * 0.8), 4 - i, 1, 1, STONE[3]) }
  R(7, -3, 1, 1, STONE[4]); R(19, -3, 1, 1, STONE[4])
  // Carry strap.
  R(9, 3, 12, 2, WOOD[0]); R(10, 3, 10, 1, WOOD[1])
  // Case.
  R(0, 5, 32, 13, WOOD[0]); R(1, 6, 30, 11, WOOD[2]); R(1, 6, 30, 1, WOOD[4]); R(1, 7, 29, 1, WOOD[3]); R(30, 6, 1, 11, WOOD[4]); R(1, 6, 1, 11, WOOD[1]); R(1, 16, 30, 1, WOOD[1])
  // Speaker grille (left): recessed, with cloth slits.
  R(3, 8, 10, 8, WOOD[0]); R(4, 9, 8, 6, STONE[0])
  for (let y = 9; y < 15; y += 2) R(4, y, 8, 1, STONE[2])
  R(4, 9, 8, 1, STONE[3]); R(11, 9, 1, 6, STONE[1])
  // Dial window with tick marks and a red needle.
  R(14, 8, 9, 5, WOOD[0]); R(15, 9, 7, 3, PAPER[3]); R(15, 9, 7, 1, PAPER[4])
  for (let x = 16; x < 22; x += 2) R(x, 11, 1, 1, WOOD[0])
  R(18, 9, 1, 3, P.flame[1])
  // Knobs and a tiny tone slider.
  for (const kx of [24, 27]) { R(kx, 8, 3, 3, STONE[0]); R(kx, 8, 2, 2, STONE[2]); R(kx, 8, 1, 1, STONE[4]) }
  R(24, 13, 6, 1, WOOD[0]); R(26, 13, 1, 1, PAPER[4])
  R(14, 14, 9, 1, WOOD[1])
}

/** Animated radio extras: the dial lamp and sound arcs rippling out of the speaker while sound is on. */
export function drawRadioWaves(ctx: Ctx, rx: number, ry: number, frame: number): void {
  const X = (rx + 1) * 2, Y = ry * 2
  dRect(ctx, X + 17, Y + 9, 3, 3, P.sun[3]); dRect(ctx, X + 18, Y + 10, 1, 1, P.sun[4])
  const ox = X + 33, oy = Y + 6
  for (let k = 0; k < 3; k++) {
    if ((frame + k * 2) % 6 >= 4) continue
    const r = 4 + k * 4
    for (let a = -10; a <= 62; a += 8) {
      const t = a * Math.PI / 180
      dRect(ctx, ox + Math.round(Math.cos(t) * r), oy - Math.round(Math.sin(t) * r), 1, 1, k === 0 ? P.sun[4] : k === 1 ? P.paper[4] : P.paper[3])
    }
  }
}

/** Potted fern-like plant: fanned leaves with a lit side, shaded side and midrib, in a terracotta pot with a saucer. */
export function paintPlant(ctx: Ctx, px: number, floor: number): void {
  const w = 30, h = 30
  const g = new DetailGrid(w, h)
  const cxp = 15, base = 18
  const leaves: Array<[number, number, number, number]> = [[-68, 15, 3.2, 5], [58, 16, 3.2, 5], [-42, 19, 3.4, 3], [38, 20, 3.4, 3], [-16, 17, 3, 1], [12, 18, 3.2, 1]]
  for (const [deg, length, width, droop] of leaves) {
    const a = deg * Math.PI / 180
    const dx = Math.sin(a), dy = -Math.cos(a)
    const steps = length * 3
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = cxp + dx * t * length
      const y = base + dy * t * length + droop * t * t * 3
      const tx = dx * 1, ty = dy * 1 + droop * 2 * t * 3 / length
      const norm = Math.hypot(tx, ty)
      const nx = -ty / norm, ny = tx / norm
      const half = width * Math.sin(Math.PI * Math.min(1, t ** 0.7)) * 0.5 + 0.4
      const litSide = nx > 0 ? 1 : -1
      for (let s = -half; s <= half; s += 0.5) {
        const mx = Math.round(x + nx * s), my = Math.round(y + ny * s)
        const lit = s * litSide
        const key = Math.abs(s) < 0.5 ? 'k' : lit > half * 0.35 ? 'l' : lit < -half * 0.3 ? 'd' : 'm'
        g.px(mx, my, key)
      }
    }
  }
  // Soil, pot and saucer.
  for (let y = 18; y < 30; y++) {
    const inset = y < 21 ? 0 : Math.floor((y - 20) / 4)
    const left = 4 + inset, right = 26 - inset
    for (let x = left; x < right; x++) {
      let key = 't'
      if (y < 21) key = y === 18 ? 'e' : 'e'
      if (y >= 21) key = x < left + 3 ? 'u' : x >= right - 3 ? 'h' : x >= right - 5 ? 'w' : 't'
      g.px(x, y, key)
    }
    g.px(left, y, 'x'); g.px(right - 1, y, 'x')
  }
  g.rect(3, 18, 24, 3, 'x'); g.rect(4, 18, 22, 1, 'e'); g.rect(4, 19, 22, 2, 't'); g.rect(22, 19, 4, 2, 'h'); g.rect(4, 19, 3, 2, 'u'); g.rect(8, 18, 14, 1, 'e')
  g.rect(5, 28, 20, 2, 'x'); g.rect(6, 28, 18, 1, 'u')
  const sprite = defineSprite(g.lines(), { k: P.foliage[4], l: P.foliage[3], m: P.foliage[2], d: P.foliage[1], t: WOOD[3], u: WOOD[2], w: WOOD[3], h: WOOD[4], x: WOOD[0], e: WOOD[1] })
  drawDetailSprite(ctx, sprite, px, floor - h / 2)
}

/** Pinned note: paper with a curled corner, header and text lines, a red pin, and a shadow on the wall. */
export function paintNote(ctx: Ctx, n: Rect): void {
  const X = n.x * 2, Y = n.y * 2
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, X + x, Y + y, w, h, c)
  R(-2, 5, 26, 33, WOOD[1])
  R(0, 3, 26, 33, PAPER[3]); R(0, 3, 26, 1, PAPER[4]); R(25, 3, 1, 33, PAPER[4]); R(0, 3, 1, 33, PAPER[2]); R(0, 35, 26, 1, PAPER[2])
  // Curled bottom-right corner: the back of the sheet shows, with a small shadow underneath.
  for (let i = 0; i < 8; i++) { R(26 - i - 1, 35 - 8 + i + 1, i + 1, 1, PAPER[2]); R(26 - i - 1, 35 - 8 + i + 1, 1, 1, PAPER[1]) }
  R(18, 27, 8, 1, WOOD[1]); R(17, 28, 1, 7, WOOD[1])
  for (let i = 0; i < 8; i++) R(25 - i, 36 + (i > 5 ? 0 : 0), 1, 0, WOOD[1])
  // Header and lines of text.
  R(4, 8, 12, 2, PAPER[0]); R(4, 8, 5, 2, WOOD[0])
  for (const [y, w] of [[14, 18], [18, 15], [22, 18], [26, 9]] as const) R(4, y, w, 1, PAPER[1])
  // Pin with a highlight and a short shadow.
  R(11, 0, 5, 5, WOOD[0]); R(12, 1, 3, 3, P.flame[1]); R(12, 1, 1, 1, P.flame[3]); R(14, 3, 1, 1, P.flame[0]); R(16, 3, 2, 2, WOOD[1])
}

/** Deck-edge sign: framed boards with grain, nail heads, post shadows. The label is a DOM overlay on the plain face. */
export function paintSign(ctx: Ctx, b: Rect, signH: number): void {
  const X = (b.x + 1) * 2, Y = (b.y + 1) * 2
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, X + x, Y + y, w, h, c)
  const W = (b.w - 2) * 2, H = signH * 2
  const rng = mulberry32(3333)
  // Posts and their shadows to the left.
  for (const px of [(b.x + 7) * 2, (b.x + b.w - 10) * 2]) {
    const py = (b.y + signH) * 2 - 2, ph = (b.h - signH + 1) * 2
    dRect(ctx, px - 3, py + 3, 3, ph - 2, WOOD[1])
    dRect(ctx, px, py, 6, ph, WOOD[0]); dRect(ctx, px + 1, py, 4, ph, WOOD[2]); dRect(ctx, px + 1, py, 1, ph, WOOD[1]); dRect(ctx, px + 4, py, 1, ph, WOOD[3]); dRect(ctx, px + 5, py, 1, ph, WOOD[4])
    dRect(ctx, px - 1, py + ph - 3, 8, 3, STONE[1]); dRect(ctx, px - 1, py + ph - 3, 8, 1, STONE[3]); dRect(ctx, px + 1, py + ph - 3, 1, 1, STONE[4])
    dRect(ctx, px + 2, py + 4, 1, 6, MID[1])
  }
  // Frame.
  R(0, 0, W, H, WOOD[0]); R(1, 1, W - 2, H - 2, WOOD[3])
  R(1, 1, W - 2, 1, WOOD[4]); R(1, 2, W - 2, 1, MID[3]); R(1, 1, 1, H - 2, MID[3]); R(W - 3, 1, 2, H - 2, WOOD[4]); R(1, H - 3, W - 2, 2, WOOD[2])
  for (let i = 0; i < 3; i++) { R(1 + i, 1 + i, 1, 1, WOOD[1]); R(W - 2 - i, 1 + i, 1, 1, WOOD[1]); R(1 + i, H - 2 - i, 1, 1, WOOD[1]); R(W - 2 - i, H - 2 - i, 1, 1, WOOD[1]) }
  // Face: three planks with seams and a quiet grain; the middle stays clean for the label.
  const fx = 6, fy = 6, fw = W - 12, fh = H - 12
  R(fx, fy, fw, fh, WOOD[4])
  const plank = Math.floor(fh / 3)
  for (let i = 0; i < 3; i++) {
    const y = fy + i * plank
    if (i > 0) { R(fx, y, fw, 1, MID[3]); R(fx, y + 1, fw, 1, WOOD[4]) }
    // plank end joint, staggered; grain streaks keep clear of it so they never form crosses
    const jx = fx + Math.floor(fw * (0.3 + 0.35 * ((i * 37) % 3) / 3))
    if (i !== 1) for (let s = 0; s < 3; s++) {
      const gx = fx + 4 + Math.floor(rng() * (fw - 40)), len = 10 + Math.floor(rng() * 18)
      if (gx < jx + 3 && gx + len > jx - 3) continue
      R(gx, y + 3 + Math.floor(rng() * (plank - 5)), len, 1, MID[3])
    }
    R(jx, y + (i > 0 ? 2 : 0), 1, plank - (i > 0 ? 2 : 0), MID[3])
  }
  R(fx, fy, fw, 1, PAPER[3])
  R(fx, fy + fh - 1, fw, 1, WOOD[3])
  // Nails: dark head with a bright pixel, at the corners. A face too short for two rows (the Upstairs sign) gets one nail at each end, centred:
  // two rows 2 px apart merged into a stray "E" beside the label.
  const tall = fh >= 14
  const rows = tall ? [fy + 3, fy + fh - 5] : [fy + Math.floor(fh / 2) - 1]
  for (const ny of rows) for (const nx of [fx + 3, fx + fw - 6]) { R(nx, ny, 2, 2, WOOD[0]); R(nx + 1, ny, 1, 1, WOOD[4]) }
}

/** Twisted hanging rope from the roof beam to the lantern ring. */
export function paintRope(ctx: Ctx, x: number, fromY: number, toY: number): void {
  for (let y = fromY * 2; y < toY * 2; y++) {
    dRect(ctx, x * 2 + 1, y, 1, 1, Math.floor(y / 2) % 2 ? WOOD[2] : WOOD[0])
    dRect(ctx, x * 2 + 2, y, 1, 1, Math.floor(y / 2) % 2 ? WOOD[3] : WOOD[1])
  }
}

/** Hanging lantern: capped cage, four-pane glass with a living flame, and a halo that warms the nearby sky. */
export function drawLantern(ctx: Ctx, lx: number, ly: number, frame: number): void {
  const X = lx * 2, Y = ly * 2
  const f = frame % 3
  const cx = 20
  // Halo first, behind the body: quantised rings that breathe with the flame.
  const radius = 26 + f
  shadeRegion(ctx, X + cx - radius, Y + 12 - radius + 6, radius * 2, radius * 2, (x, y) => {
    const d = Math.hypot(x - X - cx, (y - Y - 18) * 1.05)
    if (d > radius || d < 10) return null
    const level = (1 - d / radius) * 1.1
    return dth(level, x, y) ? (d < radius * 0.5 ? P.sky[3] : P.sky[2]) : null
  })
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, X + x, Y + y, w, h, c)
  // Ring, cap, cage.
  R(cx - 2, 0, 4, 3, STONE[0]); R(cx - 1, 1, 2, 1, STONE[3])
  for (let r = 0; r < 6; r++) { R(cx - 4 - r * 2, 3 + r, 8 + r * 4, 1, r < 2 ? WOOD[3] : WOOD[2]); R(cx - 4 - r * 2, 3 + r, 1, 1, WOOD[0]); R(cx + 3 + r * 2, 3 + r, 1, 1, WOOD[0]); R(cx + 1 + r * 2, 3 + r, 2, 1, WOOD[4]) }
  R(cx - 16, 9, 32, 2, WOOD[0]); R(cx - 15, 9, 30, 1, WOOD[1]); R(cx + 10, 9, 5, 1, WOOD[3])
  R(cx - 14, 11, 28, 22, WOOD[0])
  R(cx - 12, 12, 24, 20, P.sun[3])
  shadeRegion(ctx, X + cx - 12, Y + 12, 24, 20, (x, y) => {
    const dx = (x - X - cx) / 12, dy = (y - Y - 22) / 10
    const d = Math.hypot(dx, dy)
    if (d < 0.3 + f * 0.02) return P.sun[4]
    return d < 0.62 ? P.sun[3] : d < 0.9 ? P.sun[2] : P.flame[2]
  })
  R(cx - 1, 12, 2, 20, WOOD[0]); R(cx + 1, 12, 1, 20, STONE[2]); R(cx - 12, 21, 24, 1, WOOD[0])
  R(cx - 12, 12, 1, 20, WOOD[1]); R(cx + 11, 12, 1, 20, P.flame[3])
  // Flame: a teardrop of three layers, flickering over a three-frame loop.
  const tip = [0, 2, 1][f]
  const widths = [1, 2, 4, 6, 6, 6, 4, 2]
  widths.forEach((w, i) => R(cx - w / 2, 15 - tip + i * 2 - (i > 5 ? 1 : 0), w, 2, P.flame[1]))
  widths.forEach((w, i) => { if (w > 2) R(cx - (w - 2) / 2, 17 - tip + i * 2 - (i > 5 ? 1 : 0), w - 2, 2, P.flame[2]) })
  R(cx - 1, 23, 2, 4, P.flame[3]); R(cx - 1, 25, 2, 2, P.flame[4])
  R(cx - 1, 29, 2, 1, WOOD[0])
  // Base plate with a lit edge.
  R(cx - 14, 31, 28, 2, WOOD[0]); R(cx - 12, 33, 24, 3, WOOD[1]); R(cx - 10, 36, 20, 2, WOOD[0]); R(cx + 6, 33, 5, 2, WOOD[3]); R(cx - 14, 31, 1, 1, WOOD[2])
  R(cx - 2, 38, 4, 2, STONE[1]); R(cx - 1, 38, 1, 1, STONE[4])
  void bayer; void bolt; void stampRegion
}

/**
 * The deck hatch: a framed opening in the boards with the top treads of the stair showing in the dark, its lid
 * propped open on iron hinges behind it (we see the lid's underside: boards and battens), and the sign beside it
 * on two posts. The stair continues straight down through the floor cutaway and into the basement.
 */
export function paintHatch(ctx: Ctx, hatch: { opening: Rect; sign: Rect }): void {
  const { opening: o, sign } = hatch
  const X = o.x * 2, Y = o.y * 2, W = o.w * 2, H = o.h * 2
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, X + x, Y + y, w, h, c)
  // Raised lid first (it is behind the coaming): a slightly tapered panel of three boards and two battens.
  const lidH = 18
  for (let r = 0; r < lidH; r++) {
    const inset = Math.round(r * 0.12)
    const y = -2 - lidH + r
    R(inset, y, W - inset * 2, 1, r % 6 === 0 ? WOOD[0] : r % 6 === 1 ? WOOD[3] : WOOD[2])
    R(inset, y, 1, 1, WOOD[0]); R(W - inset - 1, y, 1, 1, WOOD[0])
    R(W - inset - 3, y, 2, 1, r % 6 === 0 ? WOOD[3] : WOOD[3])
  }
  R(0, -2 - lidH, W, 1, WOOD[4]) // lit top edge of the lid
  for (const bx of [14, W - 18]) { R(bx, -lidH - 1, 4, lidH - 1, WOOD[1]); R(bx, -lidH - 1, 1, lidH - 1, WOOD[0]); R(bx + 3, -lidH - 1, 1, lidH - 1, WOOD[3]); R(bx + 1, -lidH + 3, 1, 1, STONE[3]); R(bx + 1, -5, 1, 1, STONE[3]) }
  // Iron hinges where the lid meets the back of the coaming.
  for (const hx of [5, W - 17]) { R(hx, -6, 12, 4, STONE[0]); R(hx + 1, -5, 10, 2, STONE[2]); R(hx + 1, -5, 10, 1, STONE[4]); bolt(ctx, X + hx + 2, Y - 5); bolt(ctx, X + hx + 8, Y - 5) }
  // Prop stay: a short iron arm from the lid to the coaming.
  for (let i = 0; i < 9; i++) R(W - 22 + i, -12 + Math.round(i * 0.9), 1, 2, STONE[3])
  // Shadow on the boards to the left, thrown by the low sun, then the coaming: a raised timber frame round the shaft.
  R(-7, 6, 5, H, WOOD[1])
  R(-5, -2, W + 10, H + 6, WOOD[0]); R(-4, -1, W + 8, H + 4, WOOD[3])
  R(-4, -1, W + 8, 2, WOOD[4]); R(W + 2, -1, 2, H + 4, WOOD[4]); R(-4, -1, 1, H + 4, WOOD[2]); R(-4, H + 1, W + 8, 2, WOOD[2])
  // The shaft is exactly the stair's footprint (`opening.x`..`+w`): the same run, painted by the same routine, as in the floor cutaway
  // and the basement below, so the three read as one column. Its handrail climbs on above the deck as a newel post.
  R(0, 2, W, 1, P.sky[0])
  paintStairRun(ctx, X, W, Y + 3, Y + H - 1)
  R(W + 2, -9, 2, 10, WOOD[0]); R(W + 2, -9, 1, 10, WOOD[3]); R(W + 3, -9, 1, 10, WOOD[4]); R(W + 1, -10, 4, 2, WOOD[0]); R(W + 2, -10, 2, 1, WOOD[4])
  // Sign beside the hatch: the board, then its posts into the deck.
  paintSign(ctx, { x: sign.x - 1, y: sign.y - 1, w: sign.w + 2, h: sign.h + 11 }, sign.h)
}

/**
 * The plank on the house wall that points left, along the wall, to the gallery: an arrow pointing left on the plank's
 * left end (its label is HTML on top), hung from two nails with a soft shadow below.
 */
export function paintWallSign(ctx: Ctx, sign: Rect): void {
  const X = sign.x * 2, Y = sign.y * 2, W = sign.w * 2, H = sign.h * 2
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, X + x, Y + y, w, h, c)
  R(1, H, W, 3, WOOD[1])
  R(0, 0, W, H, WOOD[0]); R(1, 1, W - 2, H - 2, WOOD[3]); R(1, 1, W - 2, 1, WOOD[4]); R(1, 2, 1, H - 3, WOOD[2]); R(W - 3, 1, 2, H - 2, WOOD[4]); R(1, H - 3, W - 2, 2, WOOD[2])
  // The left end is cut to a point; the arrow is painted on it.
  for (let i = 0; i < 5; i++) { R(i, 0, 1, H, WOOD[1]); R(0, i, 5 - i, 1, WOOD[1]); R(0, H - 1 - i, 5 - i, 1, WOOD[1]) }
  for (let i = 0; i < 4; i++) { R(7 + i, Math.floor(H / 2) - i, 1, 1 + i * 2, P.flame[1]); R(7 + i, Math.floor(H / 2) - i, 1, 1, P.flame[3]) }
  R(10, Math.floor(H / 2) - 1, 5, 3, P.flame[1]); R(10, Math.floor(H / 2) - 1, 5, 1, P.flame[3])
  bolt(ctx, X + W - 5, Y + 3); bolt(ctx, X + W - 5, Y + H - 5)
  for (let x = 17; x < W - 8; x += 11 + (x % 5)) R(x, 3 + (x % 3) * 2, 6 + (x % 4), 1, MID[3])
}

/** The side table under the radio: a top plank with a lit edge, two turned legs and a low stretcher. `x`,`y`,`w` in scene units. */
export function paintSideTable(ctx: Ctx, table: { x: number; y: number; w: number }, floor: number): void {
  const X = table.x * 2, Y = table.y * 2, W = table.w * 2
  const legH = (floor - table.y) * 2 - 6
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, X + x, Y + y, w, h, c)
  R(2, legH + 6, W, 3, WOOD[1]) // shadow on the deck
  for (const lx of [3, W - 8]) { R(lx, 6, 5, legH, WOOD[0]); R(lx + 1, 6, 3, legH, WOOD[2]); R(lx + 1, 6, 1, legH, WOOD[1]); R(lx + 3, 6, 1, legH, WOOD[4]); R(lx - 1, legH + 4, 7, 2, WOOD[0]) }
  R(8, Math.round(legH * 0.62), W - 16, 3, WOOD[0]); R(8, Math.round(legH * 0.62), W - 16, 1, WOOD[3])
  R(0, 0, W, 7, WOOD[0]); R(1, 1, W - 2, 5, WOOD[3]); R(1, 1, W - 2, 1, WOOD[4]); R(1, 5, W - 2, 1, WOOD[2]); R(W - 3, 1, 2, 5, WOOD[4])
  for (let x = 6; x < W - 6; x += 13) R(x, 3, 6, 1, MID[3])
}
