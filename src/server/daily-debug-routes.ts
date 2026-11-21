// DEV ONLY (__DEBUG_TOOLS__)
//
// The two pre-launch debug routes, kept in their own module so a production
// build can drop the whole module (and its daily-debug / resetDaily imports)
// from the worker instead of merely dead-stripping the registrations: with the
// define false, nothing here reaches the bundle or its source map.
import type { Hono } from 'hono'
import type { AppContext, Env } from '../../worker.js'
import { addDebugPaintings, clearDebugPaintings } from './daily-debug'
import { resetDaily } from './daily-service'
import type { DailyDeps, DailyUser } from './daily-service'
import { createServerTools } from './server-tools'

type DailyApp = Hono<AppContext & { Variables: { dailyUser: DailyUser } }>

function objectBody(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * POST /api/daily/reset — wipes the caller's attempt and score rows for the day.
 * POST /api/daily/debug-paintings — adds/clears generated paintings on the
 * caller's own wall.
 *
 * Registered from registerDailyRoutes only when __DEBUG_TOOLS__ is true, so a
 * production worker answers both paths with the JSON 404 in http-routes.ts.
 */
export function registerDailyDebugRoutes(daily: DailyApp, dependencies: (env: Env) => DailyDeps): void {
  daily.post('/reset', async c => c.json(await resetDaily(dependencies(c.env), c.get('dailyUser').userId)))
  daily.post('/debug-paintings', async c => {
    const body: unknown = await c.req.json().catch(() => null)
    const user = c.get('dailyUser')
    const tools = createServerTools(c.env)
    if (objectBody(body) && body.clear === true) return c.json({ removed: await clearDebugPaintings(tools, user.userId) })
    if (!objectBody(body) || !Number.isInteger(body.add) || (body.add as number) < 1) return c.json({ error: 'bad_request' }, 400)
    return c.json({ added: await addDebugPaintings(tools, user, body.add as number, Date.now()) })
  })
}
