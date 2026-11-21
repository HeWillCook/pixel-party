/**
 * Read-only agent tools for Pixel Party.
 *
 * One definition serves the local agent and the browser tool surface. Every
 * tool goes through the caller's record executor, so the app's normal row
 * permissions decide what it can see; the tools only narrow that further.
 * Nothing here writes, calls an AI model, or returns raw pixel data.
 */

import { AgentToolError } from 'deepspace/worker'
import type { AgentToolContext, UserToolExecutor } from 'deepspace/worker'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { DAILY } from '../game/config'
import { promptForDay } from '../game/daily/prompts'
import { rankScores } from '../game/daily/rank'
import { utcDay } from '../server/room-time'
import type { Env } from '../../worker.js'

interface RecordRow {
  recordId: string
  data: Record<string, unknown>
}

type QueryResult =
  | { success: true; data: { records: RecordRow[]; count?: number; nextOffset?: number } }
  | { success: false; code?: string; error?: string }

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const daySchema = z
  .string()
  .regex(DAY_PATTERN, 'day must be YYYY-MM-DD')
  .refine(isDay, 'day must be a real calendar date')

/** Coerce an optional count into a usable page size instead of failing on a wide request. */
function clampLimit(value: number | undefined, fallback: number): number {
  return Math.min(50, Math.max(1, Math.trunc(value ?? fallback)))
}

function text(data: Record<string, unknown>, field: string): string {
  const value = data[field]
  return typeof value === 'string' ? value : ''
}

