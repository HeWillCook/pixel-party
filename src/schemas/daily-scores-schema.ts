import type { CollectionSchema } from 'deepspace/schema'
import { serverWrittenPermissions } from './game-permissions'

export const dailyScoresSchema: CollectionSchema = {
  name: 'dailyScores',
  uniqueOn: ['day', 'userId'],
  permissions: serverWrittenPermissions(true),
  columns: [
    ...['day', 'userId', 'displayName', 'avatarUrl'].map(name => ({ name, storage: 'text' as const, interpretation: 'plain' as const })),
    // matchPoints + qualityBonus add up to score; match/quality/recognition are the raw judge percents.
    ...['score', 'match', 'quality', 'matchPoints', 'qualityBonus', 'recognition', 'startedAt', 'ended', 'medal'].map(name => ({ name, storage: 'number' as const, interpretation: 'plain' as const })),
  ],
}
