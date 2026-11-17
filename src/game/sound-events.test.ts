import { describe, expect, it } from 'vitest'
import { initialClientState } from './client-state'
import type { RoundView } from './protocol'
import { countdownTickSecond, createCountdownGate, soundEventsFor } from './sound-events'

const round: RoundView = { id: 'r1', word: 'cat', state: 'playing', startedAt: 0, endsAt: 10000, askAvailableAt: 0 }
const loaded = { ...initialClientState(), snapshotLoaded: true, round }
const entry = { id: 1, atMs: 0, guesses: ['cat'], matched: false }

describe('sound events', () => {
  it('plays a new non-matching guess when the log rolls over', () => {
    const log = Array.from({ length: 50 }, (_, index) => ({ ...entry, id: 50 - index }))
    expect(soundEventsFor({ ...loaded, guessLog: log }, { ...loaded, guessLog: [{ ...entry, id: 51 }, ...log.slice(0, 49)] })).toEqual(['guess'])
  })
  it('silences loading and reconnects and resets the countdown baseline for snapshots', () => {
    const tick = createCountdownGate()
    const live = { ...loaded, connected: true, snapshotSeq: 1 }
    expect(tick(live, 5000)).toBe(false)
    expect(tick(live, 6000)).toBe(true)
    expect(tick({ ...live, connected: false }, 7000)).toBe(false)
    expect(tick({ ...live, snapshotLoaded: false }, 7000)).toBe(false)
    expect(tick({ ...live, snapshotSeq: 2 }, 7000)).toBe(false)
    expect(tick({ ...live, snapshotSeq: 2 }, 8000)).toBe(true)
  })
  it('returns nothing on the first snapshot or a new round id', () => {
    expect(soundEventsFor(initialClientState(), { ...loaded, guessLog: [entry] })).toEqual([])
    expect(soundEventsFor(loaded, { ...loaded, round: { ...round, id: 'r2' }, guessLog: [entry] })).toEqual([])
  })
  it('returns guess when a non-matched log entry is added', () => {
    expect(soundEventsFor(loaded, { ...loaded, guessLog: [entry] })).toEqual(['guess'])
    expect(soundEventsFor(loaded, { ...loaded, guessLog: [{ ...entry, matched: true }] })).toEqual([])
  })
  it('returns only win, not guess, when a matched judgement ends the round', () => {
    for (const outcome of ['won', 'teamWin'] as const) {
      expect(soundEventsFor(loaded, { ...loaded, guessLog: [{ ...entry, matched: true }], round: { ...round, state: 'intermission', result: { outcome, score: 1 } } })).toEqual(['win'])
    }
  })
  it('returns timeout when playing ends with outcome timeout', () => {
    expect(soundEventsFor(loaded, { ...loaded, round: { ...round, state: 'intermission', result: { outcome: 'timeout', score: 0 } } })).toEqual(['timeout'])
    expect(soundEventsFor(loaded, { ...loaded, guessLog: [entry], round: { ...round, state: 'intermission', result: { outcome: 'timeout', score: 0 } } })).toEqual(['guess', 'timeout'])
  })
  it('returns nothing when joining a room already in intermission', () => {
    expect(soundEventsFor(initialClientState(), { ...loaded, round: { ...round, state: 'intermission', result: { outcome: 'won', score: 1 } } })).toEqual([])
  })
  it("returns nothing when a reconnect snapshot lands in the same round's intermission", () => {
    const prev = { ...loaded, snapshotSeq: 1 }
    for (const outcome of ['won', 'timeout'] as const) {
      const next = { ...loaded, snapshotSeq: 2, round: { ...round, state: 'intermission' as const, result: { outcome, score: 1 } } }
      expect(soundEventsFor(prev, next)).toEqual([])
    }
  })
  it('countdownTickSecond gives 5..1 in the last five seconds and null otherwise', () => {
    expect([5000, 6000, 7000, 8000, 9000].map(now => countdownTickSecond(round, now))).toEqual([5, 4, 3, 2, 1])
    expect(countdownTickSecond(round, 4999)).toBeNull()
    expect(countdownTickSecond(round, 10000)).toBeNull()
    expect(countdownTickSecond({ ...round, state: 'paused' }, 9000)).toBeNull()
    expect(countdownTickSecond({ ...round, endsAt: null }, 9000)).toBeNull()
    expect(countdownTickSecond(null, 9000)).toBeNull()
  })
})
