/**
 * Server-side usernames and profiles.
 *
 * Trust model: the routes in `profile-routes.ts` derive the caller from a
 * verified JWT. This module then runs RBAC-off record tools (see
 * `action-routes.ts` for that warning) and enforces the policy itself.
 *
 * Uniqueness is enforced twice, on purpose:
 *   1. a query for the lowercase `usernameKey` gives the friendly "taken"
 *      answer before anything is written; and
 *   2. the `profiles` schema declares `uniqueOn: ['usernameKey']`, so the
 *      RecordRoom's SQLite table carries a real UNIQUE index and its own
 *      check-then-insert runs inside the single Durable Object that serializes
 *      every record write. Two requests claiming the same name at the same
 *      moment therefore reach the same DO one after the other: exactly one
 *      INSERT/UPDATE succeeds and the other gets the duplicate error mapped to
 *      `taken` below.
 */

import { USERNAME_MESSAGES, normalizeUsernameKey, validateUsername } from '../game/username'
import type { ProfileSaveResult, ProfileView, UsernameAvailability } from '../game/profile'
import type { ServerTools } from './server-tools'
import { createServerTools } from './server-tools'
import type { Env } from '../../worker.js'

export const PROFILES_COLLECTION = 'profiles'
/** A username may change once per day; the first set is always allowed. */
export const USERNAME_CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000
const CACHE_TTL_MS = 60_000

interface StoredProfile {
  recordId: string
  profile: ProfileView
}

const usernameCache = new Map<string, { username: string | null; at: number }>()

/** Drop the isolate-local username cache (all users, or one). Used by writes and tests. */
export function clearUsernameCache(userId?: string): void {
  if (userId === undefined) usernameCache.clear()
  else usernameCache.delete(userId)
}

