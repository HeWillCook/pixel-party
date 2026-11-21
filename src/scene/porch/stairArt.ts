import { dRect, shadeRegion } from '../detail'
import { P } from '../palette'
import { bolt } from './deckArt'

type Ctx = CanvasRenderingContext2D
const WOOD = P.wood
const MID = P.woodMid
const STONE = P.stone

/** Vertical pitch of the stair in detail pixels: one tread every 8 scene units. */
export const STAIR_PITCH = 16
/** Tread tops land on rows `y % STAIR_PITCH === STAIR_PHASE`, so the run continues unbroken from the hatch, through the floor cutaway, into the basement. */
export const STAIR_PHASE = 4

/**
 * A steep stair seen straight on as it comes down toward us: two stringers, treads whose lit nosing, face and
 * shadowed underside repeat every `STAIR_PITCH` rows, nailed at the stringers, and a handrail on the right bracketed
 * to the stringer. Coordinates are detail pixels; `ctx` must be scaled by DETAIL.
 */
export function paintStairRun(ctx: Ctx, x: number, w: number, y0: number, y1: number): void {
  const stringer = 6
  const tread = [4, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0, 0, 0]
  shadeRegion(ctx, x + stringer, y0, w - stringer * 2, y1 - y0, (px, py) => {
    const row = ((py - STAIR_PHASE) % STAIR_PITCH + STAIR_PITCH) % STAIR_PITCH
    const step = Math.floor((py - STAIR_PHASE) / STAIR_PITCH)
    const idx = tread[row]
    if (row === 4 && (px * 5 + step * 3) % 23 < 7) return MID[idx]  // a grain streak
    if (row === 5 && (px * 3 + step * 7) % 31 < 6) return WOOD[3]
    return idx >= 3 && row !== 0 && (px + step) % 37 === 0 ? WOOD[1] : WOOD[idx]
  })
  // Stringers: dark arris, lit right edge on the right one, shaded face on the left one.
  for (const side of [0, 1] as const) {
    const sx = side === 0 ? x : x + w - stringer
    dRect(ctx, sx, y0, stringer, y1 - y0, WOOD[0])
    dRect(ctx, sx + 1, y0, stringer - 2, y1 - y0, side === 0 ? WOOD[1] : WOOD[2])
    dRect(ctx, sx + (side === 0 ? stringer - 2 : stringer - 3), y0, 1, y1 - y0, side === 0 ? WOOD[2] : WOOD[4])
  }
  // Nails through each stringer into every tread end.
  for (let y = y0 + ((STAIR_PHASE - y0) % STAIR_PITCH + STAIR_PITCH) % STAIR_PITCH; y < y1; y += STAIR_PITCH) {
    dRect(ctx, x + 2, y + 1, 2, 1, WOOD[0]); dRect(ctx, x + w - 4, y + 1, 2, 1, WOOD[0]); dRect(ctx, x + w - 3, y, 1, 1, WOOD[4])
  }
  // Handrail on the right: a lit rail held off the stringer by stone brackets.
  dRect(ctx, x + w + 2, y0, 2, y1 - y0, WOOD[0]); dRect(ctx, x + w + 2, y0, 1, y1 - y0, WOOD[3]); dRect(ctx, x + w + 3, y0, 1, y1 - y0, WOOD[4])
  for (let y = y0 + ((12 - y0) % 48 + 48) % 48; y < y1 - 4; y += 48) {
    dRect(ctx, x + w, y, 4, 4, STONE[0]); dRect(ctx, x + w, y, 4, 1, STONE[3]); bolt(ctx, x + w + 1, y + 1)
  }
}
