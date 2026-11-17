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
    expect(s.you).toEqual({ userId: null, cooldownUntil: 0 })
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
      you: { userId: 'user-1', cooldownUntil: 1500 },
      players: 3,
      aiResting: false,
    }

    const next = applyServerMsg(s, msg)
    expect(next.snapshotLoaded).toBe(true)
    expect(next.connectError).toBeNull()
    expect(next.pending.size).toBe(0)
    expect(next.cells[0]).toBe(9)
    expect(next.cells[3 * 32 + 2]).toBe(1)
    expect(next.you).toEqual({ userId: 'user-1', cooldownUntil: 1500 })
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
      you: { userId: 'user-1', cooldownUntil: 0 },
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

  it('reject restores only the rejected pending cell in FIFO order and records lastReject (M4)', () => {
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
      you: { userId: 'user-1', cooldownUntil: 0 },
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

    // First reject rolls back only the first pending cell (idxA), leaving idxB pending
    s = applyServerMsg(s, { t: 'reject', reason: 'cooldown', retryAt: 2500 })
    expect(s.cells[idxA]).toBe(8)
    expect(s.cells[idxB]).toBe(9)
    expect(s.pending.size).toBe(1)
    expect(s.pending.has(idxB)).toBe(true)
    expect(s.lastReject).toEqual({ t: 'reject', reason: 'cooldown', retryAt: 2500 })
    expect(s.you.cooldownUntil).toBe(2500)

    // Second reject rolls back idxB
    s = applyServerMsg(s, { t: 'reject', reason: 'cooldown', retryAt: 2600 })
    expect(s.cells[idxB]).toBe(6)
    expect(s.pending.size).toBe(0)

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
      round: { ...makeRound('r1', 'mushroom'), state: 'intermission', result: { outcome: 'won', score: 180 } },
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
  expect(state.you.cooldownUntil).toBe(1017)
})
