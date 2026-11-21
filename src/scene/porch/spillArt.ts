import { DETAIL } from '../detail'
import { P } from '../palette'
import { boxOf, capsule, ellipse, PixelBuf, paintShape, union, type Box, type Inside, type Ramp } from './catArt'
import type { Composition } from '../camera'
import { porchHaiku } from './layout'

type Ctx = CanvasRenderingContext2D
const D = DETAIL

const paint = (c: readonly string[]): Ramp => ({ line: c[0], deep: c[0], shade: c[1], mid: c[2], light: c[3] })
const RED = paint([P.flame[0], P.flame[1], P.flame[2], P.flame[3]])
const BLUE = paint([P.sea[0], P.sea[1], P.sea[2], P.sea[4]])
const YELLOW = paint([P.sun[1], P.sun[2], P.sun[3], P.sun[4]])
const TIN: Ramp = { line: P.stone[0], deep: P.stone[1], shade: P.stone[2], mid: P.stone[3], light: P.stone[4] }

/** Where things lie, in scene units: puddles (centre, radii), the tipped pot and its lid, and the paw prints leading away. */
interface Spill {
  puddles: Array<{ c: Ramp; x: number; y: number; rx: number; ry: number }>
  drips: Array<{ c: Ramp; x: number; y0: number; y1: number }>
  pot: { x: number; y: number }
  lid: { x: number; y: number }
  prints: Array<{ c: Ramp; x: number; y: number }>
}
const SPILLS: Record<Composition, Spill> = {
  landscape: {
    puddles: [
      { c: RED, x: 58, y: 160, rx: 17, ry: 3.8 }, { c: YELLOW, x: 43, y: 163, rx: 8, ry: 2.6 }, { c: BLUE, x: 79, y: 162.5, rx: 12, ry: 3.1 },
      { c: RED, x: 99, y: 166.5, rx: 3.4, ry: 1.3 }, { c: YELLOW, x: 36, y: 157, rx: 2.4, ry: 1 }, { c: BLUE, x: 68, y: 168, rx: 3, ry: 1.1 },
    ],
    drips: [{ c: RED, x: 52, y0: 145, y1: 157 }, { c: YELLOW, x: 61, y0: 146, y1: 156 }, { c: BLUE, x: 67, y0: 145, y1: 154 }],
    pot: { x: 84, y: 152 }, lid: { x: 102, y: 162 },
    prints: [{ c: BLUE, x: 88, y: 167 }, { c: BLUE, x: 95, y: 169.4 }, { c: BLUE, x: 102, y: 167.8 }],
  },
  portrait: {
    puddles: [
      { c: RED, x: 56, y: 266, rx: 15, ry: 3.4 }, { c: YELLOW, x: 45, y: 269.5, rx: 7, ry: 2.2 }, { c: BLUE, x: 78, y: 268, rx: 10, ry: 2.8 },
      { c: RED, x: 36, y: 262.5, rx: 2.4, ry: 1 }, { c: BLUE, x: 62, y: 271, rx: 2.6, ry: 1 },
    ],
    drips: [],
    pot: { x: 32, y: 266 }, lid: { x: 70, y: 272 },
    prints: [{ c: BLUE, x: 83, y: 271 }, { c: BLUE, x: 91, y: 272 }],
  },
}

/** A puddle: a blob with a lit rim (the wet edge catching the sun), a darker body and a glint. */
function blob(buf: PixelBuf, p: Spill['puddles'][number]): void {
  const cx = p.x * D, cy = p.y * D, rx = p.rx * D, ry = p.ry * D
  // A lumpy outline: three overlapping discs, so no puddle is a clean ellipse.
  const shape: Inside = union(ellipse(cx, cy, rx, ry), ellipse(cx - rx * 0.45, cy + ry * 0.2, rx * 0.55, ry * 0.9), ellipse(cx + rx * 0.5, cy - ry * 0.15, rx * 0.5, ry * 0.85))
  const box: Box = boxOf(cx - rx * 1.3 - 2, cy - ry * 1.3 - 2, cx + rx * 1.3 + 2, cy + ry * 1.3 + 2)
  paintShape(buf, shape, box, p.c)
  if (p.rx > 5) { buf.rect(Math.round(cx - rx * 0.3), Math.round(cy - ry * 0.35), Math.max(2, Math.round(rx * 0.28)), 1, P.paper[4]) }
}

