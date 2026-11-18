import { describe, expect, it } from 'vitest'
import { drawCatSleepZs } from './drawPorch'
import { P } from '../palette'

function captureRects(frame: number) {
  const rects: Array<{ x: number; y: number; w: number; h: number; fillStyle: string }> = []
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fillStyle: this.fillStyle })
    },
  } as unknown as CanvasRenderingContext2D
  drawCatSleepZs(ctx, 45, 130, frame)
  return rects
}

describe('porch cat sleeping z animation', () => {
  it('draws two frozen palette-coloured z glyphs at frame 0 (reduced motion)', () => {
    const rects = captureRects(0)
    expect(rects.length).toBe(7)
    const palette = new Set(Object.values(P).flat())
    for (const r of rects) {
      expect(Number.isInteger(r.x)).toBe(true)
      expect(Number.isInteger(r.y)).toBe(true)
      expect(palette.has(r.fillStyle as (typeof P.paper)[number])).toBe(true)
    }
    expect(new Set(rects.map(r => r.fillStyle))).toEqual(new Set([P.paper[4], P.paper[2]]))
  })

  it('rises and fades over the animation loop in integer scene pixels', () => {
    const early = captureRects(3)
    const mid = captureRects(6)
    const late = captureRects(9)
    expect(early.length).toBeGreaterThan(0)
    expect(mid.length).toBeGreaterThan(0)
    expect(late.length).toBeGreaterThan(0)
    const maxY = (rects: ReturnType<typeof captureRects>) => Math.max(...rects.map(r => r.y))
    expect(maxY(mid)).toBeLessThan(maxY(early))
    expect(maxY(late)).toBeLessThan(maxY(mid))
    expect(late.some(r => r.fillStyle === P.paper[2])).toBe(true)
  })
})
