import { bayer, dRect, DETAIL, dth, shadeRegion } from '../detail'
import type { Rect } from '../camera'
import { P } from '../palette'
import { mulberry32 } from '../procedural'

type Ctx = CanvasRenderingContext2D

interface SkyOptions {
  width: number
  horizon: number
  shore: number
  sunX: number
  sunR: number
  clouds: ReadonlyArray<readonly [number, number, number]>
  /** Left edge of the distant island, in logical units. */
  islandX: number
}

interface Lump { cx: number; cy: number; rx: number; ry: number }
interface Cloud { x0: number; x1: number; y0: number; y1: number; cy: number; lumps: Lump[]; length: number; left: number }

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function buildCloud(x: number, y: number, w: number): Cloud {
  const rng = mulberry32(Math.round(x * 31 + y * 17 + w))
  const left = x * DETAIL, length = w * DETAIL, cy = (y + 2.4) * DETAIL
  const count = Math.max(3, Math.round(w / 8))
  const span = length / count
  const lumps: Lump[] = []
  for (let index = 0; index < count; index++) {
    const centre = (index + 0.5) / count
    // Taller in the middle, tapering to wispy ends; a cumulus-ish top on a flat belly.
    const envelope = Math.sin(centre * Math.PI)
    lumps.push({
      cx: left + centre * length + (rng() - 0.5) * span * 0.5,
      cy: cy - (0.8 + rng() * 1.4) * envelope * 2.2,
      rx: span * (0.75 + rng() * 0.45),
      ry: 1.6 + envelope * (1.8 + rng() * 2.4),
    })
  }
  return { x0: left - span, x1: left + length + span, y0: cy - 14, y1: cy + 9, cy, lumps, length, left }
}

/** Soft coverage of a cloud at a detail pixel: 0 outside, ramping to 1 inside. */
export function coverage(cloud: Cloud, x: number, y: number): number {
  if (x < cloud.x0 || x > cloud.x1 || y < cloud.y0 || y > cloud.y1) return 0
  let best = 0
  for (const lump of cloud.lumps) {
    const dx = (x - lump.cx) / lump.rx, dy = (y - lump.cy) / lump.ry
    const value = 1 - Math.sqrt(dx * dx + dy * dy)
    if (value > best) best = value
  }
  // Flat belly: the cloud is cut off just under its baseline.
  const below = y - (cloud.cy + 2.5)
  return below > 0 ? best * clamp01(1 - below / 2.2) : best
}

/**
 * Static backdrop: dithered sunset sky, haloed sun with horizon slits, soft layered clouds, the island
 * silhouette and the sea's base tone with a haze line. Painted once and cached by the caller.
 */
