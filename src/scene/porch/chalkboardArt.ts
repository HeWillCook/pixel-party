import { bayer, DETAIL, dRect, dth, shadeRegion, stampRegion } from '../detail'
import { P } from '../palette'
import { mulberry32 } from '../procedural'
import { bolt } from './deckArt'
import { PORCH_CHALKBOARD_SLATE } from './layout'
import type { Rect } from '../camera'

type Ctx = CanvasRenderingContext2D
const WOOD = P.wood
const MID = P.woodMid


/**
 * Chalkboard, painted for one resting position: hanging ring, mitred timber frame, slate ruled with blank
 * ranking lines, and a chalk ledge with chalk, a felt eraser and a drift of chalk dust.
 * Absolute scene coordinates; the caller stamps the cached region at the bob offset.
 */
function paintChalkboard(ctx: Ctx, board: Rect, ranks: number): void {
  const X = board.x * DETAIL, Y = board.y * DETAIL
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, X + x, Y + y, w, h, c)
  const W = board.w * DETAIL
  const rng = mulberry32(6007)
  const slateX = PORCH_CHALKBOARD_SLATE.x * DETAIL, slateY = PORCH_CHALKBOARD_SLATE.y * DETAIL
  const slateW = (board.w - PORCH_CHALKBOARD_SLATE.w) * DETAIL, slateH = (board.h - PORCH_CHALKBOARD_SLATE.h) * DETAIL

  // Hanging ring peeking over the top rail.
  const cx = Math.floor(W / 2)
  R(cx - 3, 0, 6, 4, STONE[0]); R(cx - 2, 1, 4, 3, STONE[1]); R(cx - 1, 1, 2, 2, WOOD[3]); R(cx + 1, 0, 2, 2, STONE[3])

  // Frame: outline, five-pixel timber band (lit top and right), inner bevel; mitred at the corners.
  const fx = 4, fy = 4, fw = W - 8, fh = (board.h - 15) * DETAIL
  R(fx, fy, fw, fh, WOOD[0])
  R(fx + 2, fy + 2, fw - 4, fh - 4, WOOD[3])
  R(fx + 2, fy + 2, fw - 4, 1, WOOD[4]); R(fx + 2, fy + 3, fw - 4, 1, MID[3])
  R(fx + fw - 5, fy + 2, 1, fh - 4, WOOD[3]); R(fx + fw - 4, fy + 2, 2, fh - 4, WOOD[4])
  R(fx + 2, fy + 2, 1, fh - 4, WOOD[3]); R(fx + 3, fy + 2, 1, fh - 4, MID[2])
  R(fx + 2, fy + fh - 5, fw - 4, 3, WOOD[2])
  R(fx + 6, fy + 6, fw - 12, fh - 12, WOOD[1]) // inner bevel against the slate
  for (let i = 0; i < 5; i++) {
    R(fx + 2 + i, fy + 2 + i, 1, 1, WOOD[1]); R(fx + fw - 3 - i, fy + 2 + i, 1, 1, WOOD[1])
    R(fx + 2 + i, fy + fh - 3 - i, 1, 1, WOOD[1]); R(fx + fw - 3 - i, fy + fh - 3 - i, 1, 1, WOOD[1])
  }
  // Slate.
  R(slateX, slateY, slateW, slateH, P.foliage[0])
  R(slateX, slateY, slateW, 1, P.foliage[1]); R(slateX, slateY, 1, slateH, P.slate[0]); R(slateX + slateW - 1, slateY, 1, slateH, P.slate[0])
  // Blank ranking lines ruled in chalk, one per place (the printed scores sit on them): a scoreboard even when empty.
  // The first line is 10 scene units down the slate and they repeat every 4.6, matching the printed rows.
  for (let k = 0; k < ranks; k++) {
    const ly = slateY + Math.round((10 + k * 4.6) * DETAIL)
    for (let x = 3; x < slateW - 3; x++) if (((x * 7 + k * 13) % 29) > 1) R(slateX + x, ly, 1, 1, P.foliage[1])
    R(slateX + 3, ly - 1, 1, 1, P.foliage[1])
  }

  // Chalk ledge: lit top face, grained front, a dark underside, iron brackets and the brass screws that hold it.
  const ly = (board.h - 15) * DETAIL - 2
  R(6, ly, W - 12, 8, WOOD[2])
  R(6, ly, W - 12, 2, WOOD[4]); R(6, ly + 2, W - 12, 1, WOOD[3]); R(6, ly + 6, W - 12, 1, WOOD[1]); R(6, ly + 7, W - 12, 1, WOOD[0])
  R(6, ly, 1, 8, WOOD[1]); R(W - 7, ly, 1, 8, WOOD[0])
  for (let x = 14; x < W - 30; x += 17 + Math.floor(rng() * 15)) R(x, ly + 3 + Math.floor(rng() * 2), 6 + Math.floor(rng() * 9), 1, MID[1])
  bolt(ctx, X + 10, Y + ly + 4); bolt(ctx, X + W - 14, Y + ly + 4)
  // Two chalk sticks and a felt eraser on the ledge, plus chalk dust drifting off the eraser.
  R(W - 56, ly - 3, 8, 3, P.paper[4]); R(W - 56, ly - 3, 8, 1, P.paper[3]); R(W - 49, ly - 3, 1, 3, P.paper[2])
  R(W - 44, ly - 2, 6, 2, P.flame[3]); R(W - 44, ly - 2, 6, 1, P.flame[4]); R(W - 39, ly - 2, 1, 2, P.flame[2])
  const ex = 22
  R(ex, ly - 5, 14, 5, WOOD[0]); R(ex + 1, ly - 4, 12, 2, STONE[1]); R(ex + 1, ly - 4, 12, 1, STONE[2]); R(ex + 1, ly - 2, 12, 2, P.paper[0]); R(ex + 10, ly - 4, 3, 2, STONE[3])
  shadeRegion(ctx, X + ex + 6, Y + ly - 10, 18, 10, (px, py) => {
    const dx = (px - X - ex - 14) / 9, dy = (py - Y - ly + 1) / 8
    const d = Math.hypot(dx, dy)
    return d < 1 && dth((1 - d) * 0.8, px, py, 2) ? P.paper[2] : null
  })
  R(ex + 18, ly - 1, 10, 1, P.paper[2]); R(ex + 20, ly - 2, 4, 1, P.paper[3]) // dust settled on the ledge
}

const STONE = P.stone

/** Chalkboard with its body cached and stamped at the bob offset. */
export function drawChalkboard(ctx: Ctx, board: Rect, bob: number, ranks: number): void {
  const paint = (target: Ctx) => paintChalkboard(target, board, ranks)
  if (!stampRegion(ctx, `chalkboard|${board.x}|${board.y}|${ranks}`, board.x, board.y, board.w, board.h, paint, { dy: bob })) { ctx.save(); ctx.translate(0, bob); paint(ctx); ctx.restore() }
}