function paw(buf: PixelBuf, x: number, y: number, c: Ramp): void {
  paintShape(buf, ellipse(x * D, y * D, 2.4, 1.9), boxOf(x * D - 4, y * D - 4, x * D + 4, y * D + 4), c)
  for (const dx of [-3, 0, 3]) paintShape(buf, ellipse(x * D + dx, y * D - 3.4 + (dx === 0 ? -1 : 0), 1.1, 1.1), boxOf(x * D + dx - 2, y * D - 7, x * D + dx + 2, y * D - 1), c)
}

/** The knocked-over pot lying on its side: a tin can with its open mouth toward the spill, a red label, a bail handle. */
function tippedPot(buf: PixelBuf, x: number, y: number): void {
  const X = x * D, Y = y * D
  paintShape(buf, ellipse(X + 12, Y + 12, 17, 2.2), boxOf(X - 6, Y + 9, X + 30, Y + 16), { ...TIN, line: P.wood[0], deep: P.wood[1], shade: P.wood[1], mid: P.wood[1], light: P.wood[2] }) // shadow on the boards
  paintShape(buf, union(ellipse(X + 12, Y + 6, 12, 6.2), ellipse(X + 5, Y + 6, 4, 6.2)), boxOf(X - 2, Y - 1, X + 26, Y + 14), TIN)
  paintShape(buf, ellipse(X + 5, Y + 6, 3.2, 6.2), boxOf(X, Y - 1, X + 12, Y + 14), { ...TIN, mid: P.wood[0], shade: P.wood[0], deep: P.wood[0], light: P.stone[2] }) // the open mouth, dark inside
  buf.rect(X + 8, Y + 1, 8, 10, P.flame[1]); buf.rect(X + 8, Y + 1, 8, 1, P.flame[3]); buf.rect(X + 9, Y + 5, 6, 2, P.paper[4]); buf.rect(X + 8, Y + 10, 8, 1, P.flame[0])
  buf.rect(X + 24, Y + 3, 5, 1, P.stone[0]); buf.rect(X + 28, Y + 4, 1, 4, P.stone[0]); buf.rect(X + 25, Y + 8, 3, 1, P.stone[0]) // the bail handle, fallen back
  buf.rect(X + 1, Y + 11, 4, 3, P.flame[2]); buf.rect(X, Y + 12, 2, 2, P.flame[3]) // paint running out of the mouth
}

/** The lid, lying flat a little way off, with a dab of paint on it. */
function lid(buf: PixelBuf, x: number, y: number): void {
  paintShape(buf, ellipse(x * D, y * D, 8, 2.6), boxOf(x * D - 10, y * D - 4, x * D + 10, y * D + 5), TIN)
  buf.rect(Math.round(x * D - 3), Math.round(y * D - 1), 4, 1, P.sea[3])
}

/** Paint spilled over the deck round Haiku's spot (the 404 only): puddles, drips off the seat, the pot, its lid and a trail of paw prints. */
export function paintSpill(ctx: Ctx, composition: Composition): void {
  const spec = SPILLS[composition]
  const { spill } = porchHaiku[composition]
  const buf = new PixelBuf(spill.w * D, spill.h * D, spill.x * D, spill.y * D)
  for (const p of spec.puddles) blob(buf, p)
  for (const d of spec.drips) paintShape(buf, capsule(d.x * D, d.y0 * D, d.x * D, d.y1 * D, 1.5, 1.1), boxOf(d.x * D - 3, d.y0 * D - 2, d.x * D + 3, d.y1 * D + 3), d.c)
  for (const p of spec.prints) paw(buf, p.x, p.y, p.c)
  lid(buf, spec.lid.x, spec.lid.y)
  tippedPot(buf, spec.pot.x, spec.pot.y)
  buf.flush(ctx)
}
