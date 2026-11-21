import { dth, shadeRegion, stampRegion, DETAIL } from '../detail'
import { P } from '../palette'

type Ctx = CanvasRenderingContext2D
const FUR = P.fur, PAPER = P.paper, FLAME = P.flame

/** Frames per breath (slow, 2 s) and between tail flicks (5 s). */
export const BREATH_PERIOD = 24
export const FLICK_PERIOD = 60

/**
 * Haiku's art lives here so the porch's napping cat and the judge cat on every other screen are drawn by the same
 * hands: one coat (cream, with a plum-brown tabby cap and tail rings), one muzzle, one set of white socks, and one
 * red beret. Everything is authored in detail pixels into a `PixelBuf`, then flushed through `shadeRegion`.
 */
export interface Ramp { line: string; deep: string; shade: string; mid: string; light: string }

/** Cream fur, lit warm from the upper right like the rest of the scene. */
export const COAT: Ramp = { line: FUR[0], deep: FUR[2], shade: FUR[3], mid: FUR[4], light: PAPER[4] }
/** Tabby cap, stripes and tail rings: the same coat one step darker. */
export const TABBY: Ramp = { line: FUR[0], deep: FUR[1], shade: FUR[1], mid: FUR[2], light: FUR[3] }
/** White socks, muzzle, and the painter's smock. */
export const WHITE: Ramp = { line: FUR[0], deep: PAPER[2], shade: PAPER[3], mid: PAPER[4], light: PAPER[4] }
export const BERET: Ramp = { line: P.wood[0], deep: FLAME[0], shade: FLAME[0], mid: FLAME[1], light: FLAME[2] }
const BERET_BAND: Ramp = { line: P.wood[0], deep: P.wood[0], shade: P.wood[1], mid: FLAME[0], light: FLAME[1] }
export const MARK = FUR[2]

/** A detail-pixel scratch buffer (palette hex per cell) positioned in scene detail coordinates. */
export class PixelBuf {
  private readonly cells: Array<string | null>
  constructor(readonly w: number, readonly h: number, readonly originX = 0, readonly originY = 0) { this.cells = new Array<string | null>(w * h).fill(null) }
  set(x: number, y: number, colour: string): void {
    const i = Math.round(x) - this.originX, j = Math.round(y) - this.originY
    if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.cells[j * this.w + i] = colour
  }
  rect(x: number, y: number, w: number, h: number, colour: string): void {
    const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + w), y1 = Math.round(y + h)
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.set(i, j, colour)
  }
  get(x: number, y: number): string | null {
    const i = x - this.originX, j = y - this.originY
    return i >= 0 && j >= 0 && i < this.w && j < this.h ? this.cells[j * this.w + i] : null
  }
  /** Paint the buffer onto a context that is pre-scaled by DETAIL. */
  flush(ctx: Ctx): void { shadeRegion(ctx, this.originX, this.originY, this.w, this.h, (x, y) => this.cells[(y - this.originY) * this.w + (x - this.originX)]) }
}

export type Inside = (x: number, y: number) => boolean
export interface Box { x: number; y: number; w: number; h: number }

export const ellipse = (cx: number, cy: number, rx: number, ry: number): Inside => (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1
export const triangle = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): Inside => (x, y) => {
  const px = x + 0.5, py = y + 0.5
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}
/** A tapered stroke from (ax, ay) with radius ra to (bx, by) with radius rb. */
export const capsule = (ax: number, ay: number, bx: number, by: number, ra: number, rb: number): Inside => (x, y) => {
  const px = x + 0.5 - ax, py = y + 0.5 - ay, dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - dx * t, py - dy * t) <= ra + (rb - ra) * t
}
export const union = (...masks: Inside[]): Inside => (x, y) => masks.some(mask => mask(x, y))
export const boxOf = (x0: number, y0: number, x1: number, y1: number): Box => ({ x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1) - Math.floor(x0), h: Math.ceil(y1) - Math.floor(y0) })

const hash = (x: number, y: number) => (Math.imul(x + 17, 73856093) ^ Math.imul(y + 31, 19349663)) >>> 0

/**
 * Fill a shape with outline, rim light on the top and right, a shadow band underneath and on the left that
 * breaks up with a dither, and sparse fur flecks. `alt` swaps the ramp per pixel (stripes, tail rings).
 */
