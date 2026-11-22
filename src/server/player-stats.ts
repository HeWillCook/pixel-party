/**
 * Party statistics, written once per round at round end.
 *
 * The room's Durable Object is the only writer, so a read-modify-write per player is serialized in
 * the app's single RecordRoom DO. `lastRoundKey` makes a duplicate call for the same room round
 * idempotent: a retried hook, or the same room reported twice, cannot count a round twice.
 *
 * Daily statistics are deliberately absent here — they are computed from `dailyScores`.
 */

import { isAnonymousUserId } from 'deepspace'
import type { Env } from '../../worker.js'
import { toPartyStats, type PartyStats } from '../game/stats.js'
import { createServerTools } from './server-tools.js'
import type { ServerTools } from './server-tools.js'

export interface PartyRoundInput {
  roomId: string
  /** The room round id. Together with `roomId` it is the idempotency key. */
  roundId: string
  mode: 'coop' | 'team'
  contributorIds: string[]
  outcome: 'won' | 'timeout' | 'teamWin'
  /** The painters on the winning team; used only for `teamWin`. */
  winningTeamUserIds?: string[]
  hostId?: string
}

export interface PartyRoundUpdate {
  updated: number
  skipped: number
}

const COLLECTION = 'playerStats'

function signedInId(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > 128) return null
  return isAnonymousUserId(value) ? null : value
}

/**
 * Counters for one round. Everything but `partyRounds` is conditional:
 * a co-op win counts a guess, a team win counts the winners, and the host counts a game hosted
 * whether or not they painted.
 */
export function recordPartyRound(env: Env, input: PartyRoundInput): Promise<PartyRoundUpdate> {
  return recordPartyRoundWithTools(createServerTools(env), input)
}

export async function recordPartyRoundWithTools(
  tools: ServerTools,
  input: PartyRoundInput,
  now = Date.now(),
): Promise<PartyRoundUpdate> {
  const roomId = typeof input.roomId === 'string' ? input.roomId.trim() : ''
  const roundId = typeof input.roundId === 'string' ? input.roundId.trim() : ''
  if (!roomId || !roundId) throw new Error('A party round needs a roomId and a roundId')

  const contributors = new Set<string>()
  for (const id of input.contributorIds ?? []) {
    const userId = signedInId(id)
    if (userId) contributors.add(userId)
  }
  const winners = new Set<string>()
  for (const id of input.winningTeamUserIds ?? []) {
    const userId = signedInId(id)
    if (userId) winners.add(userId)
  }
  const hostId = signedInId(input.hostId)
  const players = new Set<string>([...contributors, ...winners, ...(hostId ? [hostId] : [])])
  if (players.size === 0) return { updated: 0, skipped: 0 }

  const key = `${roomId}:${roundId}`
  const result: PartyRoundUpdate = { updated: 0, skipped: 0 }

  for (const userId of players) {
    const existing = await tools.get<Record<string, unknown>>(COLLECTION, userId)
    if (!existing.success && existing.error !== 'Record not found') {
      throw new Error(`Player stats lookup failed: ${existing.error}`)
    }
    const row = existing.success ? existing.data.record.data : null
    const current: PartyStats = toPartyStats(row)
    if (row && row.lastRoundKey === key) {
      result.skipped++
      continue
    }

    const contributed = contributors.has(userId)
    const next = {
      partyRounds: current.partyRounds + (contributed ? 1 : 0),
      partyGuessed: current.partyGuessed + (contributed && input.mode === 'coop' && input.outcome === 'won' ? 1 : 0),
      teamWins: current.teamWins + (winners.has(userId) ? 1 : 0),
      gamesHosted: current.gamesHosted + (hostId === userId ? 1 : 0),
      pixelsPainted: current.pixelsPainted,
      lastRoundKey: key,
      updatedAt: now,
    }
    const written = existing.success
      ? await tools.update(COLLECTION, userId, next)
      : await tools.create(COLLECTION, { userId, ...next }, userId)
    if (!written.success) throw new Error(`Player stats write failed: ${written.error}`)
    result.updated++
  }

  return result
}