export function paintBackdrop(ctx: Ctx, opts: SkyOptions): void {
  const { width, horizon, shore, sunX, sunR } = opts
  const W = width * DETAIL
  const H = shore * DETAIL
  const horizonD = horizon * DETAIL
  const sunCx = sunX * DETAIL + 1, sunCy = (horizon + 1) * DETAIL, sunRd = sunR * DETAIL
  const clouds = opts.clouds.map(([x, y, w]) => buildCloud(x, y, w))
  const bandCount = P.sky.length
  const bandOf = (yl: number) => Math.max(0, Math.min(bandCount - 1, Math.floor(yl / horizon * bandCount)))
  const islandLeft = opts.islandX * DETAIL, islandWidth = 55 * DETAIL
  const islandHeight = 6 * DETAIL
  const zone = 1.6 // half-height of the dithered band transitions, in logical units

  shadeRegion(ctx, 0, 0, W, H, (x, y) => {
    if (y >= horizonD + 2) {
      // Sea base tone under one clean light horizon line, with the island's dark reflection beneath it.
      const k = y - horizonD - 2
      if (y === horizonD + 2) return P.sea[4]
      const rx = x - islandLeft
      if (k > 1 && k < 10 && rx > 12 && rx < islandWidth - 12 && k % 3 === 1 && (rx + k * 5) % 16 < 9 + (10 - k) / 2) return P.sea[0]
      return P.sea[1]
    }
    const yl = y / DETAIL
    // Island silhouette, rim-lit on the sun side.
    const ix = x - islandLeft
    if (ix >= 0 && ix < islandWidth && y <= horizonD + 1) {
      const t = ix / islandWidth
      const top = horizonD - Math.sin(t * Math.PI) * islandHeight
      if (y >= top) {
        const slope = -Math.cos(t * Math.PI) // >0 on the descending (sun-facing) side
        const depth = y - top
        // Scrubby cap of dark vegetation clumps on the crest, a rocky lit shoulder on the sun side, plain hill below.
        const clump = 1.5 + Math.abs(Math.sin(ix * 0.33)) * 2.6 + Math.abs(Math.sin(ix * 0.9)) * 0.8
        if (depth < clump && t > 0.1 && t < 0.9) return slope > 0.25 && depth < 1.2 ? P.sky[3] : P.sky[1]
        if (slope > 0.2 && depth < 4) return P.sky[3]
        if (slope > 0.2 && depth < 7 && (ix + depth * 3) % 7 < 2) return P.sky[3]
        if (slope < -0.25 && depth < 3) return P.sky[1]
        return P.sky[2]
      }
    }
    // Soft clouds, tinted by the band they sit in: pale over the dark sky, dusky against the bright horizon.
    for (const cloud of clouds) {
      const cover = coverage(cloud, x, y)
      if (cover <= 0 || !dth(cover * 3.2, x, y)) continue
      const band = bandOf(cloud.cy / DETAIL)
      const t = clamp01((y - (cloud.cy - 7)) / 12)
      const nx = clamp01((x - cloud.left) / cloud.length)
      const lit = 0.55 * t + 0.45 * nx
      const jitter = (bayer(x + 2, y + 1) - 0.5) * 0.28
      if (band >= 4) return lit + jitter > 0.78 ? P.sky[band] : lit + jitter > 0.34 ? P.sky[band - 1] : P.sky[band - 2]
      return lit + jitter > 0.62 ? P.sky[Math.min(5, band + 2)] : P.sky[Math.min(5, band + 1)]
    }
    // Sun disc with horizon slits and a dithered halo.
    const dx = x - sunCx, dy = y - sunCy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist <= sunRd) {
      const rise = sunCy - y
      if ((rise > 4 && rise <= 5) || (rise > 10 && rise <= 11) || (rise > 17 && rise <= 19)) {
        // slit: fall through to the sky
      } else {
        const d = dist / sunRd, h = rise / sunRd
        if (h < 0.3 + (bayer(x, y) - 0.5) * 0.12) return P.sun[2]
        if (d < 0.46 + (bayer(x, y) - 0.5) * 0.14 && h > 0.16) return P.sun[4]
        return P.sun[3]
      }
    } else if (dist < sunRd + 5) {
      return P.sky[5] // solid inner glow ring
    } else if (dist < sunRd + 17 && dth((1 - (dist - sunRd - 5) / 12) * 0.9, x, y)) {
      return P.sky[5]
    }
    return skyBand(x, y, horizon)
  })
}

/** The banded dusk sky at a detail pixel, with ordered-dither transitions: the one gradient every view of the sky uses. */
export function skyBand(x: number, y: number, horizon: number): string {
  const yl = y / DETAIL, bandCount = P.sky.length, zone = 1.6
  const band = Math.max(0, Math.min(bandCount - 1, Math.floor(yl / horizon * bandCount)))
  const bandTop = band * horizon / bandCount
  const bandBottom = (band + 1) * horizon / bandCount
  if (band > 0 && yl - bandTop < zone && dth(1 - (yl - bandTop + zone) / (2 * zone), x, y, 2)) return P.sky[band - 1]
  if (band < bandCount - 1 && bandBottom - yl < zone && dth((yl - (bandBottom - zone)) / (2 * zone), x, y, 2)) return P.sky[band + 1]
  return P.sky[band]
}

interface Swell { y: number; period: number; length: number; speed: number; phase: number; depth: number }
interface Glint { x: number; y: number; phase: number; period: number; wide: boolean }
interface SeaCache { swells: Swell[]; glints: Glint[] }
const seaCache = new Map<string, SeaCache>()

