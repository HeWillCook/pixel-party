/**
 * Player statistics for the stats card.
 *
 *   GET /api/stats/:userId  → { stats: PlayerStats }
 *
 * Daily numbers are computed from the player's own `dailyScores` rows, paging through the
 * collection because one page is capped (~30 KB) by the records API. Party counters come from the
 * server-written `playerStats` row. The caller must be signed in (the same audience as the scores
 * board and the galleries) and may read any player's stats.
 */

import { Hono } from 'hono'
import type { AppContext } from '../../worker.js'
import {
  computeDailyStats,
  emptyPartyStats,
  toPartyStats,
  type DailyScoreStatRow,
  type PlayerStats,
} from '../game/stats.js'
import { resolveAuth } from './http-routes'
import { createServerTools } from './server-tools'
import type { ServerTools } from './server-tools'
import { getUsername } from './usernames'

const PAGE_SIZE = 1000
/** A generous ceiling: 40 pages is tens of thousands of daily rows for one player. */
const MAX_PAGES = 40

async function readDailyRows(tools: ServerTools, userId: string): Promise<DailyScoreStatRow[]> {
  const rows: DailyScoreStatRow[] = []
  let offset = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await tools.query<DailyScoreStatRow>('dailyScores', {
      where: { userId },
      limit: PAGE_SIZE,
      offset,
    })
    if (!result.success) throw new Error(result.error)
    for (const record of result.data.records) rows.push(record.data)
    const next = result.data.nextOffset
    if (next === undefined || result.data.records.length === 0) break
    offset = next
  }
  return rows
}

function latestRow(rows: readonly DailyScoreStatRow[]): DailyScoreStatRow | null {
  let latest: DailyScoreStatRow | null = null
  let latestDay = ''
  for (const row of rows) {
    if (typeof row.day !== 'string' || row.day <= latestDay) continue
    latest = row
    latestDay = row.day
  }
  return latest
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function loadPlayerStats(env: AppContext['Bindings'], userId: string): Promise<PlayerStats> {
  const tools = createServerTools(env)
  const rows = await readDailyRows(tools, userId)
  const latest = latestRow(rows)
  const stored = await tools.get<Record<string, unknown>>('playerStats', userId)
  if (!stored.success && stored.error !== 'Record not found') throw new Error(stored.error)
  const party = stored.success ? toPartyStats(stored.data.record.data) : emptyPartyStats()
  const username = await getUsername(env, userId)
  return {
    userId,
    name: username || text(latest?.displayName) || 'Player',
    avatarUrl: text(latest?.avatarUrl),
    daily: computeDailyStats(rows),
    party,
  }
}

export function registerStatsRoutes(app: Hono<AppContext>): void {
  const stats = new Hono<AppContext>()

  stats.use('*', async (c, next) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'sign_in_required' }, 401)
    await next()
  })

  stats.get('/:userId', async (c) => {
    const userId = c.req.param('userId').trim()
    if (!userId || userId.length > 128) return c.json({ error: 'bad_request' }, 400)
    try {
      return c.json({ stats: await loadPlayerStats(c.env, userId) })
    } catch (error) {
      console.warn('[stats] load failed', error instanceof Error ? error.message : 'unknown')
      return c.json({ error: 'stats_unavailable' }, 502)
    }
  })

  app.route('/api/stats', stats)
}
