import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearGuestSketch, loadGuestSketch, saveGuestSketch, utcDay } from './guestSketch'

class MemoryStorage {
  private map = new Map<string, string>()
  get length() { return this.map.size }
  key(i: number) { return [...this.map.keys()][i] ?? null }
  getItem(k: string) { return this.map.get(k) ?? null }
  setItem(k: string, v: string) { this.map.set(k, v) }
  removeItem(k: string) { this.map.delete(k) }
}

function cellsWith(index: number, color: number): Uint8Array {
  const cells = new Uint8Array(1024)
  cells[index] = color
  return cells
}

describe('guest sketch', () => {
  beforeEach(() => {
    ;(globalThis as { window?: unknown }).window = { localStorage: new MemoryStorage() }
  })
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  it('round-trips cells, day and start time', () => {
    const day = utcDay()
    saveGuestSketch({ day, startedAt: 1234, cells: cellsWith(5, 3) })
    const loaded = loadGuestSketch(day)
    expect(loaded?.startedAt).toBe(1234)
    expect(loaded?.cells[5]).toBe(3)
    expect(loaded?.cells.length).toBe(1024)
  })

  it('ignores a sketch from another day', () => {
    saveGuestSketch({ day: '2026-01-01', startedAt: 1, cells: cellsWith(0, 2) })
    expect(loadGuestSketch('2026-01-02')).toBeNull()
    expect(loadGuestSketch('2026-01-01')?.cells[0]).toBe(2)
  })

  it('sweeps older days when saving a new day', () => {
    saveGuestSketch({ day: '2026-01-01', startedAt: 1, cells: cellsWith(0, 2) })
    saveGuestSketch({ day: '2026-01-02', startedAt: 2, cells: cellsWith(1, 4) })
    expect(loadGuestSketch('2026-01-01')).toBeNull()
    expect(loadGuestSketch('2026-01-02')?.cells[1]).toBe(4)
  })

  it('clears and tolerates garbage', () => {
    saveGuestSketch({ day: '2026-01-01', startedAt: 1, cells: cellsWith(0, 2) })
    clearGuestSketch()
    expect(loadGuestSketch('2026-01-01')).toBeNull()
    ;(window as unknown as { localStorage: MemoryStorage }).localStorage.setItem('pixle:guest-sketch:2026-01-03', '{nope')
    expect(loadGuestSketch('2026-01-03')).toBeNull()
  })
})
