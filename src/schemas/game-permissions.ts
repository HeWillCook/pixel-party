import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

export function serverWrittenPermissions(read: RolePermissions['read']): CollectionSchema['permissions'] {
  return Object.fromEntries(['*', 'viewer', 'member', 'admin'].map(role => [role, { read, create: false, update: false, delete: false }]))
}

export const roomReadAccess = {
  ownerField: 'hostId',
  collaboratorsField: 'memberIds',
  visibilityField: 'visibility',
  permissions: serverWrittenPermissions('shared'),
}

export const roomAccessColumns: CollectionSchema['columns'] = [
  { name: 'hostId', storage: 'text', interpretation: 'plain' },
  { name: 'memberIds', storage: 'text', interpretation: { kind: 'json' } },
  { name: 'visibility', storage: 'text', interpretation: { kind: 'select', options: ['public', 'private'] } },
]
