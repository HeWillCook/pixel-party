import { describe, expect, it } from 'vitest'
import { JUDGE, BUDGET, ROOMS } from './config'
import { coopScore, coopScoreParts, teamWinner } from './scoring'

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
  })
})

describe('coopScore', () => {
  it('scores optimal, mid-round, and clamped bounds', () => {
    expect(coopScore({ pixelsUsed: 0, totalCells: 1024, durationMs: 0, capMs: 300_000 })).toBe(1000)
    expect(coopScore({ pixelsUsed: 256, totalCells: 1024, durationMs: 60_000, capMs: 300_000 })).toBe(775)
    expect(coopScore({ pixelsUsed: 1024, totalCells: 1024, durationMs: 400_000, capMs: 300_000 })).toBe(0)
  })

  it('clamps above 1000 when inputs are negative', () => {
    expect(coopScore({ pixelsUsed: -10, totalCells: 1024, durationMs: -100, capMs: 300_000 })).toBe(1000)
  })
})

describe('coopScoreParts', () => {
  it('coopScoreParts sums to coopScore', () => {
    const cases = [
      { pixelsUsed: 0, totalCells: 1024, durationMs: 0, capMs: 300_000 },
      { pixelsUsed: 256, totalCells: 1024, durationMs: 60_000, capMs: 300_000 },
      { pixelsUsed: 511, totalCells: 1024, durationMs: 149_707, capMs: 300_000 },
      { pixelsUsed: 1024, totalCells: 1024, durationMs: 400_000, capMs: 300_000 },
      { pixelsUsed: -10, totalCells: 1024, durationMs: -100, capMs: 300_000 },
    ]
    for (const fixture of cases) {
      const parts = coopScoreParts(fixture)
      expect(parts.total).toBe(coopScore(fixture))
      expect(parts.pixels + parts.time).toBe(parts.total)
      expect(parts.pixels).toBeGreaterThanOrEqual(0)
      expect(parts.pixels).toBeLessThanOrEqual(500)
      expect(parts.time).toBeGreaterThanOrEqual(0)
      expect(parts.time).toBeLessThanOrEqual(500)
    }
    expect(coopScoreParts(cases[0])).toEqual({ pixels: 500, time: 500, total: 1000 })
    expect(coopScoreParts(cases[1])).toEqual({ pixels: 375, time: 400, total: 775 })
    expect(coopScoreParts(cases[3])).toEqual({ pixels: 0, time: 0, total: 0 })
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
