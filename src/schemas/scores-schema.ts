import type { CollectionSchema } from 'deepspace/schema'
import { serverWrittenPermissions } from './game-permissions'

export const scoresSchema: CollectionSchema = {
  name: 'scores',
  uniqueOn: ['userId'],
  permissions: serverWrittenPermissions(true),
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain' },
    { name: 'totalPoints', storage: 'number', interpretation: 'plain' },
    { name: 'roundsWon', storage: 'number', interpretation: 'plain' },
  ],
}
