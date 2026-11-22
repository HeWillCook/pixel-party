/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { roomsSchema } from './schemas/rooms-schema'
import { roundsSchema } from './schemas/rounds-schema'
import { teamMembersSchema } from './schemas/team-members-schema'
import { dailyScoresSchema } from './schemas/daily-scores-schema'
import { dailyDrawingsSchema } from './schemas/daily-drawings-schema'
import { profilesSchema } from './schemas/profiles-schema'
import { playerStatsSchema } from './schemas/player-stats-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  roomsSchema,
  roundsSchema,
  teamMembersSchema,
  dailyScoresSchema,
  dailyDrawingsSchema,
  profilesSchema,
  playerStatsSchema,
]
