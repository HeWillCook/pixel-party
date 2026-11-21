import { describe, expect, it, vi } from 'vitest'
import { bayer, DETAIL, DetailGrid, dRect, drawDetailSprite, dth, shadeRegion } from './detail'
import { defineSprite } from './sprite'

function mockCtx() {
  const calls: Array<{ x: number; y: number; w: number; h: number; fill: string }> = []
  const ctx = {
    fillStyle: '', imageSmoothingEnabled: true,
    fillRect(x: number, y: number, w: number, h: number) { calls.push({ x, y, w, h, fill: ctx.fillStyle }) },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

describe('detail grid helpers', () => {
  it('maps detail pixels to half-unit logical rects', () => {
    const { ctx, calls } = mockCtx()
    dRect(ctx, 3, 5, 4, 2, '#fff')
    expect(DETAIL).toBe(2)
    expect(calls).toEqual([{ x: 1.5, y: 2.5, w: 2, h: 1, fill: '#fff' }])
  })

  it('keeps the Bayer threshold in (0, 1) and uses all sixteen levels', () => {
    const levels = new Set<number>()
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const value = bayer(x, y); expect(value).toBeGreaterThan(0); expect(value).toBeLessThan(1); levels.add(value) }
    expect(levels.size).toBe(16)
  })

  it('quantises dither to clean quarter steps (no isolated sparse dots)', () => {
    const coverage = (level: number) => {
      let on = 0
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (dth(level, x, y)) on++
      return on / 16
    }
    expect(coverage(0)).toBe(0)
    expect(coverage(0.1)).toBe(0) // rounds to 0, not a lone speckle
    expect(coverage(0.25)).toBe(0.25)
    expect(coverage(0.5)).toBe(0.5)
    expect(coverage(0.75)).toBe(0.75)
    expect(coverage(1)).toBe(1)
  })

  it('shades a region per pixel without a DOM, skipping transparent pixels', () => {
    const { ctx, calls } = mockCtx()
    shadeRegion(ctx, 10, 20, 2, 2, (x, y) => (x + y) % 2 === 0 ? '#abc' : null)
    expect(calls.map(c => [c.x, c.y])).toEqual([[5, 10], [5.5, 10.5]])
  })

  it('builds detail sprites from a grid and draws them half-unit aligned', () => {
    const grid = new DetailGrid(3, 2)
    grid.rect(0, 0, 2, 1, 'a')
    grid.px(2, 1, 'b')
    expect(grid.lines()).toEqual(['aa.', '..b'])
    const sprite = defineSprite(grid.lines(), { a: '#111', b: '#222' })
    const { ctx, calls } = mockCtx()
    drawDetailSprite(ctx, sprite, 4, 6)
    expect(calls.map(c => [c.x, c.y, c.fill])).toEqual([[4, 6, '#111'], [4.5, 6, '#111'], [5, 6.5, '#222']])
    const flipped = mockCtx()
    drawDetailSprite(flipped.ctx, sprite, 4, 6, { flipX: true })
    expect(flipped.calls[0].x).toBe(5)
    expect(vi.isMockFunction(ctx.fillRect)).toBe(false)
  })
})
