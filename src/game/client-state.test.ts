import { describe, expect, it } from 'vitest'
import { encodeCells } from './grid'
import type { RoundView, ServerMsg } from './protocol'
import {
  roomAccessView,
  applyConnectError,
  applyOptimisticPlace,
  applyServerMsg,
  clearLastReject,
  initialClientState,
  statusToConnectError,
} from './client-state'

function makeRound(id: string, word = 'mushroom'): RoundView {
  return {
    id,
    word,
    state: 'playing',
    startedAt: 1000,
    endsAt: 301000,
    askAvailableAt: 11000,
  }
}

describe('client-state', () => {
  it('appends a judgement with new guesses newest-first, stamped with round-relative ms', () => {
    let state = applyServerMsg(initialClientState(), { t: 'round', round: makeRound('r1') })
    state = applyServerMsg(state, { t: 'judgement', zone: 'all', guesses: ['tower', 'rocket'], confidence: 0.5, matched: false }, 16000)
    expect(state.guessLog[0]).toMatchObject({ atMs: 15000, guesses: ['tower', 'rocket'], matched: false })
    const firstId = state.guessLog[0].id
    state = applyServerMsg(state, { t: 'judgement', zone: 'all', guesses: ['castle'], confidence: 0.5, matched: false }, 500)
    expect(state.guessLog.map(entry => entry.guesses)).toEqual([['castle'], ['tower', 'rocket']])
    expect(state.guessLog[0].atMs).toBe(0)
    expect(state.guessLog[0].id).toBeGreaterThan(firstId)
  })

  it('ignores a judgement that repeats already-logged guesses', () => {
    let state = applyServerMsg(initialClientState(), { t: 'judgement', zone: 'all', guesses: ['tower'], confidence: 0.5, matched: false }, 100)
    expect(state.guessLog[0].atMs).toBe(0)
    state = applyServerMsg(state, { t: 'judgement', zone: 'all', guesses: ['rocket'], confidence: 0.5, matched: false }, 100)
    state = applyServerMsg(state, { t: 'judgement', zone: 'all', guesses: [' ROCKET ', ' Tower '], confidence: 0.8, matched: false }, 100)
    expect(state.guessLog).toHaveLength(2)
    expect(state.guesses.all?.confidence).toBe(0.8)
    state = applyServerMsg(state, { t: 'judgement', zone: 'all', guesses: ['tower'], confidence: 1, matched: true }, 100)
    expect(state.guessLog).toHaveLength(3)
    expect(state.guessLog[0].matched).toBe(true)
    state = applyServerMsg(state, { t: 'judgement', zone: 'all', guesses: ['TOWER'], confidence: 1, matched: true }, 100)
    expect(state.guessLog).toHaveLength(3)
  })

  it('clears the log on a new round id and keeps it on a same-round snapshot (reconnect)', () => {
    const round = makeRound('r1')
    const snapshot = { t: 'snapshot' as const, mode: 'coop' as const, width: 32, height: 32, cells: encodeCells(new Uint8Array(32 * 32)), round, you: { userId: null }, players: 1, aiResting: false }
    let state = applyServerMsg(initialClientState(), { t: 'round', round })
    state = applyServerMsg(state, { t: 'judgement', zone: 'all', guesses: ['tower'], confidence: 0.5, matched: false })
    state = applyServerMsg(state, { t: 'round', round })
    state = applyServerMsg(state, snapshot)
    expect(state.guessLog).toHaveLength(1)
    expect(state.guessLogRoundId).toBe('r1')
    state = applyServerMsg(state, { t: 'judgement', zone: 'all', guesses: ['tower'], confidence: 0.5, matched: false })
    expect(state.guessLog).toHaveLength(1)
    state = applyServerMsg(state, { ...snapshot, round: makeRound('r2') })
    expect(state.guessLog).toEqual([])
    expect(state.guessLogRoundId).toBe('r2')
    state = applyServerMsg(state, { t: 'judgement', zone: 'all', guesses: ['rocket'], confidence: 0.5, matched: false })
    state = applyServerMsg(state, { t: 'round', round: makeRound('r3') })
    expect(state.guessLog).toEqual([])
    expect(state.guessLogRoundId).toBe('r3')
  })

  it('seeds the feed and latest guess from the snapshot a late joiner receives', () => {
    const snapshot = { t: 'snapshot' as const, mode: 'coop' as const, width: 32, height: 32, cells: encodeCells(new Uint8Array(32 * 32)), round: makeRound('r1'), you: { userId: null }, players: 2, aiResting: false }
    const judgements = [
      { zone: 'all' as const, guesses: ['bird', 'moth'], confidence: 0.4, matched: false, at: 31000 },
      { zone: 'all' as const, guesses: ['dragon'], confidence: 0.6, matched: false, at: 61000 },
    ]
    let state = applyServerMsg(initialClientState(), { ...snapshot, judgements })
    expect(state.guessLog.map(entry => entry.guesses)).toEqual([['dragon'], ['bird', 'moth']])
    expect(state.guessLog[0].atMs).toBe(60000)
    expect(state.guesses.all).toMatchObject({ guesses: ['dragon'], confidence: 0.6 })
    // A same-round reconnect keeps the log it has rather than replaying the snapshot's copy on top of it.
    state = applyServerMsg(state, { ...snapshot, judgements })
    expect(state.guessLog).toHaveLength(2)
    // A new round starts blank even if the server still lists the old round's judgements.
    state = applyServerMsg(state, { ...snapshot, round: makeRound('r2'), judgements: [] })
    expect(state.guessLog).toEqual([])
  })

  it('increments snapshotSeq for each snapshot', () => {
    const snapshot = { t: 'snapshot' as const, mode: 'coop' as const, width: 32, height: 32, cells: encodeCells(new Uint8Array(32 * 32)), round: makeRound('r1'), you: { userId: null }, players: 1, aiResting: false }
    let state = initialClientState()
    expect(state.snapshotSeq).toBe(0)
    state = applyServerMsg(state, snapshot)
    expect(state.snapshotSeq).toBe(1)
    state = applyServerMsg(state, snapshot)
    expect(state.snapshotSeq).toBe(2)
  })

  it('caps the log at 50 entries', () => {
    let state = initialClientState()
    for (let index = 0; index < 55; index++) {
      state = applyServerMsg(state, { t: 'judgement', zone: 'all', guesses: [`guess ${index}`], confidence: 0.5, matched: false }, index)
    }
    expect(state.guessLog).toHaveLength(50)
    expect(state.guessLog[0].guesses).toEqual(['guess 54'])
    expect(state.guessLog[49].guesses).toEqual(['guess 5'])
    expect(state.guessLog[0].id).toBeGreaterThan(state.guessLog[49].id)
  })

  it('stores watching from players and snapshot, defaulting to 0', () => {
    let state = initialClientState()
    expect(state.watching).toBe(0)
    state = applyServerMsg(state, { t: 'players', count: 1, watching: 2 })
    expect(state.watching).toBe(2)
    state = applyServerMsg(state, { t: 'players', count: 1 })
    expect(state.watching).toBe(0)
    const snapshot = {
      t: 'snapshot' as const, mode: 'coop' as const, width: 32, height: 32,
      cells: encodeCells(new Uint8Array(32 * 32)), round: makeRound('r1'),
      you: { userId: null }, players: 1, aiResting: false,
    }
    state = applyServerMsg(state, { ...snapshot, watching: 3 })
    expect(state.watching).toBe(3)
    state = applyServerMsg(state, snapshot)
    expect(state.watching).toBe(0)
  })

  it('initialClientState returns default 32x32 coop state', () => {
    const s = initialClientState()
    expect(s.connected).toBe(false)
    expect(s.snapshotLoaded).toBe(false)
    expect(s.connectError).toBeNull()
    expect(s.mode).toBe('coop')
    expect(s.width).toBe(32)
    expect(s.height).toBe(32)
    expect(s.cells.length).toBe(32 * 32)
    expect(s.pending.size).toBe(0)
    expect(s.round).toBeNull()
    expect(s.players).toBe(0)
    expect(s.you).toEqual({ userId: null })
    expect(s.aiResting).toBe(false)
    expect(s.lastReject).toBeNull()
  })

  it('applyOptimisticPlace updates cell and records original previous colour in pending', () => {
    const s0 = initialClientState()
    const s1 = applyOptimisticPlace(s0, 5, 10, 4)
    const idx = 10 * 32 + 5
    expect(s1.cells[idx]).toBe(4)
    expect(s1.pending.get(idx)).toBe(0)

    // Second optimistic place on same cell before server ack preserves original colour (0)
    const s2 = applyOptimisticPlace(s1, 5, 10, 7)
    expect(s2.cells[idx]).toBe(7)
    expect(s2.pending.get(idx)).toBe(0)
  })

  it('snapshot replaces cells, clears pending, and clears connectError (Review Focus 1)', () => {
    let s = initialClientState()
    s = applyConnectError(s, 'unauthorized')
    s = applyOptimisticPlace(s, 2, 3, 5)
    expect(s.pending.size).toBe(1)

    const rawCells = new Uint8Array(32 * 32)
    rawCells[0] = 9
    rawCells[3 * 32 + 2] = 1
    const msg: ServerMsg = {
      t: 'snapshot',
      mode: 'coop',
      width: 32,
      height: 32,
      cells: encodeCells(rawCells),
      round: makeRound('r1'),
      you: { userId: 'user-1' },
      players: 3,
      aiResting: false,
    }

    const next = applyServerMsg(s, msg)
    expect(next.snapshotLoaded).toBe(true)
    expect(next.connectError).toBeNull()
    expect(next.pending.size).toBe(0)
    expect(next.cells[0]).toBe(9)
    expect(next.cells[3 * 32 + 2]).toBe(1)
    expect(next.you).toEqual({ userId: 'user-1' })
    expect(next.players).toBe(3)
    expect(next.round?.id).toBe('r1')
  })

  it('pixel for a pending cell (from self or another user) removes it from pending (M4)', () => {
    let s = initialClientState()
    const rawCells = new Uint8Array(32 * 32)
    s = applyServerMsg(s, {
      t: 'snapshot',
      mode: 'coop',
      width: 32,
      height: 32,
      cells: encodeCells(rawCells),
      round: makeRound('r1'),
      you: { userId: 'user-1' },
      players: 1,
      aiResting: false,
    })

    s = applyOptimisticPlace(s, 4, 6, 12)
    s = applyOptimisticPlace(s, 5, 6, 10)
    const idx1 = 6 * 32 + 4
    const idx2 = 6 * 32 + 5
    expect(s.pending.has(idx1)).toBe(true)
    expect(s.pending.has(idx2)).toBe(true)

    // Pixel from another player on a different cell leaves pending intact
    s = applyServerMsg(s, { t: 'pixel', x: 0, y: 0, c: 3, by: 'user-2' })
    expect(s.cells[0]).toBe(3)
    expect(s.pending.has(idx1)).toBe(true)

    // Pixel from another player on a pending cell overwrites it and removes its stale pending entry
    s = applyServerMsg(s, { t: 'pixel', x: 5, y: 6, c: 14, by: 'user-2' })
    expect(s.cells[idx2]).toBe(14)
    expect(s.pending.has(idx2)).toBe(false)

    // Pixel from self on the remaining pending cell confirms it and removes from pending
    s = applyServerMsg(s, { t: 'pixel', x: 4, y: 6, c: 12, by: 'user-1' })
    expect(s.cells[idx1]).toBe(12)
    expect(s.pending.has(idx1)).toBe(false)
  })

  it('reject restores only the rejected pending cell in FIFO order and keeps rate limits silent', () => {
    let s = initialClientState()
    const rawCells = new Uint8Array(32 * 32)
    rawCells[2 * 32 + 1] = 8 // existing dark green pixel at (1, 2)
    rawCells[3 * 32 + 1] = 6 // existing yellow pixel at (1, 3)
    s = applyServerMsg(s, {
      t: 'snapshot',
      mode: 'coop',
      width: 32,
      height: 32,
      cells: encodeCells(rawCells),
      round: makeRound('r1'),
      you: { userId: 'user-1' },
      players: 1,
      aiResting: false,
    })

    const idxA = 2 * 32 + 1
    const idxB = 3 * 32 + 1
    s = applyOptimisticPlace(s, 1, 2, 4) // paint red over dark green
    s = applyOptimisticPlace(s, 1, 3, 9) // paint cyan over yellow
    expect(s.cells[idxA]).toBe(4)
    expect(s.cells[idxB]).toBe(9)
    expect(s.pending.size).toBe(2)

    // First reject rolls back only the first pending cell (idxA), leaving idxB pending.
    // A pace limit is part of a drag: the cell goes back, but no error banner appears.
    s = applyServerMsg(s, { t: 'reject', reason: 'rate_limited', retryAt: 2500 })
    expect(s.cells[idxA]).toBe(8)
    expect(s.cells[idxB]).toBe(9)
    expect(s.pending.size).toBe(1)
    expect(s.pending.has(idxB)).toBe(true)
    expect(s.lastReject).toBeNull()

    // A real rejection still rolls back and is surfaced.
    s = applyServerMsg(s, { t: 'reject', reason: 'round_inactive' })
    expect(s.cells[idxB]).toBe(6)
    expect(s.pending.size).toBe(0)
    expect(s.lastReject).toEqual({ t: 'reject', reason: 'round_inactive' })

    // clearLastReject clears lastReject
    s = clearLastReject(s)
    expect(s.lastReject).toBeNull()
  })

  it('judgement stores per-zone guesses', () => {
    let s = initialClientState()
    s = applyServerMsg(s, {
      t: 'judgement',
      zone: 'all',
      guesses: ['mushroom', 'toadstool', 'umbrella'],
      confidence: 0.85,
      matched: true,
    })
    expect(s.guesses.all).toEqual({
      guesses: ['mushroom', 'toadstool', 'umbrella'],
      confidence: 0.85,
      matched: true,
    })
  })

  it('round with a new id clears guesses, while same round id preserves guesses', () => {
    let s = initialClientState()
    s = applyServerMsg(s, {
      t: 'round',
      round: makeRound('r1', 'mushroom'),
    })
    s = applyServerMsg(s, {
      t: 'judgement',
      zone: 'all',
      guesses: ['cap', 'stem'],
      confidence: 0.4,
      matched: false,
    })
    expect(s.guesses.all?.guesses).toEqual(['cap', 'stem'])

    // Same round id (e.g., askAvailableAt or state transition to intermission) preserves guesses
    s = applyServerMsg(s, {
      t: 'round',
      round: { ...makeRound('r1', 'mushroom'), state: 'intermission', result: { outcome: 'won', contributorCount: 2 } },
    })
    expect(s.guesses.all?.guesses).toEqual(['cap', 'stem'])

    // New round id clears guesses
    s = applyServerMsg(s, {
      t: 'round',
      round: makeRound('r2', 'lighthouse'),
    })
    expect(s.guesses).toEqual({})
    expect(s.round?.id).toBe('r2')
    expect(s.round?.word).toBe('lighthouse')
  })

  it('handles players, ai_resting, and terminal connectError transitions (I2)', () => {
    let s = initialClientState()
    s = applyServerMsg(s, { t: 'players', count: 5 })
    expect(s.players).toBe(5)

    s = applyServerMsg(s, { t: 'ai_resting' })
    expect(s.aiResting).toBe(true)

    expect(statusToConnectError(401)).toBe('unauthorized')
    expect(statusToConnectError(404)).toBe('not_found')
    expect(statusToConnectError(410)).toBe('closed')
    expect(statusToConnectError(503)).toBeNull()
    expect(statusToConnectError(400)).toBeNull()

    s = applyConnectError(s, 'not_found')
    expect(s.connectError).toBe('not_found')
    expect(s.connected).toBe(false)
  })
})

