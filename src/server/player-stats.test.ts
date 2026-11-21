import { describe, expect, it } from 'vitest'
import { memoryTools } from './room-test-tools'
import { playerStatsSchema } from '../schemas/player-stats-schema'
import { recordPartyRoundWithTools, type PartyRoundInput } from './player-stats'

const base: PartyRoundInput = {
  roomId: 'room-1',
  roundId: 'round-1',
  mode: 'coop',
  contributorIds: ['alice', 'bob'],
  outcome: 'won',
  hostId: 'alice',
}

const stats = (records: ReturnType<typeof memoryTools>, userId: string) => records.rows('playerStats').get(userId)

describe('playerStats schema', () => {
  it('is read-public, server-write-only and unique per player', () => {
    expect(playerStatsSchema.name).toBe('playerStats')
    expect(playerStatsSchema.uniqueOn).toEqual(['userId'])
    for (const role of ['*', 'viewer', 'member', 'admin']) {
      expect(playerStatsSchema.permissions[role]).toMatchObject({ read: true, create: false, update: false, delete: false })
    }
    expect(playerStatsSchema.columns.map(column => column.name)).toEqual([
      'userId', 'partyRounds', 'partyGuessed', 'teamWins', 'gamesHosted', 'pixelsPainted', 'updatedAt', 'lastRoundKey',
    ])
  })
})

describe('recordPartyRound', () => {
  it('counts a co-op win for each contributor and the host', async () => {
    const records = memoryTools()
    expect(await recordPartyRoundWithTools(records.tools, base, 1_000)).toEqual({ updated: 2, skipped: 0 })

    expect(stats(records, 'alice')).toMatchObject({
      userId: 'alice',
      partyRounds: 1,
      partyGuessed: 1,
      teamWins: 0,
      gamesHosted: 1,
      lastRoundKey: 'room-1:round-1',
      updatedAt: 1_000,
    })
    expect(stats(records, 'bob')).toMatchObject({
      userId: 'bob',
      partyRounds: 1,
      partyGuessed: 1,
      teamWins: 0,
      gamesHosted: 0,
    })
  })

  it('counts a co-op timeout as a round but not a guess', async () => {
    const records = memoryTools()
    await recordPartyRoundWithTools(records.tools, { ...base, outcome: 'timeout' }, 1_000)
    expect(stats(records, 'alice')).toMatchObject({ partyRounds: 1, partyGuessed: 0 })
  })

  it('does not count a guess in team mode, even on a win', async () => {
    const records = memoryTools()
    await recordPartyRoundWithTools(records.tools, { ...base, mode: 'team', outcome: 'teamWin', winningTeamUserIds: ['bob'] }, 1_000)
    expect(stats(records, 'alice')).toMatchObject({ partyRounds: 1, partyGuessed: 0, teamWins: 0 })
    expect(stats(records, 'bob')).toMatchObject({ partyRounds: 1, partyGuessed: 0, teamWins: 1 })
  })

  it('counts the host once even when they did not paint', async () => {
    const records = memoryTools()
    await recordPartyRoundWithTools(records.tools, { ...base, contributorIds: ['bob'], hostId: 'carol' }, 1_000)
    expect(stats(records, 'carol')).toMatchObject({
      partyRounds: 0,
      gamesHosted: 1,
      lastRoundKey: 'room-1:round-1',
    })
    expect(stats(records, 'bob')).toMatchObject({ partyRounds: 1, gamesHosted: 0 })
  })

  it('is idempotent for the same room and round', async () => {
    const records = memoryTools()
    await recordPartyRoundWithTools(records.tools, base, 1_000)
    expect(await recordPartyRoundWithTools(records.tools, base, 2_000)).toEqual({ updated: 0, skipped: 2 })
    expect(stats(records, 'alice')).toMatchObject({ partyRounds: 1, partyGuessed: 1, gamesHosted: 1, updatedAt: 1_000 })
  })

  it('counts a later round on top of the earlier ones', async () => {
    const records = memoryTools()
    await recordPartyRoundWithTools(records.tools, base, 1_000)
    await recordPartyRoundWithTools(records.tools, { ...base, roundId: 'round-2' }, 2_000)
    expect(stats(records, 'alice')).toMatchObject({
      partyRounds: 2,
      partyGuessed: 2,
      gamesHosted: 2,
      lastRoundKey: 'room-1:round-2',
      updatedAt: 2_000,
    })
  })

  it('ignores anonymous ids, duplicates and blank ids', async () => {
    const records = memoryTools()
    await recordPartyRoundWithTools(records.tools, {
      ...base,
      contributorIds: ['alice', 'alice', 'anon-123', '', 'bob'],
      hostId: 'anon-999',
    }, 1_000)
    expect([...records.rows('playerStats').keys()].sort()).toEqual(['alice', 'bob'])
    expect(stats(records, 'alice')).toMatchObject({ partyRounds: 1, gamesHosted: 0 })
  })

  it('writes nothing when there is nobody signed in', async () => {
    const records = memoryTools()
    expect(await recordPartyRoundWithTools(records.tools, { ...base, contributorIds: ['anon-1'], hostId: undefined }, 1_000))
      .toEqual({ updated: 0, skipped: 0 })
    expect(records.rows('playerStats').size).toBe(0)
  })

  it('refuses a round without an idempotency key', async () => {
    const records = memoryTools()
    await expect(recordPartyRoundWithTools(records.tools, { ...base, roundId: '  ' })).rejects.toThrow(/roundId/)
    await expect(recordPartyRoundWithTools(records.tools, { ...base, roomId: '' })).rejects.toThrow(/roomId/)
  })
})
