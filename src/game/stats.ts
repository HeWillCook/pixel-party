/**
 * Player statistics, the pure half.
 *
 * Daily numbers are derived from the existing `dailyScores` rows — there is no second copy of a
 * day's score anywhere. Party numbers are counters written by the room at round end
 * (`src/server/player-stats.ts`) and read back through `toPartyStats`.
 *
 * Days are UTC days (`YYYY-MM-DD`), because the daily game itself rolls over at UTC midnight.
 */

export interface DailyScoreStatRow {
  [key: string]: unknown
  day?: unknown
  score?: unknown
  medal?: unknown
  /** Profile fields copied onto the score row; used only for the card's header. */
  displayName?: unknown
  avatarUrl?: unknown
}

export interface DailyStats {
  /** Distinct UTC days with a score row, including a day scored 0. */
  daysPlayed: number
  bestScore: number
  /** The day the best score was set; null when there are no days played. */
  bestDay: string | null
  /** Mean score across the days played, rounded to a whole point. */
  averageScore: number
  currentStreak: number
  longestStreak: number
  medals: { gold: number; silver: number; bronze: number }
  /** Gold + silver + bronze. */
  topThree: number
}

export interface PartyStats {
  partyRounds: number
  partyGuessed: number
  teamWins: number
  gamesHosted: number
  /** Always 0 for now: the round-end event carries only a canvas-wide pixel count. */
  pixelsPainted: number
  updatedAt: number
}

export interface PlayerStats {
  userId: string
  name: string
  avatarUrl: string
  daily: DailyStats
  party: PartyStats
}

const DAY_MS = 86_400_000
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function emptyDailyStats(): DailyStats {
  return {
    daysPlayed: 0,
    bestScore: 0,
    bestDay: null,
    averageScore: 0,
    currentStreak: 0,
    longestStreak: 0,
    medals: { gold: 0, silver: 0, bronze: 0 },
    topThree: 0,
  }
}

export function emptyPartyStats(): PartyStats {
  return {
    partyRounds: 0,
    partyGuessed: 0,
    teamWins: 0,
    gamesHosted: 0,
    pixelsPainted: 0,
    updatedAt: 0,
  }
}

/** A real UTC day as a whole number of days since the epoch, or null for anything else. */
export function utcDayNumber(day: unknown): number | null {
  if (typeof day !== 'string') return null
  const match = DAY_PATTERN.exec(day)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const date = Number(match[3])
  const ms = Date.UTC(year, month - 1, date)
  // Date.UTC rolls 2026-02-30 into March; only accept a day that round-trips exactly.
  if (new Date(ms).toISOString().slice(0, 10) !== day) return null
  return Math.floor(ms / DAY_MS)
}

function scoreOf(row: DailyScoreStatRow): number {
  return typeof row.score === 'number' && Number.isFinite(row.score) ? row.score : 0
}

function medalOf(row: DailyScoreStatRow): 0 | 1 | 2 | 3 {
  return row.medal === 1 || row.medal === 2 || row.medal === 3 ? row.medal : 0
}

/**
 * `now` decides the current streak only: a streak still counts when the player painted today or
 * yesterday, so the number does not drop to zero at UTC midnight before they have had a chance to
 * paint again.
 */
export function computeDailyStats(rows: readonly DailyScoreStatRow[], now = Date.now()): DailyStats {
  const byDay = new Map<number, { score: number; medal: 0 | 1 | 2 | 3 }>()
  for (const row of rows) {
    const day = utcDayNumber(row.day)
    if (day === null) continue
    const existing = byDay.get(day)
    const score = scoreOf(row)
    const medal = medalOf(row)
    if (!existing) {
      byDay.set(day, { score, medal })
      continue
    }
    // The collection is unique on (day, userId); if a duplicate ever sneaks in, the better score wins.
    existing.score = Math.max(existing.score, score)
    existing.medal = Math.max(existing.medal, medal) as 0 | 1 | 2 | 3
  }

  const days = [...byDay.keys()].sort((left, right) => left - right)
  const stats = emptyDailyStats()
  stats.daysPlayed = days.length
  if (days.length === 0) return stats

  let total = 0
  let best = -Infinity
  let bestDay = days[0]
  for (const day of days) {
    const { score, medal } = byDay.get(day)!
    total += score
    if (score > best) {
      best = score
      bestDay = day
    }
    if (medal === 1) stats.medals.gold++
    else if (medal === 2) stats.medals.silver++
    else if (medal === 3) stats.medals.bronze++
  }
  stats.bestScore = best
  stats.bestDay = new Date(bestDay * DAY_MS).toISOString().slice(0, 10)
  stats.averageScore = Math.round(total / days.length)
  stats.topThree = stats.medals.gold + stats.medals.silver + stats.medals.bronze

  let longest = 1
  let run = 1
  for (let index = 1; index < days.length; index++) {
    run = days[index] === days[index - 1] + 1 ? run + 1 : 1
    if (run > longest) longest = run
  }
  stats.longestStreak = longest

  const today = Math.floor(now / DAY_MS)
  const last = days[days.length - 1]
  if (last === today || last === today - 1) {
    let streak = 1
    for (let index = days.length - 1; index > 0; index--) {
      if (days[index] - days[index - 1] !== 1) break
      streak++
    }
    stats.currentStreak = streak
  }

  return stats
}

function counter(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** Turn a stored `playerStats` row into the counters the card shows. Missing fields read as 0. */
export function toPartyStats(row: Record<string, unknown> | null | undefined): PartyStats {
  if (!row) return emptyPartyStats()
  return {
    partyRounds: counter(row.partyRounds),
    partyGuessed: counter(row.partyGuessed),
    teamWins: counter(row.teamWins),
    gamesHosted: counter(row.gamesHosted),
    pixelsPainted: counter(row.pixelsPainted),
    updatedAt: counter(row.updatedAt),
  }
}