export function paintShape(buf: PixelBuf, inside: Inside, box: Box, ramp: Ramp, opts: { alt?: (x: number, y: number) => Ramp | null; fur?: boolean } = {}): void {
  const { x: bx, y: by, w, h } = box
  const mask = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) mask[j * w + i] = inside(bx + i, by + j) ? 1 : 0
  const at = (x: number, y: number) => x >= bx && y >= by && x < bx + w && y < by + h && mask[(y - by) * w + (x - bx)] === 1
  for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) {
    if (!at(x, y)) continue
    const r = opts.alt?.(x, y) ?? ramp
    if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) { buf.set(x, y, r.line); continue }
    let colour = r.mid
    if (!at(x, y - 2) || !at(x + 2, y)) colour = r.light
    else if (!at(x, y + 2)) colour = r.deep
    else if (!at(x - 2, y)) colour = r.shade
    else if (!at(x - 3, y) || !at(x, y + 3) || !at(x - 4, y + 1) || !at(x - 1, y + 4)) colour = dth(0.5, x, y) ? r.shade : r.mid
    buf.set(x, y, colour)
  }
  if (!opts.fur) return
  for (let y = by + 4; y < by + h - 4; y++) for (let x = bx + 4; x < bx + w - 4; x++) {
    if (!at(x, y) || !at(x - 4, y) || !at(x + 4, y) || !at(x, y - 4) || !at(x, y + 4)) continue
    const n = hash(x, y) % 53
    const r = opts.alt?.(x, y) ?? ramp
    if (n === 0) { buf.set(x, y, r.shade); buf.set(x, y + 1, r.shade) }
    else if (n === 1) buf.set(x, y, r.light)
  }
}

/** A chain of discs (x, y, radius), shaded like any other shape; `ringed` bands every few samples and darkens the tip. */
export function paintChain(buf: PixelBuf, pts: ReadonlyArray<readonly [number, number, number]>, ramp: Ramp, ringEvery = 0, tipSamples = 0): void {
  const pad = Math.max(...pts.map(p => p[2])) + 1
  const box = boxOf(Math.min(...pts.map(p => p[0])) - pad, Math.min(...pts.map(p => p[1])) - pad, Math.max(...pts.map(p => p[0])) + pad, Math.max(...pts.map(p => p[1])) + pad)
  const index = new Map<number, number>()
  const key = (x: number, y: number) => y * 4096 + x
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    let best = -1, bestMargin = 0
    for (let i = 0; i < pts.length; i++) {
      const margin = pts[i][2] - Math.hypot(x + 0.5 - pts[i][0], y + 0.5 - pts[i][1])
      if (margin >= 0 && (best < 0 || margin > bestMargin)) { best = i; bestMargin = margin }
    }
    if (best >= 0) index.set(key(x, y), best)
  }
  const alt = (x: number, y: number): Ramp | null => {
    const i = index.get(key(x, y))
    if (i === undefined) return null
    if (tipSamples && i >= pts.length - tipSamples) return { line: FUR[0], deep: FUR[0], shade: FUR[1], mid: FUR[1], light: FUR[2] }
    if (ringEvery && i % ringEvery < Math.ceil(ringEvery / 2.4) && i > 1) return TABBY
    return null
  }
  paintShape(buf, (x, y) => index.has(key(x, y)), box, ramp, { alt })
}

/** The shared muzzle: pale patch, a pink nose and a mouth. `open` is the little O of a guess. */
export function paintMuzzle(buf: PixelBuf, cx: number, cy: number, mouth: 'closed' | 'open' | 'smile' | 'frown' = 'closed'): void {
  paintShape(buf, ellipse(cx, cy + 0.5, 6, 3.6), boxOf(cx - 7, cy - 4, cx + 7, cy + 5), { ...WHITE, line: FUR[2], deep: PAPER[2], shade: PAPER[3] })
  buf.rect(cx - 2, cy - 2, 5, 1, P.ui[3]); buf.rect(cx - 1, cy - 1, 3, 1, P.ui[3]); buf.set(cx, cy, P.ui[3]); buf.set(cx - 2, cy - 2, P.ui[4])
  if (mouth === 'open') {
    buf.rect(cx - 1, cy + 1, 3, 3, FUR[0]); buf.rect(cx - 1, cy + 2, 3, 1, FLAME[1]); buf.set(cx, cy + 3, FLAME[2])
  } else if (mouth === 'frown') {
    // The corners turn down: a short stub under the nose, then an arch over the chin.
    buf.set(cx, cy + 1, FUR[0]); buf.rect(cx - 1, cy + 2, 3, 1, FUR[0]); buf.set(cx - 2, cy + 3, FUR[0]); buf.set(cx + 2, cy + 3, FUR[0]); buf.rect(cx - 4, cy + 4, 2, 1, FUR[0]); buf.rect(cx + 3, cy + 4, 2, 1, FUR[0])
  } else {
    buf.set(cx, cy + 1, FUR[0]); buf.set(cx, cy + 2, FUR[0])
    buf.set(cx - 1, cy + 3, FUR[0]); buf.set(cx - 2, cy + 3, FUR[0]); buf.set(cx - 3, cy + 2, FUR[0])
    buf.set(cx + 1, cy + 3, FUR[0]); buf.set(cx + 2, cy + 3, FUR[0]); buf.set(cx + 3, cy + 2, FUR[0])
    if (mouth === 'smile') { buf.set(cx - 4, cy + 1, FUR[0]); buf.set(cx + 4, cy + 1, FUR[0]) }
  }
}

