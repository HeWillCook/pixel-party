/**
 * WebSocket routing for app-owned Durable Objects.
 *
 * Caller identity in query parameters and headers is never trusted. Routes
 * scrub it and forward verified JWT identity in internal-only headers.
 */

import { isAnonymousUserId } from 'deepspace'
import type { Context, Hono } from 'hono'
import { authenticatedRoomRequest, resolveAppRole, verifyJwt } from 'deepspace/worker'
import type { JwtVerifierConfig, VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'
import { createServerTools } from './server-tools'
import { addRoomMember, findRoom, joinCodePattern } from './rooms'

function jwtConfig(env: Env): JwtVerifierConfig {
  return { publicKey: env.AUTH_JWT_PUBLIC_KEY, issuer: env.AUTH_JWT_ISSUER }
}

function wsRoute(
  doNamespace: (env: Env) => DurableObjectNamespace,
  extraIdentity?: (auth: VerifyResult, env: Env) => { role?: string } | Promise<{ role?: string }>,
) {
  return async (c: Context<AppContext>) => {
    const id = c.req.param('roomId') ?? c.req.param('docId') ?? c.req.param('scopeId')
    if (!id) return new Response('Not found', { status: 404 })
    const url = new URL(c.req.url)
    const token = url.searchParams.get('token')

    let auth: VerifyResult | null = null
    if (token) {
      auth = (await verifyJwt(jwtConfig(c.env), token)).result
      if (!auth) return new Response('Unauthorized', { status: 401 })
    }
    const roomRequest = authenticatedRoomRequest(
      c.req.raw,
      auth,
      auth ? await extraIdentity?.(auth, c.env) : undefined,
    )

    const namespace = doNamespace(c.env)
    const stub = namespace.get(namespace.idFromName(id))
    return stub.fetch(roomRequest)
  }
}


export function registerRealtimeRoutes(app: Hono<AppContext>): void {
  app.get('/api/pixel/:joinCode/ws', async context => {
    const rawCode = context.req.param('joinCode')
    const joinCode = rawCode.toUpperCase()
    if (!joinCodePattern.test(rawCode)) return new Response('Not found', { status: 404 })
    const tools = createServerTools(context.env)
    const lookup = await findRoom(tools, joinCode)
    if (!lookup.success) return new Response('Room unavailable', { status: 503 })
    if (!lookup.data) return new Response('Not found', { status: 404 })
    const room = lookup.data
    if (room.data.status === 'closed') return new Response('Room closed', { status: 410 })
    const url = new URL(context.req.url)
    const token = url.searchParams.get('token')
    const spectate = url.searchParams.get('spectate') === '1'
    const auth = token ? (await verifyJwt(jwtConfig(context.env), token)).result : null
    if ((token && !auth) || (room.data.visibility === 'private' && (!auth || isAnonymousUserId(auth.userId)))) return new Response('Unauthorized', { status: 401 })
    if (room.data.visibility === 'private' && auth && !spectate) {
      const joined = await addRoomMember(tools, room, auth.userId)
      if (!joined.success) return new Response('Room unavailable', { status: 503 })
    }
    const request = authenticatedRoomRequest(context.req.raw, auth)
    for (const header of ['X-Room-Id', 'X-Room-Mode', 'X-Room-Host', 'X-Room-Spectate']) request.headers.delete(header)
    request.headers.set('X-Room-Id', room.recordId)
    request.headers.set('X-Room-Mode', room.data.mode)
    request.headers.set('X-Room-Host', room.data.hostId)
    request.headers.set('X-Room-Spectate', String(spectate))
    return context.env.PIXEL_ROOMS.get(context.env.PIXEL_ROOMS.idFromName(room.recordId)).fetch(request)
  })

  app.get(
    '/ws/:roomId',
    wsRoute((env) => env.RECORD_ROOMS),
  )


  app.get(
    '/ws/presence/:scopeId',
    wsRoute((env) => env.PRESENCE_ROOMS),
  )

  app.get(
    '/ws/cron/:roomId',
    wsRoute(
      (env) => env.CRON_ROOMS,
      // Authenticated users get their current app role. Anonymous connections
      // have no role and CronRoom enforces them as read-only viewers.
      async (auth, env) => ({ role: await resolveAppRole(env, auth.userId) }),
    ),
  )

  app.get(
    '/ws/jobs/:roomId',
    wsRoute((env) => env.JOB_ROOMS),
  )
}