function seaFor(key: string, width: number, horizon: number, shore: number, sunX: number): SeaCache {
  let cached = seaCache.get(key)
  if (cached) return cached
  const rng = mulberry32(394)
  const depthD = (shore - horizon) * DETAIL
  const count = Math.max(7, Math.round(depthD / 9))
  const swells: Swell[] = []
  const glints: Glint[] = []
  for (let index = 0; index < count; index++) {
    const depth = ((index + 0.5) / count) ** 1.55 // lines bunch toward the horizon, like receding swells
    const y = Math.floor(horizon * DETAIL + 3 + depth * (depthD - 5))
    const period = Math.round(16 + depth * 64 + rng() * 10)
    swells.push({ y, period, length: Math.round(period * (0.42 + rng() * 0.2)), speed: (index % 2 ? 1 : -1) * (0.18 + depth * 0.35), phase: Math.floor(rng() * period), depth })
    const half = 20 + depth * 70
    const sparkles = 3 + Math.round(depth * 5)
    for (let g = 0; g < sparkles; g++) {
      glints.push({ x: Math.round(sunX * DETAIL + (rng() * 2 - 1) * half), y: y + (rng() < 0.5 ? -1 : 0), phase: Math.floor(rng() * 12), period: 8 + Math.floor(rng() * 8), wide: rng() < 0.5 })
    }
  }
  cached = { swells, glints }
  seaCache.set(key, cached)
  void width
  return cached
}

/**
 * Animated sea: layered receding swell lines (a lit crest over a dark trough) drifting in alternating
 * directions, with the sun path breaking the crests into warm glints that twinkle.
 */
export function drawSea(ctx: Ctx, frame: number, width: number, horizon: number, shore: number, sunX: number): void {
  const { swells, glints } = seaFor(`${width}|${horizon}|${shore}|${sunX}`, width, horizon, shore, sunX)
  const W = width * DETAIL
  const sunCx = sunX * DETAIL
  for (const swell of swells) {
    const shift = Math.floor(frame * swell.speed)
    const half = 26 + swell.depth * 74
    const start = ((swell.phase + shift) % swell.period + swell.period) % swell.period - swell.period
    for (let x = start; x < W; x += swell.period) {
      const len = swell.length
      const mid = x + len / 2
      const inPath = Math.abs(mid - sunCx) < half
      const falloff = 1 - Math.abs(mid - sunCx) / half
      const crest = inPath ? (falloff > 0.55 ? P.sun[3] : P.sun[2]) : swell.depth > 0.5 ? P.sea[3] : P.sea[2]
      dRect(ctx, x, swell.y, len, 1, crest)
      // Short lower lip and the dark trough, offset so the swell reads as a rolling ridge rather than a stripe.
      dRect(ctx, x + 2, swell.y + 1, Math.max(2, len - 5), 1, inPath ? P.sun[1] : P.sea[0])
      if (swell.depth > 0.35) dRect(ctx, x + len - 3, swell.y - 1, 3, 1, inPath ? P.sun[2] : P.sea[2])
    }
  }
  // Sparse glints sitting on the horizon line itself: warm near the sun, pale elsewhere.
  for (const spot of horizonGlints(width, sunX)) {
    const on = (frame + spot.phase) % spot.period
    if (on > 2) continue
    dRect(ctx, spot.x, horizon * DETAIL + 2, on === 1 ? 3 : 2, 1, Math.abs(spot.x - sunCx) < 70 ? P.sun[4] : P.paper[4])
  }
  for (const glint of glints) {
    const on = (frame + glint.phase) % glint.period
    if (on > 3) continue
    dRect(ctx, glint.x, glint.y, glint.wide ? 3 : 2, 1, P.sun[4])
    if (on === 1 || on === 2) dRect(ctx, glint.x + 1, glint.y - 1, 1, 3, P.sun[3])
  }
}

const horizonCache = new Map<string, Array<{ x: number; phase: number; period: number }>>()
function horizonGlints(width: number, sunX: number) {
  const key = `${width}|${sunX}`
  let list = horizonCache.get(key)
  if (!list) {
    const rng = mulberry32(811)
    list = []
    for (let i = 0; i < 9; i++) {
      const nearSun = i < 5
      const x = nearSun ? Math.round(sunX * DETAIL + (rng() * 2 - 1) * 60) : Math.round(rng() * width * DETAIL)
      list.push({ x, phase: Math.floor(rng() * 14), period: 10 + Math.floor(rng() * 10) })
    }
    horizonCache.set(key, list)
  }
  return list
}

