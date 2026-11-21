import { DETAIL, dRect } from '../detail'
import { P } from '../palette'
import { mulberry32 } from '../procedural'
import { paintBoards } from '../woodwork'
import { bolt } from './deckArt'
import { paintStairRun } from './stairArt'

type Ctx = CanvasRenderingContext2D
const WOOD = P.wood
const MID = P.woodMid
const STONE = P.stone

/**
 * The floor between porch and basement, cut away. At deckArt's scale (a board is 13 detail px wide, so a 24-inch
 * joist spacing is 58): the deck's side-on boards break on every third joist, joists hang end-on with framing
 * anchors and sit on a girder with a spliced, bolted plate; a pipe is strapped under the girder; a wire sags
 * between joists; the sill plate and the basement's tongue-and-groove ceiling (with its light) finish it.
 * The hatch's stair shaft (`shaft`, scene units, matching the opening on the deck) cuts straight through it: doubled
 * trimmer joists frame it, the stair runs down it, and it opens through the ceiling into the basement below.
 * Paints at DETAIL x: `ctx` must already be scaled by DETAIL.
 */
export function paintFloorSection(ctx: Ctx, width: number, height: number, shaft: { x: number; w: number }): void {
  const W = width * DETAIL, H = height * DETAIL
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, x, y, w, h, c)
  const rng = mulberry32(6061)
  const joistStart = 30, joistPitch = 58
  const joists: number[] = []
  for (let x = joistStart; x < W; x += joistPitch) joists.push(x)

  R(0, 0, W, H, P.sky[0]) // the cavity: a step darker than any room wood

  // Wire sagging between staples on adjacent joists.
  joists.forEach((x, i) => {
    const next = joists[i + 1]
    if (next === undefined) return
    for (let px = x + 3; px < next - 2; px++) {
      const t = (px - x - 3) / (next - x - 5)
      R(px, 13 + Math.round(Math.sin(t * Math.PI) * 4), 1, 1, STONE[1])
    }
    R(x + 3, 12, 1, 2, STONE[3])
  })

  // Joists, end-on: dark arris, lit right edge, a ring and a pith, one check, framing anchors where they meet the girder.
  joists.forEach((x, i) => {
    const jx = x - 2
    R(jx, 6, 5, 24, WOOD[0]); R(jx + 1, 7, 3, 23, MID[2]); R(jx + 4, 7, 1, 23, WOOD[3]); R(jx + 1, 7, 1, 23, WOOD[2])
    R(jx + 1, 11 + (i % 3), 3, 1, WOOD[2]); R(jx + 1, 19 - (i % 2), 3, 1, WOOD[2]); R(jx + 2, 15, 1, 2, MID[1])
    if (i % 2 === 0) R(jx + 2, 21, 1, 5, WOOD[1])
    R(jx - 1, 24, 1, 6, STONE[2]); R(jx + 5, 24, 1, 6, STONE[3]); R(jx - 1, 25, 1, 1, STONE[4]); R(jx + 5, 27, 1, 1, STONE[4])
  })

  // Deck boards seen side-on: lit top face, butt joints on every third joist (staggered by row above), a quiet grain.
  R(0, 0, W, 6, WOOD[3]); R(0, 0, W, 1, WOOD[4]); R(0, 5, W, 1, WOOD[1])
  joists.forEach((x, j) => {
    const to = joists[j + 1] ?? W + joistPitch
    if (j % 3 !== 0) {
      const piece = Math.floor(j / 3)
      R(x + 2, 1, Math.min(to, W) - x - 2, 4, piece % 2 ? MID[2] : WOOD[3])
    }
    R(x - 1, 1, Math.min(to, W) - x, 1, WOOD[4])
    if (j % 3 === 0) { R(x, 0, 1, 6, WOOD[0]); R(x + 1, 0, 1, 5, WOOD[4]) }
    R(x + 8 + Math.floor(rng() * 12), 3, 14 + Math.floor(rng() * 18), 1, MID[3])
  })
  R(0, 5, W, 1, WOOD[1]); R(0, 6, W, 1, WOOD[0])

  // Girder: lit top edge, grain and two knots, a spliced joint under a bolted steel plate.
  R(0, 30, W, 16, WOOD[2]); R(0, 30, W, 2, WOOD[4]); R(0, 32, W, 1, WOOD[3]); R(0, 44, W, 1, WOOD[1]); R(0, 45, W, 1, WOOD[0])
  for (let x = 12; x < W - 20; x += 26 + Math.floor(rng() * 32)) R(x, 35 + Math.floor(rng() * 7), 12 + Math.floor(rng() * 22), 1, rng() < 0.5 ? MID[1] : MID[3])
  for (const kx of [Math.round(W * 0.22), Math.round(W * 0.71)]) { R(kx, 37, 5, 4, WOOD[1]); R(kx + 1, 38, 3, 2, MID[1]); R(kx + 2, 38, 1, 1, WOOD[0]) }
  const splice = Math.round(W * 0.42)
  R(splice, 31, 1, 14, WOOD[0])
  R(splice - 12, 33, 25, 10, STONE[0]); R(splice - 11, 34, 23, 8, STONE[2]); R(splice - 11, 34, 23, 1, STONE[4]); R(splice - 11, 41, 23, 1, STONE[1])
  for (const bx of [splice - 9, splice - 4, splice + 3, splice + 8]) { bolt(ctx, bx * 1, 36); bolt(ctx, bx * 1, 39) }

  // Pipe strapped under the girder.
  R(0, 49, W, 4, STONE[1]); R(0, 49, W, 1, STONE[3]); R(0, 50, W, 1, STONE[2]); R(0, 52, W, 1, STONE[0])
  for (const x of [Math.round(W * 0.1), Math.round(W * 0.33), Math.round(W * 0.58), Math.round(W * 0.82)]) {
    R(x, 46, 7, 8, STONE[0]); R(x + 1, 47, 5, 6, STONE[2]); R(x + 1, 47, 5, 1, STONE[4]); R(x + 1, 49, 5, 3, STONE[1]); R(x + 1, 49, 5, 1, STONE[3]); bolt(ctx, x + 2, 47)
  }

  // A mouse on the girder in the gap between two joists.
  const gap = joists[Math.max(0, Math.floor((W * 0.45 - joistStart) / joistPitch))] + 20
  R(gap - 6, 28, 8, 2, P.fur[1]); R(gap - 8, 26, 2, 2, P.fur[1])
  R(gap, 24, 12, 6, P.fur[3]); R(gap, 28, 12, 2, P.fur[2]); R(gap + 2, 22, 4, 2, P.fur[2]); R(gap + 8, 26, 1, 1, WOOD[0]); R(gap + 11, 25, 1, 1, P.ui[3])

  // Sill plate, then the basement's tongue-and-groove ceiling, nailed at the joists.
  R(0, 62, W, 2, WOOD[2]); R(0, 62, W, 1, WOOD[3]); R(0, 64, W, 2, WOOD[1])
  paintBoards(ctx, 0, 66, W, H - 66)
  for (const x of joists) R(x, 74, 1, 1, WOOD[0])
  R(0, H - 1, W, 1, WOOD[0])

  // A ceiling lamp lights the boards from below: a plate, a socket, a bulb, and a glow in three clean rings.
  const bx = Math.round(W * 0.61)
  R(bx - 5, 66, 10, 2, STONE[1]); R(bx - 5, 66, 10, 1, STONE[3]); R(bx - 2, 68, 4, 2, STONE[2])
  ctx.save()
  for (const [radius, alpha] of [[20, 0.1], [14, 0.1], [9, 0.1]] as const) {
    ctx.globalAlpha = alpha
    for (let dy = -Math.round(radius * 0.45); dy <= Math.round(radius * 0.45); dy++) {
      const half = Math.round(radius * Math.sqrt(1 - (dy / (radius * 0.45)) ** 2))
      R(bx - half, 74 + dy, half * 2, 1, P.sun[3])
    }
  }
  ctx.restore()
  ;[[2, 70], [4, 71], [4, 72], [4, 73], [3, 74], [2, 75]].forEach(([hw, y]) => R(bx - hw, y, hw * 2, 1, P.sun[3]))
  R(bx - 1, 71, 2, 3, P.sun[4])
  // The stair shaft: doubled trimmer joists either side, a dark void, the stair itself, and trim round the ceiling opening.
  const sx = shaft.x * DETAIL, sw = shaft.w * DETAIL
  for (const side of [-1, 1] as const) {
    const tx = side < 0 ? sx - 8 : sx + sw
    R(tx, 6, 8, 56, WOOD[0]); R(tx + 1, 6, 6, 56, MID[2]); R(tx + 1, 6, 2, 56, WOOD[2]); R(tx + 5, 6, 2, 56, WOOD[3])
    R(tx + 3, 18, 2, 5, WOOD[1]); R(tx + 3, 40, 2, 4, WOOD[1])
    R(tx + (side < 0 ? 6 : -1), 30, 3, 1, STONE[3]); R(tx + (side < 0 ? 6 : -1), 31, 3, 1, STONE[0]) // joist hanger plates
  }
  R(sx, 0, sw, H, P.sky[0])
  paintStairRun(ctx, sx, sw, 0, H)
  for (const tx of [sx - 3, sx + sw]) { R(tx, 62, 3, 3, WOOD[2]); R(tx, 62, 3, 1, WOOD[3]); R(tx, 65, 3, H - 65, WOOD[1]); R(tx, 65, 1, H - 65, WOOD[0]) }
}
