import { dRect, shadeRegion } from './detail'
import { P } from './palette'

type Ctx = CanvasRenderingContext2D
const WOOD = P.wood
const MID = P.woodMid

const hash = (a: number, b: number) => (Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663)) >>> 0

export interface PlankOptions {
  /** Row pitch in detail pixels (the visible width of one board). */
  plank?: number
  /** Joist centres: boards break on every third joist, staggered row to row, and are nailed into each. */
  joistStart?: number
  joistPitch?: number
}

/** Decking / flooring seen from above: butt joints land on joists, tones vary per board, nails at every joist crossing. */
export function paintPlanks(ctx: Ctx, x0: number, y0: number, w: number, h: number, o: PlankOptions = {}): void {
  const plank = o.plank ?? 13, joistStart = o.joistStart ?? 30, joistPitch = o.joistPitch ?? 58
  shadeRegion(ctx, x0, y0, w, h, (x, y) => {
    const row = Math.floor((y - y0) / plank), ry = (y - y0) % plank
    if (ry === 0) return WOOD[0]
    if (ry === 1) return WOOD[3]
    if (ry === plank - 1) return WOOD[1]
    const joist = Math.round((x - joistStart) / joistPitch)
    const off = x - (joistStart + joist * joistPitch)
    if (((joist + row) % 3 + 3) % 3 === 0) {
      if (off === 0) return WOOD[0]
      if (off === 1) return WOOD[3]
    }
    const piece = Math.floor((joist + row + (off < 0 ? -1 : 0) + 3) / 3)
    const tone = (piece * 7 + row * 5) % 4
    const streak = 3 + ((piece * 3 + row) % 6)
    if (ry === streak && (x + piece * 11) % 46 < 18 + (piece % 3) * 5) return tone === 1 ? MID[3] : MID[1]
    return tone === 0 ? MID[2] : WOOD[2]
  })
  const rows = Math.ceil(h / plank)
  for (let row = 0; row < rows; row++) {
    const y = y0 + row * plank + 4
    for (let j = 0; joistStart + j * joistPitch < x0 + w; j++) {
      const x = joistStart + j * joistPitch
      if (((j + row) % 3 + 3) % 3 === 0) {
        for (const nx of [x - 5, x + 4]) { dRect(ctx, nx, y, 2, 1, WOOD[0]); dRect(ctx, nx + 1, y - 1, 1, 1, WOOD[4]) }
      } else { dRect(ctx, x, y + 1, 2, 1, WOOD[0]); dRect(ctx, x + 1, y, 1, 1, WOOD[4]) }
    }
  }
}

/** One pixel of vertical tongue-and-groove: a dark groove, a lit edge, a quiet grain streak, the odd lighter board. */
export function boardTone(x: number, y: number, pitch = 12, phase = 4): string {
  const rx = (x + phase) % pitch
  const board = Math.floor((x + phase) / pitch)
  if (rx === 0) return WOOD[0]
  if (rx === 1) return WOOD[1]
  if (rx === pitch - 1) return WOOD[3]
  const tone = hash(board, 3) % 7 === 0 ? MID[2] : WOOD[2]
  if (rx === 5 && (y + board * 13) % 31 < 12) return tone === WOOD[2] ? MID[1] : WOOD[1]
  return tone
}

/** A panel of tongue-and-groove boards. */
export function paintBoards(ctx: Ctx, x: number, y: number, w: number, h: number, pitch = 12, phase = 4): void {
  shadeRegion(ctx, x, y, w, h, (px, py) => boardTone(px, py, pitch, phase))
}
