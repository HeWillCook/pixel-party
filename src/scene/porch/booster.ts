import { P } from '../palette'
import { DetailGrid, DETAIL, dRect, drawDetailSprite } from '../detail'
import { defineSprite, type Sprite } from '../sprite'

// ---------------------------------------------------------------------------------------------
// The thruster: authored on the 2x detail grid, 9 logical units wide and 11 tall including the flame. Used by
// the porch scene and the HTML easel base (`EaselBase`).
// ---------------------------------------------------------------------------------------------

const THRUSTER_W = 18
const THRUSTER_H = 14
const SMALL_W = 14
const SMALL_H = 11
/** Size (detail pixels) of the thruster-plus-flame footprint (guarded by `art.test.ts`). */
export const BOOSTER_2X = { width: 18, height: 22 }

const thrusterColours = {
  a: P.stone[0], b: P.stone[1], c: P.stone[2], d: P.stone[3], e: P.stone[4],
  g: P.flame[1], h: P.flame[2], i: P.flame[3],
}

function buildThrusterBody(): Sprite {
  const g = new DetailGrid(THRUSTER_W, THRUSTER_H)
  // One shaded row of a cylinder spanning [l, r]: outline, left shade, face, highlight stripe, warm rim on the right.
  const row = (y: number, l: number, r: number, warm = false) => {
    g.px(l, y, 'a'); g.px(r, y, 'a')
    const n = r - l - 1
    for (let i = 0; i < n; i++) {
      let key = 'c'
      if (i < 2) key = 'b'
      else if (i >= n - 1) key = warm ? 'i' : 'e'
      else if (i >= n - 2) key = warm ? 'e' : 'c'
      else if (i >= n - 4) key = 'd'
      g.px(l + 1 + i, y, key)
    }
  }
  // Collar sleeve (the easel leg / board post plugs into it), with a dark rim.
  g.rect(5, 0, 8, 1, 'a'); row(1, 5, 12)
  // Mounting plate with ears, bolted to whatever the thruster lifts: lit lip, a bolt in each ear, shadow beneath.
  g.rect(0, 2, 18, 2, 'a'); g.rect(1, 2, 16, 1, 'd'); g.rect(15, 2, 2, 1, 'e'); g.px(2, 2, 'e'); g.px(14, 2, 'e')
  // Stout cylinder body with three rivets, and a clamp strap wrapped round it: bolted tab on the right, lit lip below.
  for (let y = 4; y < 10; y++) row(y, 2, 15)
  for (const x of [5, 8, 11]) g.px(x, 5, 'e')
  g.rect(2, 6, 14, 1, 'a'); g.rect(3, 7, 12, 1, 'b'); g.rect(10, 7, 3, 1, 'd'); g.px(12, 7, 'e'); g.rect(3, 8, 12, 1, 'd'); g.px(14, 8, 'e')
  // Flared nozzle bell lit warm along its right edge, with a dark lip and the glowing opening.
  row(10, 1, 16, true); row(11, 0, 17, true); row(12, 0, 17, true)
  g.rect(0, 13, 18, 1, 'a'); g.rect(3, 13, 12, 1, 'g'); g.rect(5, 13, 8, 1, 'h'); g.rect(7, 13, 4, 1, 'i')
  return defineSprite(g.lines(), thrusterColours)
}

/** The same thruster at roughly three quarters size, for a foot that is further back in the scene (an easel's rear leg). */
function buildSmallThrusterBody(): Sprite {
  const g = new DetailGrid(SMALL_W, SMALL_H)
  const row = (y: number, l: number, r: number, warm = false) => {
    g.px(l, y, 'a'); g.px(r, y, 'a')
    const n = r - l - 1
    for (let i = 0; i < n; i++) g.px(l + 1 + i, y, i < 2 ? 'b' : i >= n - 1 ? (warm ? 'i' : 'e') : i >= n - 3 ? 'd' : 'c')
  }
  g.rect(4, 0, 6, 1, 'a'); row(1, 4, 9)
  g.rect(0, 2, 14, 2, 'a'); g.rect(1, 2, 12, 1, 'd'); g.px(12, 2, 'e'); g.px(2, 2, 'e'); g.px(11, 2, 'e')
  for (let y = 4; y < 8; y++) row(y, 1, 12)
  g.px(4, 4, 'e'); g.px(6, 4, 'e'); g.px(8, 4, 'e')
  g.rect(1, 5, 12, 1, 'a'); g.rect(2, 6, 10, 1, 'b'); g.px(9, 6, 'e'); g.rect(2, 7, 10, 1, 'd')
  row(8, 0, 13, true); row(9, 0, 13, true)
  g.rect(0, 10, 14, 1, 'a'); g.rect(2, 10, 10, 1, 'g'); g.rect(4, 10, 6, 1, 'h'); g.rect(6, 10, 2, 1, 'i')
  return defineSprite(g.lines(), thrusterColours)
}

let thrusterBody: Sprite | null = null
let smallBody: Sprite | null = null

// Exhaust layers, outermost first: [colour, length scale, half-width at the mouth].
const PLUME: ReadonlyArray<readonly [string, number, number]> = [[P.flame[1], 1, 6], [P.flame[2], 0.84, 4.6], [P.flame[3], 0.62, 3.2], [P.flame[4], 0.4, 1.8]]
const PLUME_SMALL: ReadonlyArray<readonly [string, number, number]> = [[P.flame[1], 1, 4.4], [P.flame[2], 0.84, 3.4], [P.flame[3], 0.62, 2.4], [P.flame[4], 0.4, 1.4]]
const PLUME_LENGTH = [5, 7, 6]
const PLUME_LENGTH_SMALL = [4, 5, 4]

/**
 * Short cylindrical thruster bolted under a floating base, with a tight flame: white-hot core and three
 * colour layers that flicker over a three-frame loop at 12 fps. `x`/`y` are the logical top-left of the
 * housing. `small` is the three-quarter-size one used where a foot is further back.
 */
export function drawThruster(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, small = false, boost = 0): void {
  const body = small ? (smallBody ??= buildSmallThrusterBody()) : (thrusterBody ??= buildThrusterBody())
  const f = ((Math.floor(frame) % 3) + 3) % 3
  const dx = Math.round(x * DETAIL), dy = Math.round(y * DETAIL)
  const cx = dx + body.w / 2, mouthY = dy + body.h
  // `boost` (0..1) is the arrival flare: a longer, fatter plume that also runs hotter in the centre.
  const length = Math.round((small ? PLUME_LENGTH_SMALL : PLUME_LENGTH)[f] * (1 + boost * 0.9))
  for (const [colour, scale, mouth] of small ? PLUME_SMALL : PLUME) {
    const len = Math.max(2, Math.round(length * scale))
    for (let r = 0; r < len; r++) {
      const t = r / len
      const half = Math.max(1, Math.round(mouth * (1 - t) ** 0.8 + (f === 1 && r < 2 ? 0.6 : 0) + boost * 1.4))
      dRect(ctx, cx - half, mouthY + r, half * 2, 1, colour)
    }
  }
  dRect(ctx, cx - 1, mouthY + length, 2, 1, P.flame[1])
  if (boost > 0.3) dRect(ctx, cx - 1, mouthY, 2, Math.round(length * 0.5), P.paper[4])
  drawDetailSprite(ctx, body, dx / DETAIL, dy / DETAIL)
}