function numberValue(data: Record<string, unknown>, field: string): number {
  const value = data[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Run one record query as the caller and unwrap its rows, or fail with a clean tool error. */
async function query(executor: UserToolExecutor, collection: string, options: Record<string, unknown>): Promise<RecordRow[]> {
  const result = await executor('records.query', { collection, ...options }) as QueryResult
  if (!result || result.success !== true || !Array.isArray(result.data?.records)) {
    const detail = result && result.success === false && typeof result.error === 'string'
      ? result.error
      : `Could not read ${collection}`
    throw new AgentToolError('records_unavailable', detail, 503)
  }
  return result.data.records
}

export function buildTools(executor: UserToolExecutor, context: AgentToolContext<Env>): ToolSet {
  const tools: ToolSet = {}

  tools.today_prompt = tool({
    description: 'The current UTC day\'s Daily painting prompt, the day itself, and the attempt timing and auto-grade schedule.',
    inputSchema: z.object({}),
    execute: async () => {
      const day = utcDay(Date.now())
      return {
        day,
        prompt: promptForDay(day).prompt,
        attemptMinutes: DAILY.attemptMs / 60_000,
        autoGradeMinutes: DAILY.autoWindowsMs.map(offset => offset / 60_000),
        manualGrades: DAILY.maxAsks,
      }
    },
  })

  tools.today_leaderboard = tool({
    description: 'Top Daily scores for a UTC day (default today), ranked exactly like the Scores page: best score per player, tie broken by the faster best attempt.',
    inputSchema: z.object({
      day: daySchema.optional().describe('UTC day to read, YYYY-MM-DD. Defaults to today.'),
      limit: z.number().int().optional().describe('Number of entries to return, 1-50. Defaults to 10.'),
    }),
    execute: async ({ day, limit }) => {
      const target = day ?? utcDay(Date.now())
      const count = clampLimit(limit, 10)
      const [scores, drawings] = await Promise.all([
        query(executor, 'dailyScores', { where: { day: target }, limit: 1000 }),
        query(executor, 'dailyDrawings', { where: { day: target }, limit: 1000 }),
      ])

      // The Scores page falls back to the drawing's guess when deciding whether
      // a zero-score row still counts as a graded painting.
      const guessByUser = new Map<string, string>()
      for (const { data } of drawings) {
        const userId = text(data, 'userId')
        if (userId && typeof data.guess === 'string') guessByUser.set(userId, data.guess)
      }

      const bestByUser = new Map<string, { userId: string; displayName: string; score: number; bestElapsedMs: number | null; guess: string }>()
      for (const { data } of scores) {
        const userId = text(data, 'userId')
        if (!userId || typeof data.score !== 'number') continue
        if (text(data, 'day') && text(data, 'day') !== target) continue
        const existing = bestByUser.get(userId)
        if (existing && data.score <= existing.score) continue
        bestByUser.set(userId, {
          userId,
          displayName: text(data, 'displayName').trim() || 'Player',
          score: data.score,
          bestElapsedMs: typeof data.bestElapsedMs === 'number' ? data.bestElapsedMs : null,
          guess: typeof data.guess === 'string' ? data.guess : '',
        })
      }

      const graded = Array.from(bestByUser.values()).filter(row => row.score > 0 || (row.guess || guessByUser.get(row.userId) || '').trim().length > 0)
      const ranked = rankScores(graded)
      const entries = ranked.slice(0, count).map(({ userId, rank }) => {
        const row = bestByUser.get(userId)!
        return { rank, userId, displayName: row.displayName, score: row.score }
      })
      return { day: target, total: ranked.length, returned: entries.length, entries }
    },
  })

  tools.player_gallery = tool({
    description: 'A player\'s recent Daily paintings, newest day first: day, prompt, score, and Haiku\'s guess. Private or unpublished rows are never included.',
    inputSchema: z.object({
      userId: z.string().trim().min(1).max(128).describe('The player\'s user id.'),
      limit: z.number().int().optional().describe('Number of paintings to return, 1-50. Defaults to 12.'),
    }),
    execute: async ({ userId, limit }) => {
      const count = clampLimit(limit, 12)
      const records = await query(executor, 'dailyDrawings', { where: { userId }, limit: 1000 })
      const bestByDay = new Map<string, Record<string, unknown>>()
      for (const { data } of records) {
        if (text(data, 'userId') !== userId) continue
        const day = text(data, 'day')
        if (!isDay(day)) continue
        if (typeof data.cells !== 'string' || data.cells.length === 0) continue
        // The record executor already enforces this; repeating it keeps a
        // caller's private in-progress row out of anyone else's gallery even
        // if a future caller uses a more privileged executor.
        if (text(data, 'visibility') === 'private' && userId !== context.userId) continue
        const score = numberValue(data, 'score')
        if (score <= 0 && !(text(data, 'guess')).trim()) continue
        const existing = bestByDay.get(day)
        if (!existing || score > numberValue(existing, 'score')) bestByDay.set(day, data)
      }
      const paintings = Array.from(bestByDay.entries())
        .sort(([left], [right]) => right.localeCompare(left))
        .slice(0, count)
        .map(([day, data]) => ({
          day,
          prompt: text(data, 'prompt').trim() || 'Daily painting',
          score: numberValue(data, 'score'),
          guess: text(data, 'guess'),
        }))
      return { userId, total: bestByDay.size, returned: paintings.length, paintings }
    },
  })

  tools.live_rooms = tool({
    description: 'Public rooms currently listed in the Studio lobby, newest activity first. Private rooms are never listed.',
    inputSchema: z.object({}),
    execute: async () => {
      const records = await query(executor, 'rooms', { orderBy: 'lastActiveAt', orderDir: 'desc', limit: 50 })
      const rooms = records
        .filter(({ data }) =>
          text(data, 'visibility') === 'public'
          && text(data, 'status') !== 'closed'
          && data.isDefaultBoard !== true
          && data.isDefaultBoard !== 1
          && text(data, 'joinCode') !== 'play')
        .sort((left, right) => numberValue(right.data, 'lastActiveAt') - numberValue(left.data, 'lastActiveAt'))
        .map(({ data }) => ({
          code: text(data, 'joinCode'),
          name: text(data, 'name'),
          playerCount: numberValue(data, 'playerCount'),
          status: text(data, 'status'),
        }))
      return { returned: rooms.length, rooms }
    },
  })

  return tools
}
