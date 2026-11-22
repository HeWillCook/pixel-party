/**
 * The Party lobby's list of open games.
 *
 * The rooms collection only lets a caller read public rooms plus the private rooms they host or
 * have joined, so the SDK's live query can never show every private game. This route reads with the
 * server's own access and then strips what the caller may not see: a private room appears by name
 * with a lock, and its join code is omitted unless the caller hosts or has joined it.
 */

import type { Hono } from 'hono'
import type { VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'
import { createServerTools } from './server-tools'
import { openRooms } from './rooms'

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

export function registerPartyRoutes(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.get('/api/party/rooms', async (c) => {
    // Identity is optional here: the list is public, but it decides which codes come back.
    const auth = await resolveAuth(c.req.raw, c.env)
    const result = await openRooms(createServerTools(c.env), auth?.userId ?? null)
    if (!result.success) return c.json({ error: 'Could not read rooms' }, 503)
    c.header('Cache-Control', 'no-store')
    return c.json({ rooms: result.data })
  })
}
