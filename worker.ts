/**
 * App Worker — explicit assembly for DeepSpace app routes and Durable Objects.
 *
 * Route implementations live under src/server. Keep their registration order
 * here: specific API and WebSocket handlers must precede the SPA fallback.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  armCronRoom,
  authWorkerFetch,
  CanvasRoom,
  CronRoom,
  isAnonymousUserId,
  JobRoom,
  PresenceRoom,
  RecordRoom,
  registerAgentToolRoutes,
  resolveAppMembership,
  resolveAppRole,
  workerErrorHandler,
  YjsRoom,
} from 'deepspace/worker'
import type {
  AgentToolAccessResult,
  DOBindings,
  DOManifest,
  Job,
  JobContext,
  VerifyResult,
} from 'deepspace/worker'
import { buildTools } from './src/ai/tools.js'
import { tasks as cronTasks, runTask as runCronTask } from './src/cron.js'
import { runJob } from './src/jobs.js'
import { schemas } from './src/schemas.js'
import { createServerTools } from './src/server/server-tools.js'
import { registerActionRoutes } from './src/server/action-routes.js'
import { registerDailyRoutes } from './src/server/daily-routes.js'
import { registerPartyRoutes } from './src/server/party-routes.js'
import { registerProfileRoutes } from './src/server/profile-routes.js'
import {
  registerAuthAndIntegrationRoutes,
  registerPlatformProxyRoutes,
  registerStaticRoutes,
  resolveAgentAuth,
  resolveAuth,
} from './src/server/http-routes.js'
import { registerRealtimeRoutes } from './src/server/realtime-routes.js'
export { PixelRoom } from './src/server/pixel-room.js'
export { BudgetRoom } from './src/server/budget-room.js'
export { DailyRoom } from './src/server/daily-room.js'

// Dynamic deploy reads this manifest to create the app's DO bindings.
export const __DO_MANIFEST__ = [
  { binding: 'RECORD_ROOMS', className: 'AppRecordRoom', sqlite: true },
  { binding: 'YJS_ROOMS', className: 'AppYjsRoom', sqlite: true },
  { binding: 'CANVAS_ROOMS', className: 'AppCanvasRoom', sqlite: true },
  { binding: 'PRESENCE_ROOMS', className: 'AppPresenceRoom', sqlite: true },
  { binding: 'CRON_ROOMS', className: 'AppCronRoom', sqlite: true },
  { binding: 'JOB_ROOMS', className: 'AppJobRoom', sqlite: true },
  { binding: 'PIXEL_ROOMS', className: 'PixelRoom', sqlite: true },
  { binding: 'BUDGET_ROOMS', className: 'BudgetRoom', sqlite: true },
  { binding: 'DAILY_ROOMS', className: 'DailyRoom', sqlite: true },
] as const satisfies DOManifest

export class AppRecordRoom extends RecordRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, schemas, { ownerUserId: env.OWNER_USER_ID })
  }
}

// Retained scaffold Durable Objects have no routes.
export class AppYjsRoom extends YjsRoom<Env> {}
export class AppCanvasRoom extends CanvasRoom<Env> {}
export class AppPresenceRoom extends PresenceRoom<Env> {}

/** Runs the scheduled tasks defined in src/cron.ts. */
export class AppCronRoom extends CronRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, { tasks: cronTasks })
  }

  protected async onTask(taskName: string): Promise<void> {
    await runCronTask(taskName, this.env)
  }
}

/** Runs durable background work defined in src/jobs.ts. */
export class AppJobRoom extends JobRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, {
      authorizeWrite: async (user) => {
        if (user.userId.startsWith('anon-')) return false
        const role = await resolveAppRole(env, user.userId)
        return role === 'member' || role === 'admin'
      },
    })
  }

  protected async onJob(job: Job, context: JobContext): Promise<unknown> {
    return await runJob(job, context, this.env)
  }
}

