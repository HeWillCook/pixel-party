import { describe, expect, it } from 'vitest'
import { JUDGE, MODES, ROOMS } from './config'
import { applyPlacements, applyJudgeOutcome, applyPlacement, advance, countPlayers, deserializeRoomState, newRoomState, nextAlarmAt, serializeRoomState, shouldJudge, startNextRound } from './room-logic'
import { WORDS } from './words'
import { createGrid } from './grid'

const room = () => newRoomState({ roomId: 'room', mode: 'coop', isDefaultBoard: false }, 1000, () => 0)
const judged = { kind: 'judged' as const, zone: 'all' as const, result: { guesses: ['house'], confidence: 0.9 }, matched: true }

describe('room logic', () => {
  it('counts distinct normalized signed-in identities', () => {
    expect(countPlayers([{ userId: null }, { userId: 'a' }, { userId: 'a' }, { userId: 'b' }])).toBe(2)
  })
  it('validates placement without mutating the input', () => {
    const original = room()
    const rejected = applyPlacement(original, { x: 1, y: 1, c: 2, userId: null }, 2000, 1)
    expect(rejected.events[0]).toMatchObject({ type: 'reject', reason: 'not_signed_in' })
    const placed = applyPlacement(original, { x: 1, y: 1, c: 2, userId: 'a' }, 2000, 1)
    expect(placed.events[0]).toMatchObject({ type: 'pixel', by: 'a' })
    expect(placed.state.grid.cells[33]).toBe(2)
    expect(original.grid.cells[33]).toBe(0)
    expect(placed.state.version).toBe(original.version + 1)
    expect(applyPlacement(placed.state, { x: 2, y: 1, c: 2, userId: 'a' }, 2001, 1).events[0]).toMatchObject({ type: 'pixel' })
  })
  it('gates judgements and permits retries after failed attempts', () => {
    const s = room()
    expect(shouldJudge(s, 20000, 1, 'tick')).toEqual({ ok: false, why: 'unchanged' })
    s.version++
    expect(shouldJudge(s, 20000, 0, 'tick')).toEqual({ ok: false, why: 'no_players' })
    expect(shouldJudge(s, 6000, 1, 'ask')).toEqual({ ok: false, why: 'too_soon' })
    expect(shouldJudge(s, 16000, 1, 'tick')).toEqual({ ok: true })
    s.judgeCalls = [10000, 10001, 10002, 10003, 10004, 10005]
    expect(shouldJudge(s, 20000, 1, 'tick')).toEqual({ ok: false, why: 'rate_cap' })
    s.status = 'intermission'
    expect(shouldJudge(s, 20000, 1, 'tick')).toEqual({ ok: false, why: 'not_playing' })
  })
  it('round-trips grid, authors, cooldowns, calls and word entry, clearing in-flight', () => {
    const s = applyPlacement(room(), { x: 3, y: 2, c: 4, userId: 'a' }, 2000, 1).state
    s.judgeCalls = [3000]; s.judgeInFlight = true
    expect(deserializeRoomState(serializeRoomState(s))).toEqual({ ...s, judgeInFlight: false })
  })
  it('pauses and resumes with frozen timers', () => {
    const s = room()
    const paused = advance(s, 2000, 0, () => 0)
    expect(paused.state).toMatchObject({ status: 'paused', pausedAt: 2000, emptySince: 2000 })
    expect(paused.events).toContainEqual(expect.objectContaining({ type: 'roomStatus' }))
    const resumed = advance(paused.state, 5000, 1, () => 0)
    expect(resumed.state.round.startedAt).toBe(s.round.startedAt + 3000)
    expect(resumed.state.round.endsAt).toBe(s.round.endsAt! + 3000)
    expect(resumed.state.status).toBe('playing')
    expect(s.status).toBe('playing')
  })
  it('closes empty non-default rooms and leaves default rooms unscheduled', () => {
    const paused = advance(room(), 2000, 0, () => 0).state
    expect(nextAlarmAt(paused, 2000)).toBe(2000 + ROOMS.closeAfterEmptyMs)
    expect(advance(paused, 2000 + ROOMS.closeAfterEmptyMs, 0, () => 0).state.status).toBe('closed')
    expect(nextAlarmAt({ ...paused, isDefaultBoard: true }, 2000)).toBeNull()
  })
  it('starts a fresh round after a long pause', () => {
    const paused = advance(room(), 2000, 0, () => 0).state
    const resumed = advance(paused, 2001 + ROOMS.resumeWindowMs, 1, () => 0)
    expect(resumed.state.round.id).not.toBe(paused.round.id)
    expect(resumed.state.round.word).not.toBe(paused.round.word)
    expect(resumed.state.status).toBe('playing')
  })
  it('resumes an intermission with its deadline shifted', () => {
    const ended = applyJudgeOutcome(room(), judged, 4000).state
    const paused = advance(ended, 5000, 0, () => 0).state
    const resumed = advance(paused, 8000, 1, () => 0).state
    expect(resumed.status).toBe('intermission')
    expect(resumed.intermissionEndsAt).toBe(15000)
    expect(resumed.round.state).toBe('intermission')
  })
  it('times out and starts a new round excluding recent words', () => {
    const s = room()
    const timeout = advance(s, s.round.startedAt + 300000, 1, () => 0)
    expect(timeout.state.round.result?.outcome).toBe('timeout')
    expect(timeout.events).toContainEqual(expect.objectContaining({ type: 'roundEnded' }))
    const next = advance(timeout.state, timeout.state.intermissionEndsAt!, 1, () => 0)
    expect(next.state.round.word).not.toBe(s.round.word)
    expect(next.events).toContainEqual({ type: 'cleared' })
    expect(startNextRound(next.state, 400000, () => 0).state.round.id).not.toBe(next.state.round.id)
  })
  it('scores wins and includes contributors and final guesses', () => {
    const s = applyPlacement(room(), { x: 1, y: 1, c: 2, userId: 'a' }, 2000, 1).state
    const result = applyJudgeOutcome(s, judged, 4000)
    expect(result.state.round.result).toEqual({ outcome: 'won', score: 995, contributorCount: 1 })
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'roundEnded', event: expect.objectContaining({ contributorIds: ['a'], finalGuesses: ['house'], pixelsUsed: 1 }) }))
    expect(result.state.intermissionEndsAt).toBe(12000)
    expect(s.status).toBe('playing')
  })
  it('schedules the earliest pending deadline', () => {
    const s = room(); s.version++
    expect(nextAlarmAt(s, 2000)).toBe(1000 + JUDGE.tickMs)
    expect(nextAlarmAt(s, 20000)).toBe(20000)
  })
  it('resumes at the exact window and does not close one millisecond early', () => {
    const paused = advance(room(), 2000, 0, () => 0).state
    const resumed = advance(paused, 2000 + ROOMS.resumeWindowMs, 1, () => 0).state
    expect(resumed.round.id).toBe(paused.round.id)
    expect(resumed.round.startedAt).toBe(paused.round.startedAt + ROOMS.resumeWindowMs)
    expect(advance(paused, 2000 + ROOMS.closeAfterEmptyMs - 1, 0, () => 0).state.status).toBe('paused')
  })
  it('resumes a player arriving after the empty close deadline', () => {
    const paused = advance(room(), 2000, 0, () => 0).state
    const resumed = advance(paused, 2000 + ROOMS.closeAfterEmptyMs, 1, () => 0)
    expect(resumed.state.status).toBe('playing')
    expect(resumed.state.round.id).not.toBe(paused.round.id)
  })
  it('expires calls exactly at the 60 second window boundary', () => {
    const state = room(); state.version = 1; state.judgeCalls = [10000, 10001, 10002, 10003, 10004, 10005]
    expect(shouldJudge(state, 69999, 1, 'tick')).toEqual({ ok: false, why: 'rate_cap' })
    expect(nextAlarmAt(state, 69999)).toBe(70000)
    expect(shouldJudge(state, 70000, 1, 'tick')).toEqual({ ok: true })
    expect(nextAlarmAt(state, 70000)).toBe(70000)
  })
  it('records the last writer per cell and keeps cooldowns per user', () => {
    const original = room()
    const first = applyPlacement(original, { x: 0, y: 0, c: 1, userId: 'a' }, 2000, 2).state
    const second = applyPlacement(first, { x: 0, y: 0, c: 2, userId: 'b' }, 2001, 2).state
    expect(second.grid.cells[0]).toBe(2)
    expect(second.grid.placedBy[0]).toBe('b')
    expect(second.version).toBe(original.version + 2)
    expect(applyPlacement(second, { x: 1, y: 0, c: 1, userId: 'a' }, 2002, 2).events[0]).toMatchObject({ reason: 'cooldown' })
    expect(applyPlacement(second, { x: 1, y: 0, c: 1, userId: 'c' }, 2002, 2).events[0]).toMatchObject({ type: 'pixel' })
  })
  it('prunes placement timestamps older than the maximum cooldown on a successful write', () => {
    const state = room(); state.lastPlacedAt = { old: 9999, boundary: 10000, recent: 19999 }
    const next = applyPlacement(state, { x: 0, y: 0, c: 1, userId: 'new' }, 20000, 1).state
    expect(next.lastPlacedAt).toEqual({ boundary: 10000, recent: 19999, new: 20000 })
    expect(state.lastPlacedAt.old).toBe(9999)
  })
  it('excludes all ten recent words and retains only ten', () => {
    const state = room(); state.recentWords = WORDS.slice(0, 10).map(entry => entry.word)
    const next = startNextRound(state, 2000, () => 0).state
    expect(state.recentWords).not.toContain(next.round.word)
    expect(next.recentWords).toHaveLength(10)
    expect(next.recentWords.at(-1)).toBe(next.round.word)
  })
  it('preserves last guesses for a timeout and clears them for the next round', () => {
    const s = room()
    const seen = applyJudgeOutcome(s, { ...judged, result: { guesses: ['tree', 'plant'], confidence: 0.2 }, matched: false }, 3000).state
    expect(seen.lastGuesses).toEqual(['tree', 'plant'])
    const timeout = advance(seen, s.round.startedAt + MODES.coop.capMs, 1, () => 0)
    expect(timeout.events).toContainEqual(expect.objectContaining({ type: 'roundEnded', event: expect.objectContaining({ finalGuesses: ['tree', 'plant'] }) }))
    expect(startNextRound(timeout.state, 400000, () => 0).state.lastGuesses).toEqual([])
  })
  it('uses grid size for score and the winning judgement for final guesses', () => {
    const s = room(); s.grid = createGrid(2, 2)
    const placed = applyPlacement(s, { x: 0, y: 0, c: 1, userId: 'a' }, 2000, 1).state
    const result = applyJudgeOutcome(placed, judged, 1000)
    expect(result.state.round.result?.score).toBe(875)
    expect(result.state.lastGuesses).toEqual(['house'])
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'roundEnded', event: expect.objectContaining({ finalGuesses: ['house'] }) }))
  })
})

