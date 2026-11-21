import { dRect, DETAIL, shadeRegion } from '../detail'
import { P } from '../palette'
import { mulberry32 } from '../procedural'
import { paintPlanks } from '../woodwork'

type Ctx = CanvasRenderingContext2D

interface DeckOptions {
  width: number
  height: number
  floor: number
  portrait: boolean
  /** Logical x where the house wall ends; the corner post sits at its right edge. */
  wallWidth: number
  /** Logical x of the freestanding newel posts that carry the rail between the house and the end post. */
  newels: readonly number[]
  /** Hover shadows cast on the boards under floating props: centre x, half-width and centre y, in logical units. */
  shadows: ReadonlyArray<readonly [number, number, number]>
}

const WOOD = P.wood
const MID = P.woodMid

/** Iron bolt head, 2x2 detail pixels: a lit upper-right and a shaded lower-left. */
export function bolt(ctx: Ctx, x: number, y: number): void {
  dRect(ctx, x, y, 2, 2, P.stone[2])
  dRect(ctx, x + 1, y, 1, 1, P.stone[4])
  dRect(ctx, x, y + 1, 1, 1, P.stone[0])
}

/** A square timber post: shaded left, lit right, with short grain runs and a plinth at the foot. */
function paintPost(ctx: Ctx, x: number, top: number, bottom: number, wide: number, seed: number, cap: boolean): void {
  const rng = mulberry32(seed)
  const lit = wide >= 14 ? 3 : 2
  const shade = wide >= 14 ? 3 : 1
  dRect(ctx, x, top, wide, bottom - top, WOOD[2])
  dRect(ctx, x, top, 1, bottom - top, WOOD[0])
  dRect(ctx, x + 1, top, shade, bottom - top, WOOD[1])
  dRect(ctx, x + wide - lit, top, lit - 1, bottom - top, WOOD[4])
  dRect(ctx, x + wide - lit - 1, top, 1, bottom - top, WOOD[3])
  dRect(ctx, x + wide - 1, top, 1, bottom - top, WOOD[3])
  // Short vertical grain runs on the face, staggered so they never form a line.
  const faceStart = x + 1 + shade, faceEnd = x + wide - lit - 1
  for (let y = top + 6; y < bottom - 14; y += 11 + Math.floor(rng() * 14)) {
    const gx = faceStart + Math.floor(rng() * Math.max(1, faceEnd - faceStart))
    dRect(ctx, gx, y, 1, 7 + Math.floor(rng() * 12), rng() < 0.5 ? MID[1] : MID[2])
  }
  // Plinth: a slightly proud block with a lit top lip.
  dRect(ctx, x - 1, bottom - 9, wide + 2, 9, WOOD[1])
  dRect(ctx, x - 1, bottom - 9, wide + 2, 1, WOOD[3])
  dRect(ctx, x, bottom - 8, wide, 5, WOOD[2])
  dRect(ctx, x + wide - 2, bottom - 8, 2, 5, WOOD[3])
  dRect(ctx, x - 1, bottom - 1, wide + 2, 1, WOOD[0])
  if (cap) {
    dRect(ctx, x - 2, top, wide + 4, 6, WOOD[1])
    dRect(ctx, x - 2, top, wide + 4, 1, WOOD[4])
    dRect(ctx, x - 1, top + 1, wide + 2, 3, WOOD[2])
    dRect(ctx, x + wide - 1, top + 1, 2, 3, WOOD[3])
    dRect(ctx, x - 2, top + 5, wide + 4, 1, WOOD[0])
  }
}

