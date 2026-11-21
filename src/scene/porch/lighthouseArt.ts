import { dRect, dth, stampRegion } from '../detail'
import { P } from '../palette'

type Ctx = CanvasRenderingContext2D
const WOOD = P.wood
const STONE = P.stone

const LIGHTHOUSE_REGION = { dx: -2, dy: -26, w: 18, h: 27 }
/** Frames in one full rotation of the beam (8 seconds at 12 fps). */
export const BEAM_PERIOD = 96

/**
 * Lighthouse tower painted on a 36x54 detail grid whose origin is (x - 2, horizon - 26): roof cone and finial,
 * glazed lantern room, a gallery with railing, three tapering stripe bands with slit windows and a door.
 */
function paintTower(ctx: Ctx, x: number, horizon: number): void {
  const X = (x + LIGHTHOUSE_REGION.dx) * 2, Y = (horizon + LIGHTHOUSE_REGION.dy) * 2
  const R = (rx: number, ry: number, w: number, h: number, c: string) => dRect(ctx, X + rx, Y + ry, w, h, c)
  const cx = 18

  // Tower shaft: stripes of dusty cream and the sunset pink, tapering, lit on the right, shaded on the left.
  const top = 26, bottom = 52
  for (let row = top; row < bottom; row++) {
    const half = 6 + Math.round((row - top) * 3 / (bottom - top - 1))
    const left = cx - half, right = cx + half
    const band = Math.floor((row - top) / 7)
    const cream = band % 2 === 0
    const shade = cream ? [P.paper[0], P.paper[1], P.paper[2], P.paper[3], P.paper[4]] : [P.sky[1], P.sky[2], P.sky[3], P.flame[1], P.flame[2]]
    R(left, row, 1, 1, shade[0])
    R(left + 1, row, Math.round(half * 0.55), 1, shade[1])
    R(left + 1 + Math.round(half * 0.55), row, right - left - 2 - Math.round(half * 0.55) - 3, 1, shade[2])
    R(right - 4, row, 2, 1, shade[3]); R(right - 2, row, 1, 1, shade[4]); R(right - 1, row, 1, 1, shade[0])
    if ((row - top) % 7 === 0 && row > top) R(left, row, right - left, 1, cream ? P.sky[1] : P.paper[1]) // band joint
  }
  // Slit windows (dark with a warm sill of light) and the arched door.
  for (const wy of [31, 40]) { R(cx - 1, wy, 3, 5, WOOD[0]); R(cx, wy + 1, 1, 3, wy === 31 ? P.sun[3] : P.sky[1]); R(cx - 1, wy + 5, 3, 1, P.paper[4]) }
  R(cx - 3, 45, 7, 7, WOOD[0]); R(cx - 2, 46, 5, 6, P.sky[0]); R(cx - 1, 45, 3, 1, P.sky[0]); R(cx + 2, 47, 1, 5, P.sky[1]); R(cx + 3, 45, 1, 7, WOOD[3])
  // Stone plinth.
  R(cx - 10, 50, 20, 2, STONE[1]); R(cx - 10, 50, 20, 1, STONE[3]); R(cx + 8, 50, 2, 2, STONE[4]); R(cx - 10, 51, 20, 1, STONE[0])

  // Gallery deck with corbels, and a railing of iron posts and a top rail.
  R(cx - 11, 23, 22, 3, STONE[1]); R(cx - 11, 23, 22, 1, STONE[4]); R(cx - 11, 25, 22, 1, STONE[0]); R(cx + 7, 24, 4, 1, STONE[3])
  for (const bx of [cx - 7, cx + 6]) R(bx, 26, 2, 2, STONE[0])
  R(cx - 11, 18, 22, 1, STONE[3]); R(cx - 11, 19, 22, 1, STONE[0]); R(cx + 8, 18, 3, 1, STONE[4])
  for (let bx = cx - 11; bx <= cx + 9; bx += 4) { R(bx, 19, 1, 4, STONE[0]); R(bx + 1, 19, 1, 4, bx > cx ? STONE[3] : STONE[1]) }

  // Lantern room: four glass panes between iron mullions, base and cap plates; warm glass (a live glow is added per frame).
  R(cx - 7, 11, 14, 12, WOOD[0])
  R(cx - 6, 12, 12, 10, P.sun[3])
  R(cx - 6, 12, 12, 1, P.sun[2]); R(cx - 6, 21, 12, 1, P.sun[2]); R(cx - 6, 12, 1, 10, P.sun[2]); R(cx + 5, 12, 1, 10, P.sun[4])
  R(cx - 1, 12, 2, 10, WOOD[0]); R(cx - 6, 16, 12, 1, WOOD[0]); R(cx + 1, 12, 1, 10, STONE[3])
  R(cx - 8, 22, 16, 1, STONE[1]); R(cx - 8, 10, 16, 1, STONE[1]); R(cx + 4, 10, 4, 1, STONE[4])

  // Roof cone in sunset pinks, lit warm on the right, with a ball finial.
  for (let r = 0; r < 7; r++) {
    const hw = 2 + r
    R(cx - hw, 3 + r, hw * 2, 1, P.sky[3])
    R(cx - hw, 3 + r, 1, 1, WOOD[0]); R(cx + hw - 1, 3 + r, 1, 1, WOOD[0])
    R(cx - hw + 1, 3 + r, Math.max(1, Math.floor(hw / 2)), 1, P.sky[2])
    R(cx + hw - 3, 3 + r, 2, 1, P.flame[1])
  }
  R(cx - 9, 9, 18, 1, WOOD[0]); R(cx - 8, 9, 14, 1, P.flame[1]); R(cx + 5, 9, 3, 1, P.flame[2])
  R(cx - 1, 0, 2, 3, WOOD[0]); R(cx, 0, 1, 2, P.sun[4])
}