describe('solo placement abuse cap', () => {
  it('accepts a solid stroke instantly, caps bursts, persists and refills per user', () => {
    const cells = Array.from({ length: 64 }, (_, i) => ({ x: i % 32, y: Math.floor(i / 32), c: 4 }))
    const original = room()
    const batch = applyPlacements(original, cells, 'solo', 2000, 1)
    expect(batch.events.filter(event => event.type === 'pixel')).toHaveLength(60)
    expect(batch.events.filter(event => event.type === 'reject')).toHaveLength(4)
    expect(batch.events.at(-1)).toMatchObject({ reason: 'rate_limited', x: 31, y: 1 })
    const restored = deserializeRoomState(serializeRoomState(batch.state))
    expect(applyPlacement(restored, { ...cells[0], userId: 'solo' }, 2000, 1).events[0]).toMatchObject({ reason: 'rate_limited' })
    expect(applyPlacement(restored, { ...cells[0], userId: 'solo' }, 2017, 1).events[0].type).toBe('pixel')
    expect(applyPlacement(restored, { ...cells[0], userId: 'other' }, 2000, 1).events[0].type).toBe('pixel')
    expect(original.version).toBe(0)
  })
  it('keeps multiplayer cooldown within a batch', () => {
    const batch = applyPlacements(room(), [{ x: 0, y: 0, c: 4 }, { x: 1, y: 0, c: 4 }], 'a', 2000, 2)
    expect(batch.events.map(event => event.type)).toEqual(['pixel', 'reject'])
    expect(batch.events[1]).toMatchObject({ reason: 'cooldown', retryAt: 4000, x: 1, y: 0 })
  })
})