const D = DETAIL
export interface ViewKind { island?: boolean; sun?: boolean; birds?: boolean; driftwood?: boolean; /** The basement's view: the window sits at sand level, so the horizon is high in the pane. */ low?: boolean }

/** Heights in detail pixels of the sky and the sea in a window pane. A low (basement) window is mostly sea, and its sky is short. */
export function windowSplit(win: Rect, low?: boolean): { skyH: number; seaH: number } {
  return { skyH: Math.round(win.h * (low ? 0.3 : 0.48)) * D, seaH: Math.round(win.h * (low ? 0.4 : 0.28)) * D }
}

/** The scene in a window (studio, gallery and room walls): dithered dusk sky, soft clouds, optional sun / island with a tiny lighthouse, horizon line, sea base, beach. */
export function paintWindowView(ctx: Ctx, win: Rect, kind: ViewKind, portrait: boolean): void {
  const x0 = win.x * D, y0 = win.y * D, w = win.w * D, h = win.h * D
  const { skyH, seaH } = windowSplit(win, kind.low)
  const horizon = y0 + skyH, shore = horizon + seaH
  const cloudY = win.y + Math.max(3, Math.floor(skyH / D * 0.35))
  const clouds = [buildCloud(win.x + 8, cloudY, 18)]
  if (win.w >= 60) clouds.push(buildCloud(win.x + win.w - 30, cloudY + 4, 20))
  const sunR = (portrait ? 6 : 9) * D
  const sunCx = x0 + Math.round(w * 0.72), sunCy = horizon + 2
  const bands = [P.sky[1], P.sky[2], P.sky[3], P.sky[4], P.sky[5]]
  const bandAt = (y: number) => Math.min(bands.length - 1, Math.max(0, Math.floor((y - y0) / skyH * bands.length)))
  const rng = mulberry32(win.x * 7 + win.w)
  const bumps = Array.from({ length: 24 }, () => rng())
  shadeRegion(ctx, x0, y0, w, h, (x, y) => {
    if (y >= shore) {
      // Beach: foam line, wet sand, then dry sand with the faintest ripple lines.
      const k = y - shore
      if (k === 0) return P.sea[4]
      if (k < 3) return (x + k) % 6 < 3 ? P.paper[4] : P.sea[4]
      if (k < 6) return P.paper[2]
      if (k < 8) return dth((8 - k) / 2, x, y, 2) ? P.paper[2] : P.paper[3]
      return k % 9 === 0 && (x + k * 3) % 40 < 24 ? P.paper[3] : P.paper[4]
    }
    if (y >= horizon) return y === horizon ? P.sea[4] : P.sea[1]
    // Island with a tiny lighthouse (left window).
    if (kind.island) {
      const ix = x - (x0 + 16), iw = 44
      if (ix >= 0 && ix < iw && y > horizon - 9) {
        const t = ix / iw
        const top = horizon - Math.sin(t * Math.PI) * 8 - bumps[ix % 24] * 0.6
        if (y >= top) return -Math.cos(t * Math.PI) > 0.25 && y - top < 3 ? P.sky[3] : P.sky[2]
      }
      const lx = x - (x0 + 31), ly = y - (horizon - 24)
      if (lx >= 0 && lx < 6 && ly >= 0 && ly < 17) {
        if (ly < 2) return lx > 0 && lx < 5 ? P.sun[4] : null
        if (ly < 5) return lx === 0 || lx === 5 ? P.sky[1] : P.sun[3]
        if (ly < 7) return P.sky[3]
        const band = Math.floor((ly - 7) / 3) % 2
        return lx === 0 ? P.sky[1] : lx >= 4 ? P.paper[4] : band === 0 ? P.paper[2] : P.sky[3]
      }
    }
    // Sun with horizon slits and a solid glow ring.
    if (kind.sun) {
      const dx = x - sunCx, dy = y - sunCy
      const dist = Math.hypot(dx, dy)
      if (dist <= sunR) {
        const rise = sunCy - y
        if (!((rise > 3 && rise <= 4) || (rise > 8 && rise <= 9))) {
          const hh = rise / sunR
          if (hh < 0.34) return P.sun[2]
          return dist / sunR < 0.5 && hh > 0.2 ? P.sun[4] : P.sun[3]
        }
      } else if (dist < sunR + 3) return P.sky[5]
      else if (dist < sunR + 10 && dth((1 - (dist - sunR - 3) / 7) * 0.9, x, y)) return P.sky[5]
    }
    for (const cloud of clouds) {
      const cover = coverage(cloud, x, y)
      if (cover > 0 && dth(cover * 3.2, x, y)) {
        const band = bandAt(cloud.cy)
        const t = Math.max(0, Math.min(1, (y - (cloud.cy - 7)) / 12))
        return band >= 3 ? bands[Math.max(0, band - 1)] : bands[Math.min(bands.length - 1, band + 1)] === bands[band] ? bands[band] : (t > 0.55 ? bands[Math.min(4, band + 2)] : bands[Math.min(4, band + 1)])
      }
    }
    // Sky bands with a four-row 75/50/25% ramp into the band above.
    const band = bandAt(y)
    const bandH = skyH / bands.length
    const rel = (y - y0) - band * bandH
    if (band > 0 && rel < 4 && dth((3 - rel) / 4, x, y)) return bands[band - 1]
    return bands[band]
  })
  if (kind.low) {
    // Dune grass along the sill: tufts of blades rising out of the sand at the bottom of the pane.
    for (let gx = 6; gx < w - 4; gx += 13 + ((gx * 7) % 9)) {
      const base = y0 + h - 1
      for (let b = 0; b < 4; b++) {
        const bh = 5 + ((gx + b * 3) % 5)
        const lean = b - 1
        for (let r = 0; r < bh; r++) dRect(ctx, x0 + gx + b * 2 + Math.round(lean * r * 0.25), base - r, 1, 1, r > bh - 3 ? P.foliage[4] : r > 1 ? P.foliage[3] : P.foliage[1])
      }
    }
  }
  if (kind.birds) {
    for (const [bx, by] of [[x0 + 14, y0 + 9], [x0 + 22, y0 + 13]]) { dRect(ctx, bx, by, 2, 1, P.sky[0]); dRect(ctx, bx + 3, by, 2, 1, P.sky[0]); dRect(ctx, bx + 2, by + 1, 1, 1, P.sky[0]) }
  }
  if (kind.driftwood) { dRect(ctx, x0 + 20, shore + 11, 12, 2, P.wood[2]); dRect(ctx, x0 + 22, shore + 10, 5, 1, P.wood[3]); dRect(ctx, x0 + 26, shore + 13, 5, 1, P.wood[1]) }
  // Reflection streaks on the glass.
  for (let i = 0; i < 7; i++) { dRect(ctx, x0 + 5 + i, y0 + 11 - i, 1, 1, P.sky[3]); dRect(ctx, x0 + 10 + i, y0 + 11 - i, 1, 1, P.sky[2]) }
}


