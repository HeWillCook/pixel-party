import type { CollectionSchema } from 'deepspace/schema'
import { serverWrittenPermissions } from './game-permissions'

export const dailyScoresSchema: CollectionSchema = {
  name: 'dailyScores',
  uniqueOn: ['day', 'userId'],
  permissions: serverWrittenPermissions(true),
  columns: [
    ...['day', 'userId', 'displayName', 'avatarUrl'].map(name => ({ name, storage: 'text' as const, interpretation: 'plain' as const })),
    ...['score', 'fit', 'recognition', 'speed', 'bestElapsedMs', 'ended', 'medal'].map(name => ({ name, storage: 'number' as const, interpretation: 'plain' as const })),
  ],
}
