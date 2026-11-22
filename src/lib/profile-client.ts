/**
 * The browser's calls to the profile API. Kept out of the React provider so a
 * form can check availability without re-rendering the whole shell.
 */

import { getAuthToken } from 'deepspace'
import { USERNAME_MESSAGES } from '../game/username'
import type { ProfileView, ProfileSaveResult, UsernameAvailability } from '../game/profile'

export type MyProfileFetch =
  | { known: true; profile: ProfileView | null }
  | { known: false }

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await getAuthToken()
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  } catch {
    return { 'Content-Type': 'application/json' }
  }
}

function isProfileView(value: unknown): value is ProfileView {
  if (value === null || typeof value !== 'object') return false
  const profile = value as Record<string, unknown>
  return typeof profile.userId === 'string'
    && typeof profile.username === 'string'
    && typeof profile.onboardedAt === 'number'
    && typeof profile.usernameChangedAt === 'number'
}

function saveFailure(status: number): Extract<ProfileSaveResult, { ok: false }> {
  if (status === 409) return { ok: false, code: 'taken', message: USERNAME_MESSAGES.taken }
  if (status === 429) return { ok: false, code: 'rate_limited', message: USERNAME_MESSAGES.rate_limited }
  return { ok: false, code: 'unknown', message: USERNAME_MESSAGES.unknown }
}

/**
 * `known: false` means the server did not answer in the shape the API defines
 * (a network failure, a stub without profiles, an older worker). The onboarding
 * modal treats that as "do not interrupt", never as "no username yet".
 */
export async function fetchMyProfile(): Promise<MyProfileFetch> {
  try {
    const response = await fetch('/api/profile/me', { headers: await authHeaders() })
    if (!response.ok) return { known: false }
    const body = await response.json() as { profile?: unknown }
    if (!('profile' in body)) return { known: false }
    if (body.profile === null) return { known: true, profile: null }
    return isProfileView(body.profile) ? { known: true, profile: body.profile } : { known: false }
  } catch {
    return { known: false }
  }
}

export async function checkUsername(name: string): Promise<UsernameAvailability> {
  const response = await fetch(`/api/profile/available?name=${encodeURIComponent(name)}`, { headers: await authHeaders() })
  if (!response.ok) throw new Error(`availability ${response.status}`)
  const body = await response.json() as Partial<UsernameAvailability> & { available?: unknown; code?: unknown; message?: unknown }
  if (body.available === true) return { available: true }
  if (body.available === false && typeof body.code === 'string') {
    return {
      available: false,
      code: body.code,
      message: typeof body.message === 'string' ? body.message : USERNAME_MESSAGES.unknown,
    }
  }
  throw new Error('availability response')
}

export async function saveMyUsername(name: string): Promise<ProfileSaveResult> {
  try {
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ username: name }),
    })
    const body = await response.json().catch(() => null) as Record<string, unknown> | null
    if (body?.ok === true && isProfileView(body.profile)) return { ok: true, profile: body.profile }
    if (body?.ok === false && typeof body.code === 'string') {
      return {
        ok: false,
        code: body.code,
        message: typeof body.message === 'string' ? body.message : USERNAME_MESSAGES.unknown,
      }
    }
    return saveFailure(response.status)
  } catch {
    return saveFailure(0)
  }
}

export async function markOnboardingDone(): Promise<ProfileSaveResult> {
  try {
    const response = await fetch('/api/profile/onboarded', {
      method: 'POST',
      headers: await authHeaders(),
    })
    const body = await response.json().catch(() => null) as Record<string, unknown> | null
    if (body?.ok === true && isProfileView(body.profile)) return { ok: true, profile: body.profile }
    if (body?.ok === false && typeof body.code === 'string') {
      return {
        ok: false,
        code: body.code,
        message: typeof body.message === 'string' ? body.message : USERNAME_MESSAGES.unknown,
      }
    }
    return saveFailure(response.status)
  } catch {
    return saveFailure(0)
  }
}
