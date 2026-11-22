import { describe, expect, it } from 'vitest'
import { rankScores } from './rank'

describe('rankScores', () => {
  it('sorts by score, then by the earlier attempt start', () => {
    expect(rankScores([
      { userId: 'a', score: 700, startedAt: 1_000 },
      { userId: 'b', score: 700, startedAt: 500 },
      { userId: 'c', score: 900, startedAt: 2_000 },
    ])).toEqual([{ userId: 'c', rank: 1 }, { userId: 'b', rank: 2 }, { userId: 'a', rank: 3 }])
  })

  it('returns no ranks for no scores', () => {
    expect(rankScores([])).toEqual([])
  })

  it('puts a missing start time last when scores are tied', () => {
    expect(rankScores([
      { userId: 'unknown', score: 700, startedAt: null },
      { userId: 'known', score: 700, startedAt: 200_000 },
    ])).toEqual([{ userId: 'known', rank: 1 }, { userId: 'unknown', rank: 2 }])
    expect(rankScores([
      { userId: 'unknown', score: 700 },
      { userId: 'known', score: 700, startedAt: 200_000 },
    ])).toEqual([{ userId: 'known', rank: 1 }, { userId: 'unknown', rank: 2 }])
  })

  it('keeps the stored medal order of a closed day on a tie', () => {
    expect(rankScores([
      { userId: 'earlier', score: 837, startedAt: 100, medal: 2 },
      { userId: 'gold', score: 837, startedAt: 900, medal: 1 },
      { userId: 'third', score: 819, startedAt: 50, medal: 3 },
      { userId: 'none', score: 700, startedAt: 10, medal: 0 },
    ]).map((row) => row.userId)).toEqual(['gold', 'earlier', 'third', 'none'])
  })
})
