import type { CollectionSchema } from 'deepspace/schema'
import { serverWrittenPermissions } from './game-permissions'

/**
 * Party counters per player, written only by the server at round end
 * (`src/server/player-stats.ts`). Daily numbers are not stored here: they are
 * computed from the existing `dailyScores` rows, so a day's score has exactly
 * one source of truth.
 *
 * Reads are public (the same as scores and galleries); every write is
 * server-only, and `lastRoundKey` makes a repeated round-end hook for the same
 * room and round a no-op instead of a second increment.
 */
export const playerStatsSchema: CollectionSchema = {
  name: 'playerStats',
  uniqueOn: ['userId'],
  permissions: serverWrittenPermissions(true),
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    ...['partyRounds', 'partyGuessed', 'teamWins', 'gamesHosted', 'pixelsPainted', 'updatedAt'].map(name => ({
      name,
      storage: 'number' as const,
      interpretation: 'plain' as const,
    })),
    { name: 'lastRoundKey', storage: 'text', interpretation: 'plain' },
  ],
}
