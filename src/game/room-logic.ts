import { JUDGE, MODES, ROOMS, type Mode, type ZoneId } from './config'
import { contributors, createGrid, decodeCells, encodeCells, pixelsUsed, setPixel, type Grid } from './grid'
import type { JudgeOutcome } from './judge-flow'
import type { RoundView } from './protocol'
import { validatePlacement, type RejectReason } from './rules'
import { coopScore } from './scoring'
import { pickWord, type WordEntry } from './words'

export interface RoomState {
  roomId: string
  isDefaultBoard: boolean
  mode: Mode
  grid: Grid
  version: number
  round: RoundView
  wordEntry: WordEntry
  recentWords: string[]
  roundCounter: number
  lastPlacedAt: Record<string, number>
  judgeCalls: number[]
  lastJudgedVersion: number
  lastJudgedAt: number
  judgeInFlight: boolean
  emptySince: number | null
  intermissionEndsAt: number | null
  pausedAt: number | null
  pausedFrom: 'playing' | 'intermission' | null
  status: 'playing' | 'intermission' | 'paused' | 'closed'
}

export type RoundEndedEvent = {
  roomId: string; roundId: string; mode: Mode; word: string; startedAt: number; endedAt: number
  outcome: 'won' | 'timeout' | 'teamWin'; score?: number; winningTeam?: 'red' | 'blue' | 'draw'
  pixelsUsed: number; durationMs: number; contributorIds: string[]; finalGuesses: string[]
}
export type RoomStatusEvent = { roomId: string; status: RoomState['status']; playerCount: number; lastActiveAt: number; currentRoundId: string }
export type RoomEvent =
  | { type: 'pixel'; x: number; y: number; c: number; by: string }
  | { type: 'reject'; reason: RejectReason; retryAt?: number }
  | { type: 'judgement'; zone: ZoneId; guesses: string[]; confidence: number; matched: boolean }
  | { type: 'round'; round: RoundView }
  | { type: 'cleared' }
  | { type: 'ai_resting' }
  | { type: 'roundEnded'; event: RoundEndedEvent }
  | { type: 'roomStatus'; event: RoomStatusEvent }
export type RoomTransition = { state: RoomState; events: RoomEvent[] }

export function countPlayers(connections: Array<{ userId: string | null }>): number {
  return new Set(connections.map(connection => connection.userId).filter((id): id is string => id !== null)).size
}

export function newRoomState(init: { roomId: string; mode: Mode; isDefaultBoard: boolean }, now: number, rng: () => number): RoomState {
  const config = MODES[init.mode]
  const wordEntry = pickWord(rng, [])
  return {
    ...init, grid: createGrid(config.width, config.height), version: 0,
    round: { id: `${now}-0`, word: wordEntry.word, state: 'playing', startedAt: now, endsAt: now + config.capMs, askAvailableAt: now + JUDGE.askMinMs },
    wordEntry, recentWords: [wordEntry.word], roundCounter: 0, lastPlacedAt: {}, judgeCalls: [],
    lastJudgedVersion: 0, lastJudgedAt: now, judgeInFlight: false, emptySince: null,
    intermissionEndsAt: null, pausedAt: null, pausedFrom: null, status: 'playing',
  }
}

export function applyPlacement(s: RoomState, p: { x: number; y: number; c: number; userId: string | null }, now: number, playersConnected: number): RoomTransition {
  const valid = validatePlacement({ width: s.grid.width, height: s.grid.height, x: p.x, y: p.y, color: p.c, userId: p.userId, roundPlaying: s.status === 'playing' && s.round.state === 'playing', lastPlacedAt: p.userId === null ? undefined : s.lastPlacedAt[p.userId], now, playersConnected })
  if (!valid.ok) return { state: s, events: [{ type: 'reject', reason: valid.reason, ...(valid.retryAt === undefined ? {} : { retryAt: valid.retryAt }) }] }
  const grid = { ...s.grid, cells: s.grid.cells.slice(), placedBy: [...s.grid.placedBy] }
  const userId = p.userId!
  setPixel(grid, p.x, p.y, p.c, userId)
  return { state: { ...s, grid, version: s.version + 1, lastPlacedAt: { ...s.lastPlacedAt, [userId]: now } }, events: [{ type: 'pixel', x: p.x, y: p.y, c: p.c, by: userId }] }
}