/** Cached lighthouse tower for one composition. Absolute scene coordinates. */
export function drawTower(ctx: Ctx, x: number, horizon: number): void {
  const r = LIGHTHOUSE_REGION
  const paint = (target: Ctx) => paintTower(target, x, horizon)
  if (!stampRegion(ctx, `lighthouse|${x}|${horizon}`, x + r.dx, horizon + r.dy, r.w, r.h, paint)) paint(ctx)
}

/** Detail-pixel position of the lantern's centre (for the beam origin and glow). */
function lanternCentre(x: number, horizon: number): { x: number; y: number } {
  return { x: (x + LIGHTHOUSE_REGION.dx) * 2 + 18, y: (horizon + LIGHTHOUSE_REGION.dy) * 2 + 17 }
}

/**
 * The rotating beam seen side-on: a wedge that swings to the right then to the left over a full rotation,
 * brightest as it points across the sea; quantised dither keeps it soft but clean. Also pulses the lantern
 * glass and adds a halo around it.
 */
export function drawBeam(ctx: Ctx, x: number, horizon: number, frame: number): void {
  const origin = lanternCentre(x, horizon)
  const phase = (frame % BEAM_PERIOD) / BEAM_PERIOD * Math.PI * 2
  const swing = Math.cos(phase)
  for (const side of [1, -1] as const) {
    const intensity = Math.max(0, side * swing)
    if (intensity < 0.12) continue
    const length = side > 0 ? 70 : 44
    const tilt = Math.sin(phase * 2) * 0.05
    for (let step = 0; step < length; step++) {
      const mid = origin.y + Math.round(tilt * step * side)
      const halfWidth = 1 + Math.floor(step / 6.5)
      for (let dy = -halfWidth; dy <= halfWidth; dy++) {
        const level = (1 - Math.abs(dy) / (halfWidth + 1)) * intensity * 1.1 * (1 - step / (length * 1.15))
        if (dth(level, origin.x + side * (step + 6), mid + dy)) dRect(ctx, origin.x + side * (step + 6) - (side < 0 ? 1 : 0), mid + dy, 1, 1, P.sun[3])
      }
    }
  }
  // Halo and a flashing core in the glass: the flash peaks as the beam swings through the viewer.
  const flash = 0.5 - 0.5 * Math.cos(phase * 2)
  for (let dy = -9; dy <= 9; dy++) for (let dx = -12; dx <= 12; dx++) {
    const d = Math.hypot(dx / 12, dy / 9)
    if (d > 1 || d < 0.55) continue
    if (dth((1 - d) * 1.1 * (0.5 + flash * 0.5), origin.x + dx, origin.y + dy)) dRect(ctx, origin.x + dx, origin.y + dy, 1, 1, P.sun[4])
  }
}

/** The lantern glass flashes as the beam swings through the viewer. Drawn after the tower. */
export function drawLanternCore(ctx: Ctx, x: number, horizon: number, frame: number): void {
  const origin = lanternCentre(x, horizon)
  const phase = (frame % BEAM_PERIOD) / BEAM_PERIOD * Math.PI * 2
  const flash = 0.5 - 0.5 * Math.cos(phase * 2)
  // Panes sit either side of the mullion cross; brighten them with the flash.
  for (const [px, py] of [[-5, -5], [1, -5], [-5, 0], [1, 0]] as const) {
    if (flash > 0.55) dRect(ctx, origin.x + px, origin.y + py, 4, 4, P.sun[4])
    else dRect(ctx, origin.x + px + 1, origin.y + py + 1, 2, 2, P.sun[4])
  }
}
