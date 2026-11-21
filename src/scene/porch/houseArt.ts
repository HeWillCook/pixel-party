import { bayer, dRect, DETAIL, dth, shadeRegion } from '../detail'
import { P } from '../palette'
import { mulberry32 } from '../procedural'
import { bolt } from './deckArt'
import { buildCloud, coverage, skyBand } from './skyArt'

type Ctx = CanvasRenderingContext2D
const WOOD = P.wood
const STONE = P.stone
const PAPER = P.paper
const MID = P.woodMid

interface WallOptions { wallWidth: number; floor: number; roofTop: number }

/**
 * House wall: clean lap siding. Each board has a highlight line along its top edge and a shadow line along its
 * bottom edge; staggered butt joints, a few knots and nails; dithering only for the soft shadow under the eaves.
 */
export function paintWall(ctx: Ctx, o: WallOptions): void {
  const sidingW = (o.wallWidth - 5) * DETAIL
  const floorD = o.floor * DETAIL
  const top = 8 * DETAIL
  const eave = (o.roofTop + 13) * DETAIL
  const rng = mulberry32(5150)
  const courseTop = 24, pitch = 14
  const courses = Math.ceil((floorD - courseTop) / pitch) + 1
  const joints: number[] = []
  for (let k = 0; k < courses; k++) joints.push(Math.floor(10 + rng() * (sidingW - 20)))
  // [course, x] — a handful of knots and nails, placed by hand so they read as intentional.
  const knots: Array<[number, number]> = [[1, 38], [4, 12], [6, 70], [9, 26], [12, 82], [15, 48]]
  const nails: Array<[number, number]> = [[2, 16], [3, 88], [7, 52], [10, 14], [13, 76]]
  shadeRegion(ctx, 0, top, o.wallWidth * DETAIL, floorD - top, (x, y) => {
    // Corner board.
    if (x >= sidingW) {
      const c = x - sidingW
      if (y >= floorD - 8) return y === floorD - 8 ? WOOD[3] : y >= floorD - 2 ? WOOD[0] : WOOD[1]
      if (c === 0) return WOOD[0]
      if (c === 1) return WOOD[1]
      if (c < 7) return c < 5 ? WOOD[2] : WOOD[3]
      if (c < 9) return WOOD[4]
      return WOOD[3]
    }
    // Baseboard where the wall meets the deck.
    if (y >= floorD - 8) return y === floorD - 8 ? WOOD[3] : y >= floorD - 2 ? WOOD[0] : WOOD[1]
    const k = Math.floor((y - courseTop) / pitch)
    const ry = ((y - courseTop) % pitch + pitch) % pitch
    let colour: string
    if (ry === 0) colour = WOOD[3]
    else if (ry === pitch - 1) colour = WOOD[0]
    else if (ry === pitch - 2) colour = WOOD[1]
    else {
      colour = WOOD[2]
      const j = joints[Math.max(0, k)] ?? 0
      if (x === j) colour = WOOD[1]
      else if (x === j + 1) colour = MID[2]
      for (const [kk, kx] of knots) {
        if (kk !== k || ry < 4 || ry > 6) continue
        const dx = x - kx
        if (ry === 4 && (dx === 1 || dx === 2)) colour = WOOD[1]
        else if (ry === 5 && dx >= 0 && dx <= 3) colour = dx === 1 || dx === 2 ? MID[1] : WOOD[1]
        else if (ry === 6 && (dx === 1 || dx === 2)) colour = WOOD[1]
      }
      for (const [kk, nx] of nails) if (kk === k && ry === 3 && (x === nx || x === nx + 1)) colour = WOOD[0]
    }
    // Eave shadow from the roof beam only.
    if (ry > 0 && y >= eave && dth((1 - (y - eave) / 18) * 0.9, x, y)) return WOOD[1]
    return colour
  })
}

interface WindowRect { x: number; y: number; w: number; h: number }

