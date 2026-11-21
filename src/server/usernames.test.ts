import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker.js'
import { profilesSchema } from '../schemas/profiles-schema'
import type { ServerTools } from './server-tools'
import { memoryTools } from './room-test-tools'
import {
  USERNAME_CHANGE_WINDOW_MS,
  clearUsernameCache,
  getUsername,
  markOnboarded,
  readProfile,
  saveUsername,
  usernameAvailability,
} from './usernames'

vi.mock('./server-tools', () => ({ createServerTools: vi.fn() }))
import { createServerTools } from './server-tools'

/**
 * A RecordRoom stand-in with the one property the real DO provides for this
 * feature: a UNIQUE index on `profiles.usernameKey`. Without it the fake would
 * let two concurrent claims both succeed and the race test would be meaningless.
 */
function uniqueProfileTools() {
  const base = memoryTools()
  const conflict = (collection: string, key: unknown, exceptRecordId?: string) => {
    if (collection !== 'profiles' || typeof key !== 'string') return false
    for (const [recordId, row] of base.rows('profiles')) {
      if (recordId !== exceptRecordId && row.usernameKey === key) return true
    }
    return false
  }
  const create = vi.fn(async (collection: string, data: Record<string, unknown>, recordId = crypto.randomUUID()) => {
    if (conflict(collection, data.usernameKey)) {
      return { success: false as const, error: `Duplicate: a record with usernameKey=${String(data.usernameKey)} already exists in profiles` }
    }
    return base.create(collection, data, recordId)
  })
  const update = vi.fn(async (collection: string, recordId: string, data: Record<string, unknown>) => {
    const merged = { ...base.rows(collection).get(recordId), ...data }
    if (conflict(collection, merged.usernameKey, recordId)) {
      return { success: false as const, error: `Duplicate: a record with usernameKey=${String(merged.usernameKey)} already exists in profiles` }
    }
    return base.update(collection, recordId, data)
  })
  const tools = { ...base.tools, create, update } as unknown as ServerTools
  return { ...base, tools, create, update }
}

describe('profiles schema', () => {
  it('makes the normalized username key unique at the database level', () => {
    expect(profilesSchema.uniqueOn).toEqual(['usernameKey'])
    expect(profilesSchema.columns.map((column) => column.name)).toContain('usernameKey')
  })

  it('is read-public and server-write-only', () => {
    for (const role of ['*', 'viewer', 'member', 'admin']) {
      expect(profilesSchema.permissions[role]).toMatchObject({ read: true, create: false, update: false, delete: false })
    }
  })
})

describe('saveUsername', () => {
  it('creates the first profile, storing the name as typed and a lowercase key', async () => {
    const { tools } = uniqueProfileTools()
    const result = await saveUsername(tools, 'alice', '  Will  ', 1_000)
    expect(result).toEqual({
      ok: true,
      profile: { userId: 'alice', username: 'Will', onboardedAt: 0, usernameChangedAt: 1_000 },
    })
    const stored = await readProfile(tools, 'alice')
    expect(stored?.profile).toMatchObject({ username: 'Will', onboardedAt: 0 })
    expect(tools.create).toHaveBeenCalledWith('profiles', expect.objectContaining({ usernameKey: 'will', userId: 'alice' }))
  })

  it('rejects an invalid name with its specific code', async () => {
    const { tools } = uniqueProfileTools()
    await expect(saveUsername(tools, 'alice', 'ab')).resolves.toMatchObject({ ok: false, code: 'too_short' })
    await expect(saveUsername(tools, 'alice', 'Will Cook')).resolves.toMatchObject({ ok: false, code: 'invalid_chars' })
    await expect(saveUsername(tools, 'alice', 'admin')).resolves.toMatchObject({ ok: false, code: 'reserved' })
    await expect(saveUsername(tools, 'alice', 'sh1t')).resolves.toMatchObject({ ok: false, code: 'profane' })
    expect(tools.create).not.toHaveBeenCalled()
  })

  it('enforces case-insensitive uniqueness across users', async () => {
    const { tools } = uniqueProfileTools()
    expect(await saveUsername(tools, 'alice', 'Will', 1_000)).toMatchObject({ ok: true })
    expect(await saveUsername(tools, 'bob', 'wILL', 2_000)).toEqual({
      ok: false, code: 'taken', message: "That name's taken",
    })
  })

  it('lets exactly one of two simultaneous claims win', async () => {
    const { tools } = uniqueProfileTools()
    const results = await Promise.all([
      saveUsername(tools, 'alice', 'SameName', 1_000),
      saveUsername(tools, 'bob', 'samename', 1_000),
    ])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, code: 'taken', message: "That name's taken" },
    ])
  })

  it('maps a database duplicate error (a lost pre-check race) to taken', async () => {
    const base = memoryTools()
    const tools = {
      ...base.tools,
      create: vi.fn(async () => ({ success: false as const, error: 'Duplicate: a record with usernameKey=will already exists in profiles' })),
    } as unknown as ServerTools
    expect(await saveUsername(tools, 'bob', 'Will', 1_000)).toEqual({
      ok: false, code: 'taken', message: "That name's taken",
    })
  })

  it('always allows the first set, then limits changes to once per 24 hours', async () => {
    const { tools } = uniqueProfileTools()
    const start = 10_000_000
    expect(await saveUsername(tools, 'alice', 'First', start)).toMatchObject({ ok: true })
    expect(await saveUsername(tools, 'alice', 'Second', start + USERNAME_CHANGE_WINDOW_MS - 1)).toEqual({
      ok: false, code: 'rate_limited', message: 'You can change your username once a day',
    })
    expect(await saveUsername(tools, 'alice', 'Second', start + USERNAME_CHANGE_WINDOW_MS)).toMatchObject({
      ok: true,
      profile: { username: 'Second', usernameChangedAt: start + USERNAME_CHANGE_WINDOW_MS },
    })
  })

  it('treats re-submitting the exact current name as a free no-op', async () => {
    const { tools, update } = uniqueProfileTools()
    await saveUsername(tools, 'alice', 'Will', 1_000)
    update.mockClear()
    expect(await saveUsername(tools, 'alice', 'Will', 2_000)).toMatchObject({ ok: true, profile: { username: 'Will' } })
    expect(update).not.toHaveBeenCalled()
  })

  it('allows a case-only change after the change window and keeps it unique', async () => {
    const { tools } = uniqueProfileTools()
    const start = 5_000
    await saveUsername(tools, 'alice', 'Will', start)
    expect(await saveUsername(tools, 'alice', 'WILL', start + 1)).toMatchObject({ ok: false, code: 'rate_limited' })
    expect(await saveUsername(tools, 'alice', 'WILL', start + USERNAME_CHANGE_WINDOW_MS)).toMatchObject({
      ok: true, profile: { username: 'WILL' },
    })
  })
})

