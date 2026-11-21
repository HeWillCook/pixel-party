import { describe, expect, it } from 'vitest'
import { computeDailyStats, emptyDailyStats, toPartyStats, utcDayNumber } from './stats'

const at = (year: number, month: number, date: number, hour = 12) =>
  Date.UTC(year, month - 1, date, hour)

const row = (day: string, score = 500, medal = 0) => ({ day, score, medal })

describe('utcDayNumber', () => {
  it('accepts real UTC days and refuses anything else', () => {
    expect(utcDayNumber('2026-11-21')).toBe(Date.UTC(2026, 10, 21) / 86_400_000)
    expect(utcDayNumber('2026-02-30')).toBeNull()
    expect(utcDayNumber('2026-2-1')).toBeNull()
    expect(utcDayNumber('')).toBeNull()
    expect(utcDayNumber(20260101)).toBeNull()
    expect(utcDayNumber(undefined)).toBeNull()
  })
})

describe('computeDailyStats', () => {
  it('returns empty stats with no games', () => {
    expect(computeDailyStats([], at(2026, 11, 21))).toEqual(emptyDailyStats())
  })

  it('counts distinct days, the best (and its day) and the rounded average', () => {
    const stats = computeDailyStats([
      row('2026-11-15', 610),
      row('2026-11-16', 0),
      row('2026-11-17', 912),
      // A duplicate day keeps the better score instead of counting twice.
      row('2026-11-17', 400),
    ], at(2026, 11, 21))

    expect(stats.daysPlayed).toBe(3)
    expect(stats.bestScore).toBe(912)
    expect(stats.bestDay).toBe('2026-11-17')
    expect(stats.averageScore).toBe(507) // (610 + 0 + 912) / 3 = 507.33
  })

  it('ignores rows without a real day', () => {
    const stats = computeDailyStats([
      row('not-a-day', 999),
      row('2026-02-30', 999),
      row('2026-11-20', 500),
    ], at(2026, 11, 21))
    expect(stats.daysPlayed).toBe(1)
    expect(stats.bestScore).toBe(500)
  })

  it('counts medals and top-three finishes', () => {
    const stats = computeDailyStats([
      row('2026-11-17', 900, 1),
      row('2026-11-16', 800, 2),
      row('2026-11-15', 700, 3),
      row('2026-11-14', 600, 1),
      row('2026-11-13', 500, 0),
      row('2026-11-12', 400, 9),
    ], at(2026, 11, 21))
    expect(stats.medals).toEqual({ gold: 2, silver: 1, bronze: 1 })
    expect(stats.topThree).toBe(4)
  })

  it('keeps a streak across a month boundary and counts it when the last day is today', () => {
    const stats = computeDailyStats([
      row('2026-01-30'),
      row('2026-01-31'),
      row('2026-02-01'),
    ], at(2026, 2, 1))
    expect(stats.currentStreak).toBe(3)
    expect(stats.longestStreak).toBe(3)
  })

  it('keeps a streak across a year boundary', () => {
    const stats = computeDailyStats([
      row('2025-12-30'),
      row('2025-12-31'),
      row('2026-01-01'),
      row('2026-01-02'),
    ], at(2026, 1, 2))
    expect(stats.currentStreak).toBe(4)
    expect(stats.longestStreak).toBe(4)
  })

  it('counts the current streak from yesterday, because today may not have happened yet', () => {
    const stats = computeDailyStats([
      row('2026-11-17'),
      row('2026-11-18'),
      row('2026-11-19'),
    ], at(2026, 11, 20))
    expect(stats.currentStreak).toBe(3)
    expect(stats.longestStreak).toBe(3)
  })

  it('drops the current streak once the last day is two days old, but remembers the longest', () => {
    const stats = computeDailyStats([
      row('2026-11-10'),
      row('2026-11-11'),
      row('2026-11-12'),
      row('2026-11-13'),
      row('2026-11-18'),
    ], at(2026, 11, 21))
    expect(stats.currentStreak).toBe(0)
    expect(stats.longestStreak).toBe(4)
  })

  it('measures a gap in the middle and a later, shorter run', () => {
    const stats = computeDailyStats([
      row('2026-11-01'),
      row('2026-11-02'),
      row('2026-11-03'),
      // gap
      row('2026-11-19'),
      row('2026-11-20'),
    ], at(2026, 11, 21))
    expect(stats.longestStreak).toBe(3)
    expect(stats.currentStreak).toBe(2) // yesterday + the day before
  })

  it('has a current streak of one for a single day today', () => {
    const stats = computeDailyStats([row('2026-11-21')], at(2026, 11, 21, 23))
    expect(stats.daysPlayed).toBe(1)
    expect(stats.currentStreak).toBe(1)
    expect(stats.longestStreak).toBe(1)
  })

  it('has no current streak when the only day was two days ago', () => {
    const stats = computeDailyStats([row('2026-11-18')], at(2026, 11, 21))
    expect(stats.currentStreak).toBe(0)
    expect(stats.longestStreak).toBe(1)
  })
})

describe('toPartyStats', () => {
  it('reads stored counters and treats missing or bad values as zero', () => {
    expect(toPartyStats(null)).toMatchObject({ partyRounds: 0, partyGuessed: 0, teamWins: 0, gamesHosted: 0 })
    expect(toPartyStats({
      partyRounds: 12,
      partyGuessed: 7,
      teamWins: 3,
      gamesHosted: 2,
      pixelsPainted: 400,
      updatedAt: 1_700_000_000_000,
    })).toEqual({
      partyRounds: 12,
      partyGuessed: 7,
      teamWins: 3,
      gamesHosted: 2,
      pixelsPainted: 400,
      updatedAt: 1_700_000_000_000,
    })
    expect(toPartyStats({ partyRounds: -4, teamWins: 'lots' })).toMatchObject({ partyRounds: 0, teamWins: 0 })
  })
})
