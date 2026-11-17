import type { CollectionSchema } from 'deepspace/schema'
import { roomAccessColumns, roomReadAccess } from './game-permissions'

export const roundsSchema: CollectionSchema = {
  name: 'rounds',
  ...roomReadAccess,
  uniqueOn: ['roomId', 'roundId'],
  columns: [
    ...roomAccessColumns,
    { name: 'roomId', storage: 'text', interpretation: 'plain' },
    { name: 'roundId', storage: 'text', interpretation: 'plain' },
    { name: 'mode', storage: 'text', interpretation: { kind: 'select', options: ['coop', 'team'] } },
    { name: 'word', storage: 'text', interpretation: 'plain' },
    { name: 'startedAt', storage: 'number', interpretation: { kind: 'datetime' } },
    { name: 'endedAt', storage: 'number', interpretation: { kind: 'datetime' } },
    { name: 'outcome', storage: 'text', interpretation: { kind: 'select', options: ['won', 'timeout', 'teamWin'] } },
    { name: 'winningTeam', storage: 'text', interpretation: { kind: 'select', options: ['red', 'blue', 'draw'] } },
    { name: 'pixelsUsed', storage: 'number', interpretation: 'plain' },
    { name: 'durationMs', storage: 'number', interpretation: 'plain' },
    { name: 'score', storage: 'number', interpretation: 'plain' },
    { name: 'contributorIds', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'finalGuesses', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'snapshotFileIds', storage: 'text', interpretation: { kind: 'json' } },
  ],
}