/** Beach sand from the tide line down to `floor`, with optional driftwood and grass tufts at [x, groundY]. */
export function paintSand(ctx: Ctx, o: { width: number; shore: number; floor: number; driftwood?: boolean; tufts: ReadonlyArray<readonly [number, number]> }): void {
  const { width, shore, floor } = o
  const r = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) }
  r(0, shore, width, floor - shore, P.paper[3])
  r(0, shore + 5, width, floor - shore - 5, P.paper[4])
  for (let row = 3; row < 5; row++) for (let x = row % 2; x < width; x += 2) r(x, shore + row, 1, 1, P.paper[4])
  if (o.driftwood) { r(104, shore + 4, 10, 1, P.wood[2]); r(106, shore + 3, 4, 1, P.wood[3]); r(111, shore + 5, 5, 1, P.wood[1]) }
  for (const [x, y] of o.tufts) {
    r(x, y, 1, 7, P.foliage[2]); r(x - 2, y + 2, 1, 5, P.foliage[3]); r(x + 2, y + 3, 1, 4, P.foliage[2])
  }
}

/** Foam creeping along the tide line. */
export function drawFoam(ctx: Ctx, frame: number, width: number, shore: number): void {
  for (let x = 0; x < width; x += 9) {
    const offset = (x + Math.floor(frame / 8) * 2) % width
    ctx.fillStyle = P.sea[4]; ctx.fillRect(offset, shore - 1, 7, 1)
    ctx.fillStyle = P.paper[4]; ctx.fillRect(offset + 1, shore + (x % 3 === 0 ? 0 : 1), 5, 1)
  }
}