/** The shared tabby cap: three stripes on the forehead and a pair of stripes on each cheek. */
export function paintHeadMarks(buf: PixelBuf, cx: number, top: number, left: number, right: number, cheekY: number): void {
  buf.rect(cx, top, 1, 5, MARK); buf.rect(cx - 4, top + 1, 1, 3, MARK); buf.rect(cx + 4, top + 1, 1, 3, MARK)
  buf.rect(cx - 5, top + 2, 1, 2, MARK); buf.rect(cx + 5, top + 2, 1, 2, MARK)
  buf.rect(left, cheekY, 4, 1, MARK); buf.rect(left + 1, cheekY + 2, 3, 1, MARK)
  buf.rect(right - 4, cheekY, 4, 1, MARK); buf.rect(right - 4, cheekY + 2, 3, 1, MARK)
}

/** The red beret: a flat tam with a stalk, folds, a band, and (optionally) a lobe that droops over one side. */
export function paintBeret(buf: PixelBuf, cx: number, cy: number, rx = 11.5, ry = 5, droop = 0): void {
  const lobe = droop ? ellipse(cx + rx * 0.62, cy + ry * 0.55 + droop / 2, rx * 0.5, ry * 0.7 + droop / 2) : () => false
  const body = union(ellipse(cx, cy, rx, ry), lobe)
  const box = boxOf(cx - rx - 2, cy - ry - 3, cx + rx * 1.3 + 2, cy + ry + droop + 3)
  paintShape(buf, body, box, BERET, { alt: (x, y) => (y >= cy + ry * 0.5 && Math.abs(x + 0.5 - cx) < rx * 0.88 ? BERET_BAND : null) })
  buf.rect(cx - 1, cy - ry - 2, 2, 3, P.wood[0]); buf.set(cx, cy - ry - 2, P.wood[3])
  for (let i = 0; i < 4; i++) { buf.set(cx - 2 - i * 2, cy - 1 + Math.round(i * 0.6), FLAME[0]); buf.set(cx + 2 + i * 2, cy - 1 + Math.round(i * 0.6), FLAME[0]) }
  buf.rect(cx + 1, cy - ry + 1, 3, 1, FLAME[3]); buf.set(cx + 4, cy - ry + 2, FLAME[3])
}

// --- The sleeping cat ------------------------------------------------------------------------------------------

export const SLEEPER_W = 54
export const SLEEPER_H = 24
export interface Sleeper { breath: number; flick: number; beret?: boolean }

/**
 * Curled up asleep, 54x24 detail pixels from (ox, oy): head at the left on its white paws, the tabby back arching
 * over the body, and the ringed tail lying along the front with its tip lifting when it flicks.
 */
