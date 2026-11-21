import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker.js'
import { memoryTools } from './room-test-tools'

vi.mock('./server-tools', () => ({ createServerTools: vi.fn() }))
vi.mock('./usernames', () => ({ getUsername: vi.fn() }))

import { createServerTools } from './server-tools'
import { getUsername } from './usernames'
import { loadPlayerStats } from './stats-routes'

const env = {} as Env

function dailyRow(day: string, score: number, extra: Record<string, unknown> = {}) {
  return { day, userId: 'alice', displayName: 'Alice', avatarUrl: '', score, medal: 0, ...extra }
}

describe('loadPlayerStats', () => {
  it('merges the computed daily stats, the stored party stats and the chosen username', async () => {
    const records = memoryTools()
    records.rows('dailyScores').set('d1', dailyRow('2026-11-17', 912, { medal: 1 }))
    records.rows('dailyScores').set('d2', dailyRow('2026-11-18', 600, { medal: 2 }))
    records.rows('playerStats').set('alice', {
      userId: 'alice', partyRounds: 9, partyGuessed: 4, teamWins: 2, gamesHosted: 3, pixelsPainted: 0, updatedAt: 5,
    })
    vi.mocked(createServerTools).mockReturnValue(records.tools)
    vi.mocked(getUsername).mockResolvedValue('Will')

    const stats = await loadPlayerStats(env, 'alice')

    expect(stats.userId).toBe('alice')
    expect(stats.name).toBe('Will')
    expect(stats.daily).toMatchObject({
      daysPlayed: 2,
      bestScore: 912,
      bestDay: '2026-11-17',
      averageScore: 756,
      medals: { gold: 1, silver: 1, bronze: 0 },
      topThree: 2,
    })
    expect(stats.party).toMatchObject({ partyRounds: 9, partyGuessed: 4, teamWins: 2, gamesHosted: 3 })
  })

  it('falls back to the latest score row name and avatar, with zero counts for a new player', async () => {
    const records = memoryTools()
    records.rows('dailyScores').set('old', dailyRow('2026-11-16', 400, { displayName: 'Old name' }))
    records.rows('dailyScores').set('new', dailyRow('2026-11-18', 700, { displayName: 'Alice', avatarUrl: 'alice.png' }))
    vi.mocked(createServerTools).mockReturnValue(records.tools)
    vi.mocked(getUsername).mockResolvedValue(null)

    const stats = await loadPlayerStats(env, 'alice')

    expect(stats.name).toBe('Alice')
    expect(stats.avatarUrl).toBe('alice.png')
    expect(stats.daily.daysPlayed).toBe(2)
    expect(stats.party).toMatchObject({ partyRounds: 0, partyGuessed: 0, teamWins: 0, gamesHosted: 0 })
  })

  it('returns Player when nothing names the player', async () => {
    const records = memoryTools()
    vi.mocked(createServerTools).mockReturnValue(records.tools)
    vi.mocked(getUsername).mockResolvedValue(null)

    const stats = await loadPlayerStats(env, 'nobody')

    expect(stats).toMatchObject({ name: 'Player', avatarUrl: '' })
    expect(stats.daily.daysPlayed).toBe(0)
    expect(stats.daily.bestDay).toBeNull()
  })
})