export interface Env extends DOBindings<typeof __DO_MANIFEST__> {
  ASSETS: Fetcher
  /**
   * Platform service binding in production; deepspace dev supplies the URL
   * fallback. Standard app files use the platform's shared, app-scoped R2
   * bucket rather than a local binding.
   */
  PLATFORM_WORKER?: Fetcher
  PLATFORM_WORKER_URL?: string
  /**
   * HMAC app credential minted on first deploy. Proxy routes omit identity
   * headers when it is absent so upstream services fail closed.
   */
  APP_IDENTITY_TOKEN?: string
  /** API service binding in production with a deepspace-dev URL fallback. */
  API_WORKER?: Fetcher
  API_WORKER_URL?: string
  AUTH_JWT_PUBLIC_KEY: string
  AUTH_JWT_ISSUER: string
  AUTH_WORKER_URL: string
  /** Comma-separated exact Expo/native callback URIs (for example, myapp://auth/callback). */
  NATIVE_AUTH_REDIRECT_URIS?: string
  APP_NAME: string
  /** Immutable record-scope and platform identity. */
  DEEPSPACE_APP_ID: string
  OWNER_USER_ID: string
  /**
   * Long-lived owner JWT used for developer-billed server calls. User-billed
   * calls always forward the signed-in caller's JWT instead.
   */
  APP_OWNER_JWT: string
  /**
   * Enables /api/debug/* only when exactly "true". The route still requires
   * an authenticated app owner/admin. deepspace dev/test set it locally.
   */
  ALLOW_DEBUG_ROUTES?: string
}

export type AppContext = { Bindings: Env }

type AgentIdentity = (request: Request, env: Env) => Promise<VerifyResult | null>

/**
 * The SDK's local-agent route and the browser tool surface share this rule:
 * a verified caller who is the app owner or already has a user row may read.
 * A failed membership read is a 503, never a quiet "not a member", and an
 * anonymous identity is refused before any tool can run.
 */
function agentAccess(identity: AgentIdentity) {
  return async (request: Request, env: Env): Promise<AgentToolAccessResult> => {
    let auth: VerifyResult | null
    try {
      auth = await identity(request, env)
    } catch {
      // A malformed or unverifiable credential fails closed as no identity.
      return { ok: false, status: 401 }
    }
    if (!auth) return { ok: false, status: 401 }
    if (isAnonymousUserId(auth.userId)) return { ok: false, status: 403 }
    if (auth.userId === env.OWNER_USER_ID) return { ok: true, auth }
    const membership = await resolveAppMembership(env, auth.userId, request.signal)
    if (membership === null) return { ok: false, status: 503 }
    return membership.member ? { ok: true, auth } : { ok: false, status: 403 }
  }
}

declare const __PIXLE_TEST__: boolean

const app = new Hono<AppContext>()
// Only the test build exposes this readiness check; it refuses to start tests
// until the worker's paid-integration guard and auth service are both active.
if (typeof __PIXLE_TEST__ !== 'undefined' && __PIXLE_TEST__) {
  app.get('/api/__test/ready', async c => {
    const result = await createServerTools(c.env).integration('invalid-endpoint', {})
    if (result.success || result.code !== 'test_integration_disabled') return c.json({ error: 'test guard inactive' }, 503)
    const auth = await authWorkerFetch(c.env, '/api/auth/ok')
    if (!auth.ok) return c.json({ error: 'auth unavailable' }, 503)
    return c.json({ code: result.code })
  })
}
app.use('/api/*', cors())
// A Durable Object exists only once something fetches it, and the CronRoom
// arms its alarm in that first fetch — so wake it from the request path, or a
// deployed schedule waits for a visitor. Once per isolate; no-op without tasks.
app.use('*', async (c, next) => {
  armCronRoom(c.executionCtx, c.env.CRON_ROOMS, `app:${c.env.DEEPSPACE_APP_ID}`, cronTasks)
  await next()
})

// Registration order is part of the worker contract. The wildcard auth route
// follows its special cases, platform proxies follow app routes, and static is last.
registerAuthAndIntegrationRoutes(app)
registerRealtimeRoutes(app)
registerActionRoutes(app, resolveAuth)
registerDailyRoutes(app)
registerProfileRoutes(app)
registerPartyRoutes(app, resolveAuth)
// Read-only tools for the local agent (`deepspace agent tools/invoke`) and the
// browser surface the app's <AgentTools /> mounts. There is no website chat.
registerAgentToolRoutes(app, {
  buildTools,
  resolveAccess: agentAccess(resolveAgentAuth),
  resolveBrowserAccess: agentAccess(resolveAuth),
})
registerPlatformProxyRoutes(app)
registerStaticRoutes(app)

// Hono registers ONE error handler (last onError wins), and its default is
// `console.error(err)` — whose message Workers Logs drops, keeping only the
// stack frames. workerErrorHandler logs the string form instead (message
// first, frames and bounded cause chain, method + path for context), keeps a
// response-bearing error's (HTTPException — auth 401s, upload 413s) own
// answer, and returns a generic 500 for the rest.
app.onError(workerErrorHandler('error'))

export default app
