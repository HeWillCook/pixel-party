import { describe, expect, it } from 'vitest'
import { HISTORY_LIMIT, emptyHistory, record, redo, undo } from './history'

const grid = (fill: number) => new Uint8Array(4).fill(fill)

describe('history', () => {
  it('returns null when nothing to undo or redo', () => {
    const h = emptyHistory()
    expect(undo(h, grid(0))).toBeNull()
    expect(redo(h, grid(0))).toBeNull()
  })

  it('undo then redo restores', () => {
    const s0 = grid(0)
    const s1 = grid(1)
    const s2 = grid(2)

    let h = emptyHistory()
    h = record(h, s0)
    h = record(h, s1)

    const u1 = undo(h, s2)
    expect(u1).not.toBeNull()
    expect(u1!.cells).toEqual(s1)

    const u2 = undo(u1!.history, u1!.cells)
    expect(u2).not.toBeNull()
    expect(u2!.cells).toEqual(s0)
    expect(undo(u2!.history, u2!.cells)).toBeNull()

    const r1 = redo(u2!.history, u2!.cells)
    expect(r1).not.toBeNull()
    expect(r1!.cells).toEqual(s1)

    const r2 = redo(r1!.history, r1!.cells)
    expect(r2).not.toBeNull()
    expect(r2!.cells).toEqual(s2)
    expect(redo(r2!.history, r2!.cells)).toBeNull()
  })

  it('record clears future', () => {
    const s0 = grid(0)
    const s1 = grid(1)
    const s2 = grid(2)

    let h = record(emptyHistory(), s0)
    const undone = undo(h, s1)!
    expect(undone.history.future).toHaveLength(1)

    h = record(undone.history, undone.cells)
    expect(h.future).toEqual([])
    expect(redo(h, s2)).toBeNull()
  })

  it('history caps at 100', () => {
    expect(HISTORY_LIMIT).toBe(100)
    let h = emptyHistory()
    for (let i = 0; i < 120; i++) {
      h = record(h, grid(i))
    }
    expect(h.past).toHaveLength(100)
    expect(h.past[0]).toEqual(grid(20))
    expect(h.past[99]).toEqual(grid(119))
  })
})
