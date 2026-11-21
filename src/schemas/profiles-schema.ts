import type { CollectionSchema } from 'deepspace/schema'
import { serverWrittenPermissions } from './game-permissions'

/**
 * A player's Pixle identity: the username they chose, and whether they finished
 * the first-sign-in tour.
 *
 * `usernameKey` is the lowercase uniqueness key (see `src/game/username.ts`),
 * so `Will` and `will` collide. The schema's `uniqueOn` creates a real SQLite
 * UNIQUE index on it, and RecordRoom re-checks the constraint before every
 * insert/update inside the single Durable Object that serializes all writes:
 * two simultaneous claims therefore resolve to exactly one winner.
 *
 * Reads are public (a name is what leaderboards, rosters and galleries show);
 * every write is server-only and goes through `/api/profile`, which validates
 * the caller, the name, uniqueness and the change limit.
 */
export const profilesSchema: CollectionSchema = {
  name: 'profiles',
  uniqueOn: ['usernameKey'],
  permissions: serverWrittenPermissions(true),
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'username', storage: 'text', interpretation: 'plain', required: true, maxLength: 32 },
    { name: 'usernameKey', storage: 'text', interpretation: 'plain', required: true, maxLength: 32 },
    { name: 'onboardedAt', storage: 'number', interpretation: 'plain' },
    { name: 'usernameChangedAt', storage: 'number', interpretation: 'plain' },
  ],
}