it('hides all room content until an authorized snapshot and prioritizes terminal errors', () => {
  const initial = initialClientState()
  expect(roomAccessView(initial)).toBe('loading')
  expect(roomAccessView({ ...initial, connected: true })).toBe('loading')
  expect(roomAccessView({ ...initial, snapshotLoaded: true })).toBe('room')
  for (const connectError of ['unauthorized', 'not_found', 'closed'] as const) {
    expect(roomAccessView({ ...initial, snapshotLoaded: true, connectError })).toBe(connectError)
  }
})

it('rolls back only the rejected batch cell, keeping accepted and later optimistic cells', () => {
  let state = applyOptimisticPlace(initialClientState(), 0, 0, 4)
  state = applyOptimisticPlace(state, 1, 0, 4)
  state = applyOptimisticPlace(state, 2, 0, 4)
  state = applyServerMsg(state, { t: 'pixel', x: 0, y: 0, c: 4, by: 'a' })
  state = applyServerMsg(state, { t: 'reject', reason: 'rate_limited', retryAt: 1017, x: 1, y: 0 })
  expect([...state.cells.slice(0, 3)]).toEqual([4, 0, 4])
  expect([...state.pending.keys()]).toEqual([2])
  // A pace limit never becomes a visible error mid-drag.
  expect(state.lastReject).toBeNull()
})

