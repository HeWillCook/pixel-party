import { Hono } from 'hono'
import { DAILY } from '../game/config'
import type { AppContext, Env } from '../../worker.js'
import { reserveBudget } from './budget'
import { createDailyJudge, renderCellsPng } from './daily-judge'
import { addDebugPaintings, clearDebugPaintings } from './daily-debug'
import { doAttemptStore } from './daily-room'
import { dailyState, endDaily, gradeDaily, InvalidAttemptDay, resetDaily, startDaily, todaysDrawings } from './daily-service'
import type { DailyDeps, DailyUser } from './daily-service'
import { resolveAuth } from './http-routes'
import { createServerTools } from './server-tools'

function dependencies(env: Env): DailyDeps {
  return {
    now: Date.now,
    store: doAttemptStore(env),
    judge: createDailyJudge(env),
    tools: createServerTools(env),
    reserveBudget: () => reserveBudget(env),
    render: renderCellsPng,
  }
}

function objectBody(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function dayBody(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function registerDailyRoutes(app: Hono<AppContext>): void {
  const daily = new Hono<AppContext & { Variables: { dailyUser: DailyUser } }>()
  daily.use('*', async (c, next) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'sign_in_required' }, 401)
    c.set('dailyUser', { userId: auth.userId, name: auth.claims.name ?? 'Player', image: auth.claims.image ?? '' })
    await next()
  })

  daily.post('/start', async c => c.json(await startDaily(dependencies(c.env), c.get('dailyUser'))))
  // TEMP DEBUG: remove before launch
  daily.post('/reset', async c => c.json(await resetDaily(dependencies(c.env), c.get('dailyUser').userId)))
  // TEMP DEBUG: remove before launch
  daily.post('/debug-paintings', async c => {
    const body: unknown = await c.req.json().catch(() => null)
    const user = c.get('dailyUser')
    const tools = createServerTools(c.env)
    if (objectBody(body) && body.clear === true) return c.json({ removed: await clearDebugPaintings(tools, user.userId) })
    if (!objectBody(body) || !Number.isInteger(body.add) || (body.add as number) < 1) return c.json({ error: 'bad_request' }, 400)
    return c.json({ added: await addDebugPaintings(tools, user, body.add as number, Date.now()) })
  })
  daily.post('/grade', async c => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!objectBody(body) || !dayBody(body.day) || (body.kind !== 'auto' && body.kind !== 'ask' && body.kind !== 'final') || typeof body.cells !== 'string' || (body.kind === 'auto' && (!Number.isInteger(body.window) || (body.window as number) < 0 || (body.window as number) >= DAILY.autoWindowsMs.length))) {
      return c.json({ error: 'bad_request' }, 400)
    }
    return c.json(await gradeDaily(dependencies(c.env), c.get('dailyUser'), body.kind, body.cells, body.day, body.window as number | undefined))
  })
  daily.post('/end', async c => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!objectBody(body) || !dayBody(body.day) || (body.cells !== undefined && typeof body.cells !== 'string')) return c.json({ error: 'bad_request' }, 400)
    try {
      return c.json(await endDaily(dependencies(c.env), c.get('dailyUser'), body.cells as string | undefined ?? null, body.day))
    } catch (error) {
      if (error instanceof InvalidAttemptDay) return c.json({ error: error.message }, 400)
      throw error
    }
  })
  daily.get('/me', async c => c.json(await dailyState(dependencies(c.env), c.get('dailyUser').userId)))
  daily.get('/today/drawings', async c => {
    const result = await todaysDrawings(dependencies(c.env), c.get('dailyUser').userId)
    return c.json(result, result.ok ? 200 : 403)
  })
  app.route('/api/daily', daily)
}
