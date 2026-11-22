/**
 * The authenticated profile API.
 *
 *   GET  /api/profile/me                → { profile: ProfileView | null }
 *   GET  /api/profile/available?name=…  → { available: true | false, code?, message? }
 *   POST /api/profile                   → set/change my username
 *   PUT  /api/profile                   → same
 *   POST /api/profile/onboarded         → finish/skip the first-sign-in tour
 *
 * Identity comes only from a verified bearer token (same `resolveAuth` as the
 * Daily routes). Every response carries an explicit `profile` key (even when
 * null) so the client can tell "no profile yet" from "the server did not
 * answer": a missing key means unknown, and the onboarding modal stays closed.
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppContext } from '../../worker.js'
import { USERNAME_MESSAGES } from '../game/username'
import type { ProfileSaveResult } from '../game/profile'
import { resolveAuth } from './http-routes'
import { createServerTools } from './server-tools'
import { markOnboarded, readProfile, rememberUsername, saveUsername, usernameAvailability } from './usernames'

function objectBody(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function failureStatus(result: Extract<ProfileSaveResult, { ok: false }>): 400 | 409 | 429 {
  if (result.code === 'taken') return 409
  if (result.code === 'rate_limited') return 429
  return 400
}

type ProfileContext = AppContext & { Variables: { profileUserId: string } }

export function registerProfileRoutes(app: Hono<AppContext>): void {
  const profile = new Hono<ProfileContext>()

  profile.use('*', async (c, next) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'sign_in_required' }, 401)
    c.set('profileUserId', auth.userId)
    await next()
  })

  profile.get('/me', async (c) => {
    const tools = createServerTools(c.env)
    const stored = await readProfile(tools, c.get('profileUserId'))
    return c.json({ profile: stored?.profile ?? null })
  })

  profile.get('/available', async (c) => {
    const tools = createServerTools(c.env)
    const result = await usernameAvailability(tools, c.get('profileUserId'), c.req.query('name') ?? '')
    return c.json(result)
  })

  const setUsername = async (c: Context<ProfileContext>) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!objectBody(body) || typeof body.username !== 'string') {
      return c.json({ ok: false, code: 'required', message: USERNAME_MESSAGES.required }, 400)
    }
    const tools = createServerTools(c.env)
    const result = await saveUsername(tools, c.get('profileUserId'), body.username)
    if (!result.ok) return c.json(result, failureStatus(result))
    rememberUsername(c.get('profileUserId'), result.profile.username)
    return c.json(result)
  }

  // Mounted at /api/profile: an empty sub-path is the collection route itself.
  profile.on(['POST', 'PUT'], '', setUsername)

  profile.post('/onboarded', async (c) => {
    const tools = createServerTools(c.env)
    const result = await markOnboarded(tools, c.get('profileUserId'))
    if (!result.ok) return c.json(result, 400)
    return c.json(result)
  })

  app.route('/api/profile', profile)
}
