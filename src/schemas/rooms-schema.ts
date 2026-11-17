import type { CollectionSchema } from 'deepspace/schema'
import { roomAccessColumns, roomReadAccess } from './game-permissions'

export const roomsSchema: CollectionSchema = {
  name: 'rooms',
  ...roomReadAccess,
  uniqueOn: ['joinCode'],
  columns: [
    ...roomAccessColumns,
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: 40 },
    { name: 'mode', storage: 'text', interpretation: { kind: 'select', options: ['coop', 'team'] } },
    { name: 'joinCode', storage: 'text', interpretation: 'plain', required: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['lobby', 'playing', 'intermission', 'paused', 'closed'] } },
    { name: 'currentRoundId', storage: 'text', interpretation: 'plain' },
    { name: 'playerCount', storage: 'number', interpretation: 'plain' },
    { name: 'lastActiveAt', storage: 'number', interpretation: { kind: 'datetime' } },
    { name: 'isDefaultBoard', storage: 'number', interpretation: { kind: 'boolean' } },
  ],
}
