import { describe, expect, it } from 'vitest'
import { JUDGE, BUDGET, ROOMS } from './config'
import { COOP_SIZE_FULL_SPAN, COOP_SIZE_MIN_DENSITY, coopScore, coopScoreParts, coopSize, largestShape, teamWinner } from './scoring'

const W = 32
const H = 32

function blank(width = W, height = H): Uint8Array {
  return new Uint8Array(width * height)
}

function paint(cells: Uint8Array, width: number, x: number, y: number, color = 4): void {
  cells[y * width + x] = color
}

function fill(cells: Uint8Array, width: number, x: number, y: number, w: number, h: number, color = 4): void {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) paint(cells, width, col, row, color)
  }
}

function outline(cells: Uint8Array, width: number, x: number, y: number, w: number, h: number, color = 4): void {
  for (let col = x; col < x + w; col++) {
    paint(cells, width, col, y, color)
    paint(cells, width, col, y + h - 1, color)
  }
  for (let row = y; row < y + h; row++) {
    paint(cells, width, x, row, color)
    paint(cells, width, x + w - 1, row, color)
  }
}

const input = (cells: Uint8Array, durationMs: number, width = W, height = H) => ({
  cells,
  width,
  height,
  durationMs,
  capMs: 300_000,
})

describe('constants', () => {
  it('exposes judge, budget, and room limits', () => {
    expect(JUDGE).toEqual({
      model: 'claude-haiku-5-5',
      maxTokens: 1024,
      renderPx: 512,
      tickMs: 15_000,
      askMinMs: 10_000,
      maxPerMinute: 6,
    })
    expect(BUDGET).toEqual({ dailyCalls: 1000 })
    expect(ROOMS).toEqual({
      maxActivePerUser: 5,
      resumeWindowMs: 600_000,
      closeAfterEmptyMs: 1_800_000,
    })
    expect(COOP_SIZE_FULL_SPAN).toBe(0.75)
    expect(COOP_SIZE_MIN_DENSITY).toBe(0.08)
  })
})

describe('largestShape', () => {
  it('picks the biggest 8-connected blob and ignores diagonal gaps', () => {
    const cells = blank()
    fill(cells, W, 2, 2, 4, 4)
    // A diagonal chain is one 8-connected shape under the 8-neighbour rule.
    for (let i = 0; i < 6; i++) paint(cells, W, 20 + i, 20 + i)
    const shape = largestShape(cells, W, H)
    expect(shape).toMatchObject({ cells: 16, width: 4, height: 4, density: 1 })
    expect(largestShape(blank(), W, H)).toBeNull()
  })
})

describe('coopSize', () => {
  it('scores a tiny centred doodle far below a big drawing', () => {
    const doodle = blank()
    fill(doodle, W, 15, 15, 3, 3)
    const big = blank()
    fill(big, W, 4, 4, 24, 24)
    const tiny = coopSize(doodle, W, H)
    expect(tiny).toBeLessThan(0.05)
    expect(coopSize(big, W, H)).toBe(1)
    expect(tiny).toBeLessThan(coopSize(big, W, H))
  })

  it('gives four corner dots almost no size credit', () => {
    const dots = blank()
    for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) paint(dots, W, x, y)
    expect(coopSize(dots, W, H)).toBeLessThan(0.01)
  })

  it('rewards a big outline square almost as much as a filled one', () => {
    const frame = blank()
    outline(frame, W, 4, 4, 24, 24)
    const filled = blank()
    fill(filled, W, 4, 4, 24, 24)
    expect(coopSize(frame, W, H)).toBeCloseTo(1, 5)
    expect(coopSize(frame, W, H)).toBeLessThanOrEqual(coopSize(filled, W, H))
  })

  it('tapers a big but sparse shape below the density floor', () => {
    const diagonal = blank()
    for (let i = 0; i < W; i++) paint(diagonal, W, i, i)
    const size = coopSize(diagonal, W, H)
    // Full span (1) times density (32/1024 = 3.1% of 8%) = ~0.39.
    expect(size).toBeGreaterThan(0.3)
    expect(size).toBeLessThan(0.5)
  })

  it('scales a shape that spans one axis but not the other', () => {
    const band = blank()
    fill(band, W, 0, 14, 32, 4)
    expect(coopSize(band, W, H)).toBeCloseTo(Math.min(1, 1 / 0.75) * Math.min(1, 4 / H / 0.75), 5)
  })
})