/** Cache a name this isolate just wrote, so the next read does not need the DO. */
export function rememberUsername(userId: string, username: string): void {
  usernameCache.set(userId, { username, at: Date.now() })
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toProfile(recordId: string, data: Record<string, unknown>): ProfileView | null {
  if (typeof data.userId !== 'string' || typeof data.username !== 'string') return null
  return {
    userId: data.userId,
    username: data.username,
    onboardedAt: numberOrZero(data.onboardedAt),
    usernameChangedAt: numberOrZero(data.usernameChangedAt),
  }
}

/** Read a profile straight from the record store (no cache). */
export async function readProfile(tools: ServerTools, userId: string): Promise<StoredProfile | null> {
  const result = await tools.query<Record<string, unknown>>(PROFILES_COLLECTION, { where: { userId }, limit: 1 })
  if (!result.success) throw new Error(result.error)
  const record = result.data.records[0]
  if (!record) return null
  const profile = toProfile(record.recordId, record.data)
  return profile ? { recordId: record.recordId, profile } : null
}

/** Whether `raw` can be claimed by `userId` right now. Never throws for a bad name. */
export async function usernameAvailability(tools: ServerTools, userId: string, raw: unknown): Promise<UsernameAvailability> {
  const check = validateUsername(raw)
  if (!check.ok) return { available: false, code: check.code, message: check.message }
  const found = await tools.query<Record<string, unknown>>(PROFILES_COLLECTION, { where: { usernameKey: check.key }, limit: 1 })
  if (!found.success) throw new Error(found.error)
  const owner = found.data.records[0]?.data.userId
  if (typeof owner === 'string' && owner !== userId) {
    return { available: false, code: 'taken', message: USERNAME_MESSAGES.taken }
  }
  return { available: true }
}

/**
 * Set (or change) the caller's username. The first set is always allowed; a
 * later change is limited to one per 24 hours, measured on `usernameChangedAt`
 * written by the server. Re-submitting the exact current name is a no-op.
 */
export async function saveUsername(
  tools: ServerTools,
  userId: string,
  raw: unknown,
  now = Date.now(),
): Promise<ProfileSaveResult> {
  const check = validateUsername(raw)
  if (!check.ok) return { ok: false, code: check.code, message: check.message }

  const existing = await readProfile(tools, userId)
  if (existing?.profile.username === check.username) {
    return { ok: true, profile: existing.profile }
  }
  if (existing && existing.profile.usernameChangedAt > 0 && now < existing.profile.usernameChangedAt + USERNAME_CHANGE_WINDOW_MS) {
    return { ok: false, code: 'rate_limited', message: USERNAME_MESSAGES.rate_limited }
  }

  // Fast, friendly check. The unique index below is the real guarantee: this
  // query and the write are separate round trips, so another isolate can slip
  // between them. RecordRoom re-checks `uniqueOn` inside the DO on write.
  const taken = await tools.query<Record<string, unknown>>(PROFILES_COLLECTION, { where: { usernameKey: check.key }, limit: 1 })
  if (!taken.success) throw new Error(taken.error)
  const owner = taken.data.records[0]?.data.userId
  if (typeof owner === 'string' && owner !== userId) {
    return { ok: false, code: 'taken', message: USERNAME_MESSAGES.taken }
  }

  const data = { userId, username: check.username, usernameKey: check.key, usernameChangedAt: now }
  const written = existing
    ? await tools.update(PROFILES_COLLECTION, existing.recordId, data)
    : await tools.create(PROFILES_COLLECTION, { ...data, onboardedAt: 0 })
  if (!written.success) {
    // The unique index's error (or RecordRoom's pre-check) loses the race.
    if (/duplicate|unique/i.test(written.error ?? '')) {
      return { ok: false, code: 'taken', message: USERNAME_MESSAGES.taken }
    }
    throw new Error(written.error)
  }

  const profile: ProfileView = {
    userId,
    username: check.username,
    onboardedAt: existing?.profile.onboardedAt ?? 0,
    usernameChangedAt: now,
  }
  // Any caller in this isolate (including one that did not go through the
  // route, such as a future server action) sees the new name immediately.
  rememberUsername(userId, check.username)
  return { ok: true, profile }
}

/** Mark the first-sign-in tour finished or skipped. Idempotent. */
export async function markOnboarded(tools: ServerTools, userId: string, now = Date.now()): Promise<ProfileSaveResult> {
  const existing = await readProfile(tools, userId)
  if (!existing) return { ok: false, code: 'no_profile', message: USERNAME_MESSAGES.no_profile }
  if (existing.profile.onboardedAt > 0) return { ok: true, profile: existing.profile }

  const written = await tools.update(PROFILES_COLLECTION, existing.recordId, { onboardedAt: now })
  if (!written.success) throw new Error(written.error)
  return { ok: true, profile: { ...existing.profile, onboardedAt: now } }
}

/** A player's profile, uncached. */
export async function getProfile(env: Env, userId: string): Promise<ProfileView | null> {
  try {
    return (await readProfile(createServerTools(env), userId))?.profile ?? null
  } catch {
    return null
  }
}

/**
 * The username other code should display, for any player.
 *
 * Isolate-local cache with a short TTL: the daily score projection and other
 * server writers can call this per attempt without a DO read every time. A
 * write in this isolate refreshes it (`rememberUsername`); another isolate's
 * write is reflected within the TTL.
 */
export async function getUsername(env: Env, userId: string): Promise<string | null> {
  const cached = usernameCache.get(userId)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.username
  try {
    const profile = (await readProfile(createServerTools(env), userId))?.profile ?? null
    const username = profile?.username ?? null
    usernameCache.set(userId, { username, at: Date.now() })
    return username
  } catch {
    // A record-store hiccup must not break a caller's primary work: the cached
    // value (if any) stays; otherwise the caller falls back to its own default.
    return cached?.username ?? null
  }
}

/** The case-insensitive key the unique index stores. Re-exported for callers. */
export { normalizeUsernameKey }