export function shouldJudge(s: RoomState, now: number, signedInConnected: number, reason: 'tick' | 'ask'): { ok: true } | { ok: false; why: 'not_playing' | 'unchanged' | 'no_players' | 'too_soon' | 'rate_cap' } {
  if (s.status !== 'playing' || s.round.state !== 'playing') return { ok: false, why: 'not_playing' }
  if (s.version === s.lastJudgedVersion) return { ok: false, why: 'unchanged' }
  if (signedInConnected < 1) return { ok: false, why: 'no_players' }
  if (now - s.lastJudgedAt < (reason === 'tick' ? JUDGE.tickMs : JUDGE.askMinMs)) return { ok: false, why: 'too_soon' }
  if (s.judgeCalls.filter(time => time > now - 60000 && time <= now).length >= JUDGE.maxPerMinute) return { ok: false, why: 'rate_cap' }
  return { ok: true }
}

function endRound(s: RoomState, now: number, outcome: 'won' | 'timeout', guesses: string[]): RoomTransition {
  const used = pixelsUsed(s.grid)
  const durationMs = now - s.round.startedAt
  const score = outcome === 'won' ? coopScore({ pixelsUsed: used, totalCells: 1024, durationMs, capMs: MODES[s.mode].capMs }) : undefined
  const result: RoundView['result'] = score === undefined ? { outcome } : { outcome, score }
  const round: RoundView = { ...s.round, state: 'intermission', endedAt: now, result }
  const state: RoomState = { ...s, round, status: 'intermission', intermissionEndsAt: now + MODES[s.mode].intermissionMs }
  const event: RoundEndedEvent = { roomId: s.roomId, roundId: round.id, mode: s.mode, word: round.word, startedAt: round.startedAt, endedAt: now, outcome, ...(score === undefined ? {} : { score }), pixelsUsed: used, durationMs, contributorIds: contributors(s.grid), finalGuesses: guesses }
  return { state, events: [{ type: 'round', round }, { type: 'roundEnded', event }] }
}

export function applyJudgeOutcome(s: RoomState, outcome: JudgeOutcome, now: number): RoomTransition {
  if (outcome.kind === 'resting') return { state: s, events: [{ type: 'ai_resting' }] }
  if (outcome.kind !== 'judged' || s.status !== 'playing' || s.round.state !== 'playing') return { state: s, events: [] }
  const judgement: RoomEvent = { type: 'judgement', zone: outcome.zone, guesses: outcome.result.guesses, confidence: outcome.result.confidence, matched: outcome.matched }
  if (!outcome.matched) return { state: s, events: [judgement] }
  const ended = endRound(s, now, 'won', outcome.result.guesses)
  return { state: ended.state, events: [judgement, ...ended.events] }
}

export function startNextRound(s: RoomState, now: number, rng: () => number): RoomTransition {
  if (s.status !== 'playing' && s.status !== 'intermission') return { state: s, events: [] }
  const wordEntry = pickWord(rng, s.recentWords)
  const roundCounter = s.roundCounter + 1
  const round: RoundView = { id: `${now}-${roundCounter}`, word: wordEntry.word, state: 'playing', startedAt: now, endsAt: now + MODES[s.mode].capMs, askAvailableAt: now + JUDGE.askMinMs }
  const state: RoomState = { ...s, grid: createGrid(s.grid.width, s.grid.height), version: 0, lastJudgedVersion: 0, lastJudgedAt: now, wordEntry, recentWords: [...s.recentWords, wordEntry.word].slice(-10), roundCounter, round, status: 'playing', intermissionEndsAt: null, pausedAt: null, pausedFrom: null, emptySince: null }
  return { state, events: [{ type: 'cleared' }, { type: 'round', round }] }
}