it('host closure clears authorized board state and uses the terminal screen', () => {
  const state = { ...initialClientState(), snapshotLoaded: true, connected: true }
  const closed = applyServerMsg(state, { t: 'closed' })
  expect(closed.snapshotLoaded).toBe(false)
  expect(closed.round).toBeNull()
  expect(roomAccessView(closed)).toBe('closed')
})

it('matching noop clears the pending empty erase and leaves the canvas alone', () => {
  const rawCells = new Uint8Array(32 * 32)
  const idx = 5 * 32 + 4
  rawCells[idx] = 6
  let s = applyServerMsg(initialClientState(), {
    t: 'snapshot',
    mode: 'coop',
    width: 32,
    height: 32,
    cells: encodeCells(rawCells),
    round: makeRound('r1'),
    you: { userId: 'user-a' },
    players: 2,
    aiResting: false,
  })

  // Optimistic erase of an already-empty cell, then the server says nothing changed.
  s = applyOptimisticPlace(s, 4, 5, 0, { id: 1 })
  expect(s.pending.has(idx)).toBe(true)
  s = applyServerMsg(s, { t: 'noop', x: 4, y: 5, id: 1 })
  expect(s.pending.has(idx)).toBe(false)
  expect(s.cells[idx]).toBe(0)

  // A peer's pixel resolves the pending entry first; a later noop changes nothing.
  s = applyOptimisticPlace(s, 4, 5, 0, { id: 2 })
  s = applyServerMsg(s, { t: 'pixel', x: 4, y: 5, c: 0, by: 'user-b' })
  expect(s.pending.has(idx)).toBe(false)
  s = applyServerMsg(s, { t: 'noop', x: 4, y: 5, id: 2 })
  expect(s.cells[idx]).toBe(0)
})