describe('private waiting room', () => {
  const lobby = () => newRoomState({ roomId: 'private', mode: 'coop', isDefaultBoard: false, startsInLobby: true }, 1000, () => 0)
  it('has no word or timer, refuses painting and judging, and starts on command', () => {
    const state = lobby()
    expect(state.status).toBe('lobby')
    expect(state.round).toMatchObject({ state: 'lobby', word: '', endsAt: null })
    expect(applyPlacement(state, { x: 0, y: 0, c: 4, userId: 'a' }, 2000, 1).events[0]).toMatchObject({ reason: 'round_inactive' })
    expect(shouldJudge({ ...state, version: 1 }, 20000, 1, 'tick')).toEqual({ ok: false, why: 'not_playing' })
    expect(advance(state, 900000, 1, () => 0).state.status).toBe('lobby')
    const started = startNextRound(state, 2000, () => 0)
    expect(started.state.round).toMatchObject({ state: 'playing', startedAt: 2000, endsAt: 302000 })
    expect(started.state.round.word).not.toBe('')
    expect(started.events).toContainEqual({ type: 'cleared' })
  })
  it('closes after the empty timeout, resets it on reconnect and never auto-starts', () => {
    const empty = advance(lobby(), 2000, 0, () => 0).state
    expect(empty.status).toBe('lobby')
    expect(nextAlarmAt(empty, 2000)).toBe(2000 + ROOMS.closeAfterEmptyMs)
    const joined = advance(empty, 3000, 1, () => 0).state
    expect(joined.emptySince).toBeNull()
    expect(nextAlarmAt(joined, 3000)).toBeNull()
    const left = advance(joined, 4000, 0, () => 0).state
    expect(advance(left, 4000 + ROOMS.closeAfterEmptyMs - 1, 0, () => 0).state.status).toBe('lobby')
    expect(advance(left, 4000 + ROOMS.closeAfterEmptyMs, 0, () => 0).state.status).toBe('closed')
    expect(room().status).toBe('playing')
  })
})
