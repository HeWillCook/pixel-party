import { roomRecords } from './rooms'
import { utcDay } from './room-time'
import type { ServerTools } from './server-tools'

export interface DayCloseResult {
  /** Drawings on the day's gallery after the run (also the count on a repeat run). */
  published: number
  /** Medals handed out: one each to the top three ranks, or fewer if fewer players finished. */
  medals: number
}

const MEDAL_RANKS = 3

function numberField(row: Record<string, unknown>, field: string): number {
  const value = row[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** An unknown start time sorts after every real one, so a missing time only breaks ties downward. */
function startedAt(row: Record<string, unknown>): number {
  const value = row.startedAt
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
}

/**
 * Closes one UTC day: every drawing goes public, and every score is frozen with
 * its medal. Best score wins; an exact score tie goes to whoever started their
 * attempt earlier that day. Safe to run twice — the same rows end in the same state.
 */
export async function closeDay(tools: ServerTools, day: string): Promise<DayCloseResult> {
  const drawings = await roomRecords(tools, 'dailyDrawings', { day })
  if (!drawings.success) throw new Error(drawings.error)
  for (const drawing of drawings.data) {
    const updated = await tools.update('dailyDrawings', drawing.recordId, { visibility: 'public' })
    if (!updated.success) throw new Error(updated.error)
  }

  const scores = await roomRecords(tools, 'dailyScores', { day })
  if (!scores.success) throw new Error(scores.error)
  const ranked = [...scores.data].sort((left, right) =>
    numberField(right.data, 'score') - numberField(left.data, 'score')
    || startedAt(left.data) - startedAt(right.data))
  for (const [rank, score] of ranked.entries()) {
    const updated = await tools.update('dailyScores', score.recordId, {
      ended: 1,
      medal: rank < MEDAL_RANKS ? rank + 1 : 0,
    })
    if (!updated.success) throw new Error(updated.error)
  }
  return { published: drawings.data.length, medals: Math.min(ranked.length, MEDAL_RANKS) }
}

/**
 * Closes the two most recent complete UTC days. The cron fires at 00:10 UTC, so
 * "yesterday" is normally the only open day; but if the alarm is delayed past
 * 00:10 the next day (a retry after an outage), `now - 24h` names the day
 * before yesterday and the day that just ended would otherwise never close, so
 * its drawings would stay private forever. closeDay is idempotent, so closing
 * both is safe on every ordinary run.
 */
export async function closeRecentDays(tools: ServerTools, now: number): Promise<string[]> {
  const days = [utcDay(now - 86_400_000), utcDay(now - 172_800_000)]
  for (const day of days) await closeDay(tools, day)
  return days
}