it('stale noops never touch a newer pending placement', () => {
  const rawCells = new Uint8Array(32 * 32)
  rawCells[5 * 32 + 4] = 6
  let s = applyServerMsg(initialClientState(), {
    t: 'snapshot',
    mode: 'coop',
    width: 32,
    height: 32,
    cells: encodeCells(rawCells),
    round: makeRound('r1'),
    you: { userId: 'user-a' },
    players: 2,
    aiResting: false,
  })

  s = applyOptimisticPlace(s, 4, 5, 0, { id: 1 })
  s = applyOptimisticPlace(s, 6, 6, 4, { id: 2 })
  s = applyServerMsg(s, { t: 'noop', x: -1, y: -1, id: 1 })
  s = applyServerMsg(s, { t: 'noop', x: 4, y: 5, id: 1 })
  expect(s.pending.has(6 * 32 + 6)).toBe(true)
  // The untagged noop is not ours: it must not settle the newer pending cell either.
  s = applyServerMsg(s, { t: 'noop', x: 6, y: 6 })
  expect(s.pending.has(6 * 32 + 6)).toBe(true)
})

it('noop clears only its own pending entry', () => {
  const rawCells = new Uint8Array(32 * 32)
  const idx = 5 * 32 + 4
  rawCells[idx] = 6
  let s = applyServerMsg(initialClientState(), {
    t: 'snapshot',
    mode: 'coop',
    width: 32,
    height: 32,
    cells: encodeCells(rawCells),
    round: makeRound('r1'),
    you: { userId: 'user-a' },
    players: 2,
    aiResting: false,
  })

  // Placement id=1 erases (4,5); a newer placement id=2 paints the same cell.
  s = applyOptimisticPlace(s, 4, 5, 0, { id: 1 })
  s = applyOptimisticPlace(s, 4, 5, 9, { id: 2 })
  expect(s.pending.get(idx)).toBe(6)
  expect(s.pendingIds.get(idx)).toBe(2)
  expect(s.cells[idx]).toBe(9)

  // A stale noop for id=1 must preserve the newer pending entry and colour.
  s = applyServerMsg(s, { t: 'noop', x: 4, y: 5, id: 1 })
  expect(s.pending.has(idx)).toBe(true)
  expect(s.pendingIds.get(idx)).toBe(2)
  expect(s.cells[idx]).toBe(9)

  // Even after a peer overwrites (4,5), a stale noop must not zero the cell.
  s = applyServerMsg(s, { t: 'pixel', x: 4, y: 5, c: 5, by: 'user-b' })
  expect(s.pending.has(idx)).toBe(false)
  expect(s.cells[idx]).toBe(5)
  s = applyServerMsg(s, { t: 'noop', x: 4, y: 5, id: 1 })
  expect(s.cells[idx]).toBe(5)

  // A matching noop settles only its own pending entry.
  const idx2 = 7 * 32 + 7
  s = applyOptimisticPlace(s, 7, 7, 0, { id: 3 })
  s = applyOptimisticPlace(s, 8, 8, 4, { id: 4 })
  s = applyServerMsg(s, { t: 'noop', x: 7, y: 7, id: 3 })
  expect(s.pending.has(idx2)).toBe(false)
  expect(s.pending.has(8 * 32 + 8)).toBe(true)
})

