/**
 * Cron task definitions — registered into the AppCronRoom DO at construction
 * time (worker.ts). The DO alarm fires `runTask(name, env)` on the schedule
 * declared here; the DO itself records executions, tracks history, and
 * pushes status to admin clients via the `/ws/cron/:roomId` WebSocket.
 *
 * Each task declares EITHER `intervalMinutes` (run every N minutes) OR
 * `schedule` + `timezone` (5-field cron expression). CronRoom validates
 * the config at construction time and throws on ambiguous declarations.
 *
 * Example:
 *
 *   import type { CronTask } from 'deepspace/worker'
 *   import { buildCronContext } from 'deepspace/worker'
 *
 *   export const tasks: CronTask[] = [
 *     { name: 'heartbeat', intervalMinutes: 1 },
 *     { name: 'daily-report', schedule: '0 9 * * *', timezone: 'America/New_York' },
 *   ]
 *
 *   export async function runTask(name: string, env: Env): Promise<void> {
 *     const ctx = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
 *     if (name === 'heartbeat') {
 *       // …
 *     }
 *   }
 */

import type { CronTask } from 'deepspace/worker'
import type { Env } from '../worker.js'
import { closeRecentDays } from './server/daily-close.js'
import { createServerTools } from './server/server-tools.js'

export const tasks: CronTask[] = [
  // 00:10 UTC: after the latest possible end of a 5-minute attempt (plus its
  // 15 s grace) that started at 23:59 on the previous UTC day.
  { name: 'daily-close', schedule: '10 0 * * *', timezone: 'UTC' },
]

export async function runTask(name: string, env: Env): Promise<void> {
  if (name === 'daily-close') {
    // Both of the last two UTC days: a delayed alarm must not skip a day.
    await closeRecentDays(createServerTools(env), Date.now())
  }
}