/** Railing, posts and deck boards, painted once (transparent where the sea and sand show through). */
export function paintDeckAndRailing(ctx: Ctx, o: DeckOptions): void {
  const W = o.width * DETAIL
  const floorD = o.floor * DETAIL
  const railTop = (o.floor - 29) * DETAIL // 8 detail px tall
  const panelTop = (o.floor - 25) * DETAIL
  const rng = mulberry32(2711)

  // Balusters sit on the original 11-unit grid, skipping the newel posts.
  const balusters: number[] = []
  const rightPost = (o.width - 9) * DETAIL
  for (let bx = 11; bx < o.width - 9; bx += 11) {
    if (o.newels.some(n => Math.abs(bx + 1.5 - n) < 5)) continue
    balusters.push(bx * DETAIL)
  }

  if (!o.portrait) {
    // Sunlit back boards seen through the rail: eave shadow under the cap rail, plank seams, and the
    // sun's low angle throwing each baluster's shadow to the left.
    const seams = [panelTop + 21, panelTop + 35]
    shadeRegion(ctx, 0, panelTop, W, floorD - panelTop, (x, y) => {
      const k = y - panelTop
      if (k < 3) return WOOD[3]
      if (k < 5) return MID[3]
      if (seams.includes(y)) return WOOD[3]
      if (seams.includes(y - 1)) return MID[3]
      for (const bx of balusters) if (x >= bx - 4 && x < bx && k > 5) return MID[3]
      return WOOD[4]
    })
    // Board joints on the back panel, staggered between the two seams.
    for (let x = 90; x < W; x += 146) { dRect(ctx, x, panelTop + 8, 1, 13, MID[3]); dRect(ctx, x + 73, panelTop + 22, 1, 13, MID[3]); dRect(ctx, x + 31, panelTop + 36, 1, 14, MID[3]) }
  }

  // Balusters: a turned profile (square blocks top and bottom, a slim spindle with one bead), dark arris on the
  // left and a lit right edge, tenoned into the rails.
  for (const bx of balusters) {
    const height = floorD - panelTop
    for (let i = 0; i < height; i++) {
      const fromBottom = height - 1 - i
      let inset = 1, bead = false
      if (i < 7 || fromBottom < 8) inset = 0
      else if (i < 10 || fromBottom < 11) inset = 1
      else if (i >= 23 && i < 27) { inset = 0; bead = true }
      const w = 6 - inset * 2
      const x0 = bx + inset
      const edge = i < 2 || fromBottom < 1
      for (let c = 0; c < w; c++) {
        let colour: string = WOOD[1]
        if (c === 0) colour = WOOD[0]
        else if (c === w - 1) colour = WOOD[3]
        else if (c === w - 2) colour = MID[1]
        if (edge) colour = WOOD[0]
        if (bead && c === w - 2) colour = WOOD[3]
        dRect(ctx, x0 + c, panelTop + i, 1, 1, colour)
      }
    }
  }

  // Newel posts: shorter, capped, carrying the rail.
  const newelWide = 10
  for (const n of o.newels) paintPost(ctx, Math.round(n * DETAIL - newelWide / 2), railTop - 8, floorD, newelWide, 900 + Math.round(n), true)

  // Top rail: lit top face, flat front, dark underside; butt splices land on balusters and are nailed.
  const railLeft = 0, railRight = rightPost
  dRect(ctx, railLeft, railTop, railRight - railLeft, 8, WOOD[2])
  dRect(ctx, railLeft, railTop, railRight - railLeft, 2, WOOD[4])
  dRect(ctx, railLeft, railTop + 2, railRight - railLeft, 1, MID[3])
  dRect(ctx, railLeft, railTop + 7, railRight - railLeft, 1, WOOD[0])
  dRect(ctx, railLeft, railTop + 6, railRight - railLeft, 1, WOOD[1])
  for (let x = 40; x < railRight - 30; x += 38 + Math.floor(rng() * 70)) dRect(ctx, x, railTop + 3 + Math.floor(rng() * 3), 10 + Math.floor(rng() * 20), 1, rng() < 0.5 ? MID[1] : MID[2])
  for (let x = 134; x < railRight - 20; x += 262) {
    dRect(ctx, x, railTop + 2, 1, 5, WOOD[1]); dRect(ctx, x + 1, railTop + 2, 1, 5, WOOD[3])
    dRect(ctx, x - 5, railTop + 4, 2, 1, WOOD[0]); dRect(ctx, x + 4, railTop + 4, 2, 1, WOOD[0])
  }
  // Bottom rail (kick rail) and its splices.
  dRect(ctx, railLeft, floorD - 6, railRight - railLeft, 6, WOOD[1])
  dRect(ctx, railLeft, floorD - 6, railRight - railLeft, 1, WOOD[3])
  dRect(ctx, railLeft, floorD - 1, railRight - railLeft, 1, WOOD[0])
  for (let x = 200; x < railRight - 20; x += 262) { dRect(ctx, x, floorD - 5, 1, 4, WOOD[0]); dRect(ctx, x - 5, floorD - 4, 2, 1, WOOD[0]); dRect(ctx, x + 4, floorD - 4, 2, 1, WOOD[0]) }
  // Rail brackets bolted through the newels.
  for (const n of o.newels) {
    const x = Math.round(n * DETAIL - newelWide / 2)
    bolt(ctx, x + 2, railTop + 3); bolt(ctx, x + newelWide - 4, railTop + 3); bolt(ctx, x + 2, floorD - 5)
  }

  // End post at the screen edge (in front of the rail ends), with bolts through the rail.
  paintPost(ctx, rightPost, 16, floorD, 18, 77, false)
  for (const y of [railTop + 2, floorD - 5]) { bolt(ctx, rightPost + 3, y); bolt(ctx, rightPost + 9, y) }
  dRect(ctx, rightPost - 3, railTop, 3, 8, WOOD[1]) // rail end shadowed against the post

  // Deck boards: staggered butt joints land on joists, each board end is nailed, and tones vary per board.
  paintPlanks(ctx, 0, floorD, W, o.height * DETAIL - floorD)
  // Flat shadow ellipse on the boards under each floating thruster.
  for (const [cx, radius, cy] of o.shadows) {
    const rx = radius * DETAIL, ry = 3, centreY = Math.round(cy * DETAIL)
    shadeRegion(ctx, Math.floor(cx * DETAIL - rx), centreY - ry, Math.ceil(rx * 2) + 1, ry * 2 + 1, (x, y) => {
      const e = Math.hypot((x - cx * DETAIL) / rx, (y - centreY) / ry)
      return e <= 1 ? WOOD[1] : null
    })
  }
}
