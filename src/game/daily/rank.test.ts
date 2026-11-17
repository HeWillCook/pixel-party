import { describe, expect, it } from 'vitest'
import { rankScores } from './rank'

describe('rankScores', () => {
  it('sorts by score then elapsed time, with nulls last', () => {
    expect(rankScores([
      { userId: 'a', score: 700, bestElapsedMs: 200_000 },
      { userId: 'b', score: 700, bestElapsedMs: 150_000 },
      { userId: 'c', score: 900, bestElapsedMs: null },
    ])).toEqual([{ userId: 'c', rank: 1 }, { userId: 'b', rank: 2 }, { userId: 'a', rank: 3 }])
  })

  it('returns no ranks for no scores', () => {
    expect(rankScores([])).toEqual([])
  })

  it('puts missing elapsed times last when scores are tied', () => {
    expect(rankScores([
      { userId: 'unknown', score: 700, bestElapsedMs: null },
      { userId: 'known', score: 700, bestElapsedMs: 200_000 },
    ])).toEqual([{ userId: 'known', rank: 1 }, { userId: 'unknown', rank: 2 }])
  })
})
