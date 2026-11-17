import type { CollectionSchema } from 'deepspace/schema'
import { roomAccessColumns, roomReadAccess } from './game-permissions'

export const teamMembersSchema: CollectionSchema = {
  name: 'teamMembers',
  ...roomReadAccess,
  uniqueOn: ['roomId', 'userId'],
  columns: [
    ...roomAccessColumns,
    { name: 'roomId', storage: 'text', interpretation: 'plain' },
    { name: 'userId', storage: 'text', interpretation: 'plain' },
    { name: 'team', storage: 'text', interpretation: { kind: 'select', options: ['red', 'blue'] } },
  ],
}