it('a paced rejection after a peer pixel keeps the peer pixel and never rolls back a newer cell', () => {
  const rawCells = new Uint8Array(32 * 32)
  const idx = 4 * 32 + 3
  let s = applyServerMsg(initialClientState(), {
    t: 'snapshot',
    mode: 'coop',
    width: 32,
    height: 32,
    cells: encodeCells(rawCells),
    round: makeRound('r1'),
    you: { userId: 'user-a' },
    players: 2,
    aiResting: false,
  })

  s = applyOptimisticPlace(s, 3, 4, 4, { id: 1 })
  expect(s.pending.has(idx)).toBe(true)
  expect(s.pendingIds.get(idx)).toBe(1)

  // A peer's pixel supersedes the cell before the pace rejection arrives.
  s = applyServerMsg(s, { t: 'pixel', x: 3, y: 4, c: 9, by: 'user-b' })
  expect(s.cells[idx]).toBe(9)
  expect(s.pending.has(idx)).toBe(false)

  s = applyServerMsg(s, { t: 'reject', reason: 'rate_limited', x: 3, y: 4, retryAt: 3500, id: 1 })
  expect(s.cells[idx]).toBe(9)
  expect(s.lastReject).toBeNull()

  // A stale rejection for an older id must not roll back a newer pending cell.
  const idx3 = 6 * 32 + 6
  s = applyOptimisticPlace(s, 6, 6, 4, { id: 3 })
  s = applyServerMsg(s, { t: 'reject', reason: 'round_inactive', x: 6, y: 6, id: 1 })
  expect(s.cells[idx3]).toBe(4)
  expect(s.pending.has(idx3)).toBe(true)
  expect(s.pendingIds.get(idx3)).toBe(3)
})