/**
 * Casement window: projecting sill, mitred casing, sash with a cross mullion, and a view through the house: a dim
 * room with a curtain edge and a chair back, and a rear window showing the dusk sky.
 */
export function paintWindow(ctx: Ctx, win: WindowRect): void {
  const x = win.x * DETAIL, y = win.y * DETAIL, w = win.w * DETAIL, h = win.h * DETAIL
  const R = (rx: number, ry: number, rw: number, rh: number, c: string) => dRect(ctx, x + rx, y + ry, rw, rh, c)
  // Sill: lit top, deeper front, a shadow on the wall below it.
  dRect(ctx, x - 4, y + h, w + 8, 2, WOOD[4])
  dRect(ctx, x - 4, y + h + 2, w + 8, 3, WOOD[3])
  dRect(ctx, x - 4, y + h + 5, w + 8, 1, WOOD[0])
  dRect(ctx, x - 4, y + h + 2, 1, 3, WOOD[2])
  shadeRegion(ctx, x - 3, y + h + 6, w + 6, 4, (px, py) => dth((1 - (py - (y + h + 6)) / 4) * 0.8, px, py) ? WOOD[1] : null)
  // Casing: four boards meeting at 45-degree mitres, lit on the right, shaded on the left.
  const T = 5
  dRect(ctx, x, y, w, h, WOOD[0])
  dRect(ctx, x + 1, y + 1, w - 2, h - 2, WOOD[3])
  dRect(ctx, x + w - 2, y + 1, 1, h - 2, WOOD[4]) // lit right edge
  dRect(ctx, x + 1, y + 1, w - 2, 1, WOOD[4])      // lit top edge
  dRect(ctx, x + 1, y + 2, 1, h - 3, WOOD[2])      // shaded left edge
  dRect(ctx, x + 1, y + h - 2, w - 2, 1, WOOD[2])  // shaded underside
  for (let i = 0; i < T; i++) {
    // mitre joints from each outer corner to the inner corner
    dRect(ctx, x + 1 + i, y + 1 + i, 1, 1, WOOD[1])
    dRect(ctx, x + w - 2 - i, y + 1 + i, 1, 1, WOOD[1])
    dRect(ctx, x + 1 + i, y + h - 2 - i, 1, 1, WOOD[1])
    dRect(ctx, x + w - 2 - i, y + h - 2 - i, 1, 1, WOOD[1])
  }
  // Sash: a recessed dark rebate, then the glass.
  const gx = x + T + 1, gy = y + T + 1, gw = w - (T + 1) * 2, gh = h - (T + 1) * 2
  dRect(ctx, x + T, y + T, w - T * 2, h - T * 2, WOOD[0])
  const mullion = 2
  const midX = Math.floor(gw / 2) - 1
  const midY = Math.floor(gh * 0.55)
  // A view through the house: a dim room lit only by a rear window, which shows the same dusk sky that hangs above
  // the horizon out front (same bands, same height), with a cloud; the curtain's edge and a chair back frame it.
  const rear = { x: gx + 8, y: gy + 7, w: gw - 16, h: 22 }
  const cloud = buildCloud(Math.round((rear.x + 6) / DETAIL), Math.round((rear.y + 12) / DETAIL), 13)
  shadeRegion(ctx, gx, gy, gw, gh, (px, py) => {
    const inRear = px >= rear.x && px < rear.x + rear.w && py >= rear.y && py < rear.y + rear.h
    if (inRear) {
      if (px === rear.x || px === rear.x + rear.w - 1 || py === rear.y || py === rear.y + rear.h - 1) return WOOD[0]
      if (py >= rear.y + rear.h - 3) return py === rear.y + rear.h - 3 ? WOOD[4] : WOOD[3] // sill, lit by the sky
      const cover = coverage(cloud, px, py)
      if (cover > 0 && dth(cover * 3.2, px, py)) return py < rear.y + 11 ? P.sky[4] : P.sky[3]
      return skyBand(px, py, 100)
    }
    const edge = Math.min(px - gx, gx + gw - 1 - px, py - gy, gy + gh - 1 - py)
    const nearRear = Math.max(Math.abs(px - (rear.x + rear.w / 2)) - rear.w / 2, Math.abs(py - (rear.y + rear.h / 2)) - rear.h / 2)
    if (nearRear < 4 && dth(0.5, px, py, 2)) return P.fur[2] // sky light spilling on the wall around the window
    return edge < 3 ? WOOD[0] : edge < 6 && dth(0.5, px, py, 2) ? WOOD[0] : P.fur[0]
  })
  // The curtain's edge on the left, folded and tied back, and a chair back in front of the lower wall.
  for (let y = 0; y < gh - 6; y++) { dRect(ctx, gx, gy + y, 7, 1, WOOD[0]); dRect(ctx, gx + 1 + (Math.floor(y / 8) % 2) * 2, gy + y, 1, 1, P.fur[0]); dRect(ctx, gx + 6, gy + y, 1, 1, P.fur[1]) }
  dRect(ctx, gx, gy + 24, 8, 2, P.fur[1]); dRect(ctx, gx, gy + 26, 8, 1, WOOD[0])
  const chairX = gx + 14
  dRect(ctx, chairX, gy + 33, 22, 2, WOOD[0]); dRect(ctx, chairX, gy + 31, 3, 21, WOOD[0]); dRect(ctx, chairX, gy + 31, 3, 1, P.fur[1])
  for (let sx = chairX + 5; sx < chairX + 20; sx += 5) dRect(ctx, sx, gy + 35, 2, 17, WOOD[0])
  // Mullions and the transom bar, with a lit edge on the right of each.
  dRect(ctx, gx + midX, gy, mullion, gh, WOOD[3]); dRect(ctx, gx + midX, gy, 1, gh, WOOD[2]); dRect(ctx, gx + midX + 1, gy, 1, gh, WOOD[4])
  dRect(ctx, gx, gy + midY, gw, mullion, WOOD[3]); dRect(ctx, gx, gy + midY, gw, 1, WOOD[4]); dRect(ctx, gx, gy + midY + 1, gw, 1, WOOD[2])
  // The sash's shadow on the glass's upper-left, and one reflection of the real sky.
  dRect(ctx, gx, gy, gw, 1, WOOD[1]); dRect(ctx, gx, gy, 1, gh, WOOD[1])
  for (let i = 0; i < 4; i++) dRect(ctx, gx + midX + 5 + i, gy + 12 - i, 1, 1, P.sky[4])
  // Latch.
  dRect(ctx, gx + midX + 3, gy + midY - 2, 2, 5, WOOD[0]); dRect(ctx, gx + midX + 3, gy + midY - 2, 1, 2, P.sun[3]); dRect(ctx, gx + midX + 3, gy + midY, 1, 2, P.sun[2])
}

