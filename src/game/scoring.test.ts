import { describe, expect, it } from 'vitest'
import { JUDGE, BUDGET, ROOMS } from './config'
import { teamWinner } from './scoring'

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