export function paintSleeper(buf: PixelBuf, ox: number, oy: number, o: Sleeper): void {
  const R = (x: number, y: number, w: number, h: number, c: string) => buf.rect(ox + x, oy + y, w, h, c)
  const E = (cx: number, cy: number, rx: number, ry: number) => ellipse(ox + cx, oy + cy, rx, ry)
  const T = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => triangle(ox + ax, oy + ay, ox + bx, oy + by, ox + cx, oy + cy)
  const lift = o.breath
  // Body and haunch, with the back rising a detail pixel on the in-breath; tabby stripes drop from the spine.
  const body = union(E(37, 12.6 - lift * 0.6, 16.5, 10.6 + lift * 0.6), E(46, 14.2 - lift * 0.4, 8, 8.3 + lift * 0.4), E(24.5, 15.5, 7, 6.2))
  const topOf = (x: number) => { for (let y = 0; y < SLEEPER_H; y++) if (body(ox + x, oy + y)) return y; return 99 }
  paintShape(buf, body, boxOf(ox + 6, oy + 3, ox + 55, oy + 25), COAT, {
    fur: true,
    alt: (x, y) => { const lx = x - ox, ly = y - oy, top = topOf(lx); return lx > 24 && ly > top + 1 && ly < top + 9 && ((lx + Math.floor(ly * 0.45)) % 8) < 2 ? TABBY : null },
  })
  // Tail: lies along the front from the rump, tip curling up (and lifting when it flicks).
  const lifts = [0, 3, 6]
  const tail: Array<[number, number, number]> = []
  for (let i = 0; i <= 26; i++) {
    const t = i / 26, x = 51 - t * 23
    const curl = Math.max(0, t - 0.55) / 0.45
    tail.push([ox + x, oy + 19.6 + Math.sin(t * Math.PI) * 0.6 - curl * 1.2 - lifts[o.flick] * curl ** 1.6, 3.4 - t * 0.8])
  }
  paintChain(buf, tail, COAT, 7, 4)
  // Head resting on the paws: ears tucked, tabby cap, closed eyes, muzzle.
  const head = union(E(14, 15.2, 10.8, 8.4), T(3, 19, 2, 23, 7, 22), T(25, 19, 26, 23, 21, 22))
  const ears = [T(5.5, 11, 7.5, 1.5, 14, 8), T(15, 8, 19.5, 1, 23, 11)]
  for (const ear of ears) paintShape(buf, ear, boxOf(ox + 4, oy, ox + 25, oy + 12), COAT)
  R(8, 4, 2, 3, P.ui[3]); R(8, 3, 1, 1, FUR[3]); R(19, 4, 2, 3, P.ui[3]); R(20, 3, 1, 1, FUR[3])
  paintShape(buf, head, boxOf(ox + 1, oy + 6, ox + 27, oy + 24), COAT, { fur: true })
  paintHeadMarks(buf, ox + 14, oy + 8, ox + 5, ox + 24, oy + 15)
  for (const ex of [8, 17]) { R(ex, 14, 5, 1, FUR[0]); R(ex, 15, 1, 1, FUR[0]); R(ex + 4, 15, 1, 1, FUR[0]); R(ex + 1, 16, 3, 1, FUR[0]); R(ex + 1, 13, 3, 1, FUR[2]) }
  paintMuzzle(buf, ox + 14, oy + 18, 'closed')
  for (const [dy, len] of [[16, 6], [18, 7], [20, 6]] as const) { R(-len + 3, dy, len, 1, PAPER[3]); R(24, dy - (dy === 20 ? 0 : 1), len - 3, 1, PAPER[4]) }
  // White socks tucked under the chin.
  paintShape(buf, E(9.5, 21.3, 5.4, 2.7), boxOf(ox + 3, oy + 17, ox + 16, oy + 24), WHITE)
  paintShape(buf, E(18.5, 21.5, 4.8, 2.5), boxOf(ox + 12, oy + 17, ox + 25, oy + 24), WHITE)
  R(7, 21, 1, 2, PAPER[2]); R(10, 21, 1, 2, PAPER[2]); R(17, 21, 1, 2, PAPER[2]); R(20, 21, 1, 2, PAPER[2])
  if (o.beret) paintBeret(buf, ox + 15, oy + 4.5, 9.5, 4, 0)
}

/** Which breathing / tail pose to show on a given frame. */
export function catPose(frame: number): { breath: number; flick: number } {
  const breath = frame % BREATH_PERIOD < BREATH_PERIOD / 2 ? 0 : 1
  const phase = frame % FLICK_PERIOD
  const flick = phase >= 52 && phase < 56 ? (phase === 53 || phase === 54 ? 2 : 1) : 0
  return { breath, flick }
}

/**
 * The porch's napper: Haiku asleep on the chair cushion, beret off and hung over the post beside her (it sits
 * over the post's cap, the loose end drooping down the front). `x`/`y` are the cat's scene position.
 */
export function drawCat(ctx: Ctx, x: number, y: number, frame: number, chair = true): void {
  const { breath, flick } = catPose(frame)
  const region = { x: x - 7, y: y - 17, w: 46, h: 30 }
  const paint = (target: Ctx) => {
    const buf = new PixelBuf(region.w * DETAIL, region.h * DETAIL, region.x * DETAIL, region.y * DETAIL)
    paintSleeper(buf, x * DETAIL, y * DETAIL, { breath, flick })
    // On the chair the beret hangs over the post beside her; on the bare deck it lies by her tail.
    if (chair) paintBeret(buf, x * DETAIL - 3, y * DETAIL - 26, 7.5, 3.4, 3)
    else paintBeret(buf, x * DETAIL + 58, y * DETAIL + 20, 7.5, 3.4, 0)
    buf.flush(target)
  }
  if (!stampRegion(ctx, `cat|${x}|${y}|${breath}|${flick}|${chair ? 1 : 0}`, region.x, region.y, region.w, region.h, paint)) paint(ctx)
}