describe('usernameAvailability', () => {
  it('reports validation errors without touching the store', async () => {
    const { tools, query } = uniqueProfileTools()
    expect(await usernameAvailability(tools, 'alice', 'ab')).toMatchObject({ available: false, code: 'too_short' })
    expect(query).not.toHaveBeenCalled()
  })

  it('reports another player\'s name as taken and your own as available', async () => {
    const { tools } = uniqueProfileTools()
    await saveUsername(tools, 'alice', 'Will', 1_000)
    expect(await usernameAvailability(tools, 'bob', 'WILL')).toEqual({
      available: false, code: 'taken', message: "That name's taken",
    })
    expect(await usernameAvailability(tools, 'alice', 'will')).toEqual({ available: true })
  })
})

describe('getUsername', () => {
  it('reads once and serves the isolate cache afterwards', async () => {
    const { tools } = uniqueProfileTools()
    await saveUsername(tools, 'cacher', 'Cached', 1_000)
    clearUsernameCache()
    vi.mocked(createServerTools).mockReset()
    vi.mocked(createServerTools).mockReturnValue(tools)

    expect(await getUsername({} as Env, 'cacher')).toBe('Cached')
    expect(await getUsername({} as Env, 'cacher')).toBe('Cached')
    expect(createServerTools).toHaveBeenCalledTimes(1)
  })

  it('returns null for a player with no profile, and does not throw', async () => {
    const { tools } = uniqueProfileTools()
    clearUsernameCache()
    vi.mocked(createServerTools).mockReturnValue(tools)
    expect(await getUsername({} as Env, 'nobody')).toBeNull()
  })

  it('a write in this isolate refreshes the cached name', async () => {
    const { tools } = uniqueProfileTools()
    clearUsernameCache()
    vi.mocked(createServerTools).mockReturnValue(tools)
    await saveUsername(tools, 'fresh', 'Before', 1_000)
    clearUsernameCache()
    expect(await getUsername({} as Env, 'fresh')).toBe('Before')
    await saveUsername(tools, 'fresh', 'After', 1_000 + USERNAME_CHANGE_WINDOW_MS)
    expect(await getUsername({} as Env, 'fresh')).toBe('After')
  })
})

describe('markOnboarded', () => {
  it('needs a profile', async () => {
    const { tools } = uniqueProfileTools()
    expect(await markOnboarded(tools, 'alice', 1_000)).toMatchObject({ ok: false, code: 'no_profile' })
  })

  it('sets the timestamp once and stays idempotent', async () => {
    const { tools } = uniqueProfileTools()
    await saveUsername(tools, 'alice', 'Will', 1_000)
    expect(await markOnboarded(tools, 'alice', 2_000)).toMatchObject({ ok: true, profile: { onboardedAt: 2_000 } })
    expect(await markOnboarded(tools, 'alice', 3_000)).toMatchObject({ ok: true, profile: { onboardedAt: 2_000 } })
    expect((await readProfile(tools, 'alice'))?.profile.onboardedAt).toBe(2_000)
  })

  it('keeps the username when onboarding finishes', async () => {
    const { tools } = uniqueProfileTools()
    await saveUsername(tools, 'alice', 'Will', 1_000)
    expect(await markOnboarded(tools, 'alice', 2_000)).toMatchObject({
      ok: true, profile: { userId: 'alice', username: 'Will', usernameChangedAt: 1_000, onboardedAt: 2_000 },
    })
  })
})
