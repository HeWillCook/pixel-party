import type { CollectionSchema } from 'deepspace/schema'
import { serverWrittenPermissions } from './game-permissions'

export const dailyDrawingsSchema: CollectionSchema = {
  name: 'dailyDrawings',
  uniqueOn: ['day', 'userId'],
  ownerField: 'userId',
  visibilityField: 'visibility',
  permissions: serverWrittenPermissions('shared'),
  columns: [
    ...['day', 'userId', 'displayName', 'prompt', 'cells', 'guess', 'reason'].map(name => ({ name, storage: 'text' as const, interpretation: 'plain' as const })),
    { name: 'score', storage: 'number', interpretation: 'plain' },
    { name: 'visibility', storage: 'text', interpretation: { kind: 'select', options: ['public', 'private'] }, default: 'private' },
  ],
}
