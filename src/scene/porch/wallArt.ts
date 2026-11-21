import { DETAIL, dRect, dth } from '../detail'
import { P } from '../palette'
import type { Composition } from '../camera'
import { drawPorchRoof } from './drawPorch'
import { paintWall } from './houseArt'
import { paintPlanks } from '../woodwork'
import { WALL_TILE } from './wallLayout'

type Ctx = CanvasRenderingContext2D
const WOOD = P.wood

/** The deck line of each composition (the same rows `drawPorch` uses for the floor). */
const FLOOR: Record<Composition, number> = { landscape: 154, portrait: 232 }

/**
 * One tile of the gallery wall's siding, `WALL_TILE` units wide and as tall as the scene: lap siding like the house wall's, the
 * roof beam across the top, a picture rail under it, and the deck boards below. Painted at DETAIL x; `ctx` is scaled by DETAIL. The tile repeats leftwards from the porch's
 * edge, so the siding runs on without a seam.
 */
export function paintWallTile(ctx: Ctx, composition: Composition, roofTop: number): void {
  const height = composition === 'landscape' ? 180 : 320
  const floor = FLOOR[composition]
  const W = WALL_TILE * DETAIL
  // Siding and baseboard; the corner board `paintWall` ends with falls outside the tile.
  paintWall(ctx, { wallWidth: WALL_TILE + 5, floor, roofTop })
  drawPorchRoof(ctx, roofTop, WALL_TILE)
  paintPlanks(ctx, 0, floor * DETAIL, W, (height - floor) * DETAIL)
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, x, y, w, h, c)
  // Picture rail: a moulded strip all along the wall, with a shadow under it.
  const rail = 21 * DETAIL
  R(0, rail, W, 2, WOOD[4]); R(0, rail + 2, W, 3, WOOD[3]); R(0, rail + 5, W, 1, WOOD[1]); R(0, rail + 6, W, 1, WOOD[0])
  for (let x = 0; x < W; x++) if (dth(0.55, x, rail)) R(x, rail + 7, 1, 1, WOOD[1])
}