function statusEvent(s: RoomState, now: number, playerCount: number): RoomEvent {
  return { type: 'roomStatus', event: { roomId: s.roomId, status: s.status, playerCount, lastActiveAt: now, currentRoundId: s.round.id } }
}

export function advance(s: RoomState, now: number, signedInConnected: number, rng: () => number): RoomTransition {
  if (!s.isDefaultBoard && s.status === 'paused' && s.emptySince !== null && now - s.emptySince >= ROOMS.closeAfterEmptyMs) {
    const state: RoomState = { ...s, status: 'closed' }
    return { state, events: [statusEvent(state, now, signedInConnected)] }
  }
  if (signedInConnected === 0 && (s.status === 'playing' || s.status === 'intermission')) {
    const state: RoomState = { ...s, pausedFrom: s.status, status: 'paused', pausedAt: now, emptySince: now, round: { ...s.round, state: 'paused' } }
    return { state, events: [statusEvent(state, now, 0)] }
  }
  if (s.status === 'paused' && signedInConnected > 0 && s.pausedAt !== null) {
    const elapsed = now - s.pausedAt
    if (elapsed > ROOMS.resumeWindowMs) {
      const next = startNextRound({ ...s, status: 'playing' }, now, rng)
      return { state: next.state, events: [...next.events, statusEvent(next.state, now, signedInConnected)] }
    }
    const restored = s.pausedFrom ?? 'playing'
    const round: RoundView = { ...s.round, state: restored, startedAt: s.round.startedAt + elapsed, endsAt: s.round.endsAt === null ? null : s.round.endsAt + elapsed, askAvailableAt: s.round.askAvailableAt + elapsed }
    const state: RoomState = { ...s, status: restored, round, intermissionEndsAt: s.intermissionEndsAt === null ? null : s.intermissionEndsAt + elapsed, lastJudgedAt: s.lastJudgedAt + elapsed, pausedAt: null, pausedFrom: null, emptySince: null }
    return { state, events: [{ type: 'round', round }, statusEvent(state, now, signedInConnected)] }
  }
  if (s.status === 'playing' && now >= s.round.startedAt + MODES[s.mode].capMs) return endRound(s, now, 'timeout', [])
  if (s.status === 'intermission' && s.intermissionEndsAt !== null && now >= s.intermissionEndsAt) return startNextRound(s, now, rng)
  return { state: s, events: [] }
}

export function nextAlarmAt(s: RoomState, now: number): number | null {
  const deadlines: number[] = []
  if (s.status === 'paused' && !s.isDefaultBoard && s.emptySince !== null) deadlines.push(s.emptySince + ROOMS.closeAfterEmptyMs)
  if (s.status === 'playing') {
    deadlines.push(s.round.startedAt + MODES[s.mode].capMs)
    if (s.version !== s.lastJudgedVersion && !s.judgeInFlight) {
      const calls = s.judgeCalls.filter(time => time > now - 60000 && time <= now).sort((a, b) => a - b)
      const rateReady = calls.length >= JUDGE.maxPerMinute ? calls[calls.length - JUDGE.maxPerMinute] + 60000 : now
      deadlines.push(Math.max(s.lastJudgedAt + JUDGE.tickMs, rateReady))
    }
  }
  if (s.status === 'intermission' && s.intermissionEndsAt !== null) deadlines.push(s.intermissionEndsAt)
  return deadlines.length ? Math.max(now, Math.min(...deadlines)) : null
}

export function serializeRoomState(s: RoomState): string {
  return JSON.stringify({ ...s, judgeInFlight: false, grid: { ...s.grid, cells: encodeCells(s.grid.cells) } })
}

export function deserializeRoomState(json: string): RoomState {
  const state = JSON.parse(json) as RoomState & { grid: { width: number; height: number; cells: string; placedBy: string[] } }
  return { ...state, judgeInFlight: false, grid: { ...state.grid, cells: decodeCells(state.grid.cells, state.grid.width * state.grid.height) } }
}