describe('coopScore', () => {
  it('weights size 60% and speed 40% out of 1000', () => {
    const big = blank()
    fill(big, W, 4, 4, 24, 24)
    expect(coopScore(input(big, 0))).toBe(1000)
    // Half the time budget used, with a full-size shape: 600 + 200.
    expect(coopScore(input(big, 150_000))).toBe(800)
    // Half the canvas across both axes: span = (16/32/0.75)^2 = 4/9, full speed.
    const half = blank()
    fill(half, W, 8, 8, 16, 16)
    expect(coopScore(input(half, 0))).toBe(667)
  })

  it('gives a blank canvas only the speed half', () => {
    expect(coopScore(input(blank(), 0))).toBe(400)
    expect(coopScore(input(blank(), 300_000))).toBe(0)
  })

  it('clamps above 1000 when inputs are negative', () => {
    const big = blank()
    fill(big, W, 0, 0, 32, 32)
    expect(coopScore(input(big, -100))).toBe(1000)
  })

  it('ranks a big drawing above a tiny one at the same speed', () => {
    const doodle = blank()
    fill(doodle, W, 14, 14, 4, 4)
    const big = blank()
    fill(big, W, 4, 4, 24, 24)
    expect(coopScore(input(big, 60_000))).toBeGreaterThan(coopScore(input(doodle, 60_000)))
    expect(coopScore(input(doodle, 0))).toBeLessThan(coopScore(input(big, 60_000)))
  })
})

describe('coopScoreParts', () => {
  it('splits into size (600) + time (400) that sum to the total', () => {
    const cases = [
      input(blank(), 0),
      input(blank(), 300_000),
      input((() => { const c = blank(); fill(c, W, 4, 4, 24, 24); return c })(), 60_000),
      input((() => { const c = blank(); fill(c, W, 0, 0, 16, 16); return c })(), 150_000),
      input(blank(2, 2), 0, 2, 2),
    ]
    for (const fixture of cases) {
      const parts = coopScoreParts(fixture)
      expect(parts.total).toBe(coopScore(fixture))
      expect(parts.size + parts.time).toBe(parts.total)
      expect(parts.size).toBeGreaterThanOrEqual(0)
      expect(parts.size).toBeLessThanOrEqual(600)
      expect(parts.time).toBeGreaterThanOrEqual(0)
      expect(parts.time).toBeLessThanOrEqual(400)
    }
    expect(coopScoreParts(input(blank(), 0))).toEqual({ size: 0, time: 400, total: 400 })
    expect(coopScoreParts(input(blank(), 300_000))).toEqual({ size: 0, time: 0, total: 0 })
  })
})

describe('teamWinner', () => {
  it('prefers matched team over unmatched regardless of confidence', () => {
    expect(teamWinner({ matched: true, confidence: 0.2 }, { matched: false, confidence: 0.9 })).toBe('red')
    expect(teamWinner({ matched: false, confidence: 0.95 }, { matched: true, confidence: 0.1 })).toBe('blue')
  })

  it('breaks ties by higher confidence and returns draw when equal', () => {
    expect(teamWinner({ matched: true, confidence: 0.8 }, { matched: true, confidence: 0.6 })).toBe('red')
    expect(teamWinner({ matched: false, confidence: 0.3 }, { matched: false, confidence: 0.7 })).toBe('blue')
    expect(teamWinner({ matched: true, confidence: 0.75 }, { matched: true, confidence: 0.75 })).toBe('draw')
    expect(teamWinner({ matched: false, confidence: 0.4 }, { matched: false, confidence: 0.4 })).toBe('draw')
  })
})
