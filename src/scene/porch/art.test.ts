import { describe, expect, it } from 'vitest'
import { P } from '../palette'
import { drawPorch } from './drawPorch'
import { BOOSTER_2X, drawThruster } from './booster'
import { paintBackdrop } from './skyArt'
import { porchLayout } from './layout'
import { drawStudio } from '../studio/drawStudio'
import { catPose, drawCat, paintSleeper, PixelBuf, BREATH_PERIOD, FLICK_PERIOD, SLEEPER_H, SLEEPER_W } from './catArt'
import { BEAM_PERIOD } from './lighthouseArt'

const PALETTE = new Set<string>(Object.values(P).flat())

function recorder(width: number, height: number) {
  const fills = new Set<string>()
  const alphas = new Set<number>()
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const ctx = {
    canvas: { width, height }, imageSmoothingEnabled: true, globalAlpha: 1,
    _fill: '',
    get fillStyle() { return this._fill },
    set fillStyle(value: string) { this._fill = value },
    save() {}, restore() {}, translate() {},
    fillRect(x: number, y: number, w: number, h: number) {
      fills.add(this._fill); alphas.add(this.globalAlpha)
      bounds.minX = Math.min(bounds.minX, x); bounds.minY = Math.min(bounds.minY, y)
      bounds.maxX = Math.max(bounds.maxX, x + w); bounds.maxY = Math.max(bounds.maxY, y + h)
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, alphas, bounds }
}

describe('2x porch art', () => {
  it('thruster keeps the original 9x11 footprint, uses palette colours only and loops in three frames', () => {
    const snapshots: string[] = []
    for (let frame = 0; frame < 6; frame++) {
      const { ctx, fills, bounds } = recorder(320, 180)
      drawThruster(ctx, 100, 50, frame)
      for (const fill of fills) expect(PALETTE.has(fill), fill).toBe(true)
      expect(bounds.minX).toBeGreaterThanOrEqual(100)
      expect(bounds.maxX).toBeLessThanOrEqual(100 + BOOSTER_2X.width / 2)
      expect(bounds.minY).toBeGreaterThanOrEqual(50)
      expect(bounds.maxY).toBeLessThanOrEqual(50 + BOOSTER_2X.height / 2 + 0.5)
      snapshots.push(JSON.stringify([...fills].sort()) + JSON.stringify(bounds))
    }
    expect(snapshots.slice(0, 3)).toEqual(snapshots.slice(3))
    expect(new Set(snapshots).size).toBeGreaterThan(1)
  })

  it('paints the backdrop with palette colours only, and every cloud/sun pixel inside the sky', () => {
    const { ctx, fills, bounds } = recorder(320, 180)
    paintBackdrop(ctx, { width: 320, horizon: 100, shore: 118, sunX: 232, sunR: 24, clouds: [[30, 52, 68]], islandX: 60 })
    for (const fill of fills) expect(PALETTE.has(fill), fill).toBe(true)
    expect(bounds.minX).toBeGreaterThanOrEqual(0)
    expect(bounds.maxX).toBeLessThanOrEqual(320)
    expect(bounds.maxY).toBeLessThanOrEqual(118 + 0.5)
  })

  it.each(['landscape', 'portrait'] as const)('draws the whole %s porch with palette colours at integer-or-half-unit positions', (composition) => {
    const size = composition === 'landscape' ? { w: 320, h: 180 } : { w: 180, h: 320 }
    const { ctx, fills, bounds } = recorder(size.w, size.h)
    for (const frame of [0, 5, 11]) drawPorch(ctx, frame, { easelState: 'cover', bob: true, soundOn: true, signedIn: frame !== 5, roofTop: 0 })
    const extra = new Set<string>()
    for (const fill of fills) if (!PALETTE.has(fill)) extra.add(fill)
    expect([...extra]).toEqual([])
    // Swell dashes and foam run just past the edges so they can scroll in; nothing may spill far past either side.
    expect(bounds.minX).toBeGreaterThanOrEqual(-40)
    expect(bounds.maxX).toBeLessThanOrEqual(size.w + 40)
    // Layout rects that the overlays and camera rely on are untouched by the art pass.
    expect(porchLayout.landscape.mailbox).toEqual({ x: 17, y: 75, w: 28, h: 24 })
    expect(porchLayout.landscape.easel).toEqual({ x: 138, y: 40, w: 68, h: 116 })
  })

  it.each(['landscape', 'portrait'] as const)('draws the %s basement studio with palette colours only', (composition) => {
    const size = composition === 'landscape' ? { w: 320, h: 180 } : { w: 180, h: 320 }
    const { ctx, fills } = recorder(size.w, size.h)
    for (const frame of [0, 4, 9]) drawStudio(ctx, frame)
    const extra = [...fills].filter(fill => !PALETTE.has(fill))
    expect(extra).toEqual([])
  })

  it('loops the cat breathing, tail flick and lighthouse beam without drifting', () => {
    const loop = 120 // lcm of the breath (24) and flick (60) periods
    expect(catPose(0)).toEqual(catPose(loop))
    const poses = new Set(Array.from({ length: loop }, (_, frame) => JSON.stringify(catPose(frame))))
    expect(poses.size).toBe(6) // two breaths, with the tail at rest or in either flick pose
    expect(BREATH_PERIOD * 5).toBe(loop)
    expect(FLICK_PERIOD * 2).toBe(loop)
    expect(BEAM_PERIOD % 12).toBe(0) // a whole number of seconds at 12 fps
  })

  it('naps as Haiku: the same cream coat and tabby markings, the beret off and hung beside her', () => {
    const buf = new PixelBuf(SLEEPER_W + 8, SLEEPER_H + 8, -4, -4)
    paintSleeper(buf, 0, 0, { breath: 0, flick: 0 })
    const colours = new Set<string>()
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (let y = -4; y < SLEEPER_H + 4; y++) for (let x = -4; x < SLEEPER_W + 4; x++) {
      const c = buf.get(x, y)
      if (!c) continue
      colours.add(c); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
    for (const colour of [P.fur[0], P.fur[2], P.fur[3], P.fur[4], P.ui[3]]) expect(colours.has(colour), colour).toBe(true) // coat, stripes, outline, pink ears and nose
    expect(colours.has(P.flame[1])).toBe(false) // no beret on her head
    expect(minX).toBeGreaterThanOrEqual(-4); expect(maxX).toBeLessThan(SLEEPER_W) // a little whisker clearance to the left, nothing past the footprint on the right
    expect(minY).toBeGreaterThanOrEqual(0); expect(maxY).toBeLessThan(SLEEPER_H)
    // On the porch the beret hangs over the chair post beside her, in the scene's red.
    const { ctx, fills } = recorder(320, 180)
    drawCat(ctx, porchLayout.landscape.cat.x, porchLayout.landscape.cat.y, 0)
    expect(fills.has(P.flame[1])).toBe(true)
    expect([...fills].filter(fill => !PALETTE.has(fill))).toEqual([])
  })
})