export interface MailboxOptions { x: number; y: number; signedIn: boolean; /** Drop shadow on the siding behind it (off where it is drawn on a flat background). */ shadow?: boolean }

/**
 * Wall letterbox, painted red so it stands out from the siding: a rounded (barrel) top, a hinged front flap with a
 * brass-lipped letter slot, a name plate, bolts into the wall, and a side flag that stands up when signed out and
 * lies down when signed in. Authored on the 56x48 detail grid of the 28x24 unit hotspot.
 */
export function paintMailbox(ctx: Ctx, o: MailboxOptions): void {
  const ox = o.x * DETAIL, oy = o.y * DETAIL
  const R = (x: number, y: number, w: number, h: number, c: string) => dRect(ctx, ox + x, oy + y, w, h, c)
  const RED = P.flame
  if (o.shadow !== false) {
    // Drop shadow on the siding, thrown left and down by the low sun.
    shadeRegion(ctx, ox, oy + 8, 50, 40, (px, py) => {
      const rx = px - ox, ry = py - oy
      return rx >= 4 && rx < 40 && ry >= 12 && ry < 45 ? WOOD[1] : null
    })
  }
  // Barrel top: a half-ellipse sitting on the body, lit toward the right with a thin specular arc.
  const left = 7, right = 43, topY = 5, bodyTop = 17, bottom = 40
  for (let y = topY; y < bodyTop; y++) {
    const k = (bodyTop - y) / (bodyTop - topY) // 1 at the crown, 0 where it meets the body
    const half = Math.round(18 * Math.sqrt(Math.max(0, 1 - k * k)))
    const x0 = 25 - half, x1 = 25 + half
    R(x0 - 1, y, x1 - x0 + 2, 1, WOOD[0])
    R(x0, y, x1 - x0, 1, RED[1])
    R(x0, y, 3, 1, RED[0])
    R(x1 - 3, y, 3, 1, RED[2])
  }
  R(17, topY + 1, 12, 1, RED[3]); R(13, topY + 3, 4, 1, RED[3]) // specular arc
  // Body: outline, shaded left, lit right edge.
  R(left - 1, bodyTop, right - left + 3, bottom - bodyTop + 1, WOOD[0])
  R(left, bodyTop, right - left + 1, bottom - bodyTop, RED[1])
  R(left, bodyTop, 3, bottom - bodyTop, RED[0]); R(right - 2, bodyTop, 3, bottom - bodyTop, RED[2]); R(right, bodyTop, 1, bottom - bodyTop, RED[3])
  R(left, bottom - 2, right - left + 1, 2, RED[0])
  // Front flap: hinged at the top (iron knuckles), letter slot with a brass lip, lit lower edge.
  R(10, 21, 30, 17, WOOD[0]); R(11, 22, 28, 15, RED[1]); R(11, 22, 28, 1, RED[2]); R(38, 22, 1, 15, RED[2]); R(11, 36, 28, 1, RED[0])
  for (const hx of [13, 33]) { R(hx, 19, 5, 3, STONE[0]); R(hx + 1, 19, 3, 2, STONE[3]); R(hx + 1, 19, 3, 1, STONE[4]) }
  R(15, 25, 20, 4, P.sun[1]); R(16, 26, 18, 2, WOOD[0]); R(15, 25, 20, 1, P.sun[4]); R(15, 28, 20, 1, P.sun[2])
  // Name plate with a line of ink and two screws.
  R(17, 31, 16, 5, WOOD[0]); R(18, 32, 14, 3, PAPER[3]); R(18, 32, 14, 1, PAPER[4]); R(20, 33, 9, 1, PAPER[0]); R(17, 31, 1, 1, STONE[4]); R(32, 31, 1, 1, STONE[4])
  // Bolts through the lower corners into the studs.
  bolt(ctx, ox + 9, oy + 38); bolt(ctx, ox + 39, oy + 38)
  // Flag pivoting on the right side: standing (signed out) or lying down (signed in).
  R(43, 26, 4, 4, STONE[0]); R(44, 27, 2, 2, STONE[3]); bolt(ctx, ox + 43, oy + 27)
  if (!o.signedIn) {
    R(45, 8, 3, 20, WOOD[0]); R(46, 8, 1, 20, WOOD[3]); R(47, 8, 1, 20, WOOD[4])
    R(47, 5, 9, 8, WOOD[0]); R(48, 6, 7, 6, RED[2]); R(48, 6, 7, 1, RED[4]); R(48, 7, 1, 4, RED[3]); R(54, 7, 1, 4, RED[1]); R(48, 11, 5, 1, RED[1])
  } else {
    R(44, 29, 3, 12, WOOD[0]); R(45, 29, 1, 12, WOOD[3]); R(46, 29, 1, 12, WOOD[4])
    R(47, 35, 5, 6, WOOD[0]); R(48, 36, 3, 4, RED[1]); R(48, 36, 1, 2, RED[2])
  }
}
