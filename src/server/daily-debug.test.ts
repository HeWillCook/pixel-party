import { describe, expect, it } from 'vitest'
import { decodeCells } from '../game/grid'
import { addDebugPaintings, clearDebugPaintings, debugCells, MAX_DEBUG_PAINTINGS } from './daily-debug'
import { memoryTools } from './room-test-tools'

// TEMP DEBUG: remove with daily-debug.ts before launch
const now = Date.UTC(2026, 10, 18, 12)
const alice = { userId: 'alice', name: 'Alice' }

describe('debug paintings', () => {
  it('adds distinct days of real wall rows, newest first from yesterday, skipping days the player already has', async () => {
    const { tools, rows } = memoryTools()
    await tools.create('dailyDrawings', { day: '2026-11-16', userId: 'alice', cells: 'x', score: 10, guess: 'mine' })
    expect(await addDebugPaintings(tools, alice, 3, now)).toBe(3)
    const days = [...rows('dailyDrawings').values()].filter(row => row.reason === '[debug painting]').map(row => row.day).sort()
    expect(days).toEqual(['2026-11-14', '2026-11-15', '2026-11-17'])
    for (const row of rows('dailyDrawings').values()) if (row.reason === '[debug painting]') {
      expect(row).toMatchObject({ userId: 'alice', displayName: 'Alice', visibility: 'private' })
      expect(row.score).toBeGreaterThan(0)
      expect(String(row.prompt).length).toBeGreaterThan(3)
      expect(decodeCells(row.cells as string, 1024)).toHaveLength(1024)
    }
    expect(rows('dailyScores').size).toBe(3)
  })

  it('caps one request and never reuses a day', async () => {
    const { tools, rows } = memoryTools()
    expect(await addDebugPaintings(tools, alice, 10_000, now)).toBe(MAX_DEBUG_PAINTINGS)
    expect(await addDebugPaintings(tools, alice, 50, now)).toBe(50)
    expect(new Set([...rows('dailyDrawings').values()].map(row => row.day)).size).toBe(MAX_DEBUG_PAINTINGS + 50)
  })

  it('draws varied, valid pictures', () => {
    const pictures = new Set(Array.from({ length: 12 }, (_, seed) => debugCells(seed).join()))
    expect(pictures.size).toBe(12)
    for (const cell of debugCells(7)) expect(cell).toBeLessThanOrEqual(16)
  })

  it("clears only the signed-in player's own debug rows", async () => {
    const { tools, rows } = memoryTools()
    await addDebugPaintings(tools, alice, 5, now)
    await addDebugPaintings(tools, { userId: 'bob', name: 'Bob' }, 4, now)
    await tools.create('dailyDrawings', { day: '2026-11-01', userId: 'alice', cells: 'x', score: 500, guess: 'real', reason: 'a real reason' })
    expect(await clearDebugPaintings(tools, 'alice')).toBe(5)
    const left = [...rows('dailyDrawings').values()]
    expect(left.filter(row => row.userId === 'alice')).toHaveLength(1)
    expect(left.filter(row => row.userId === 'bob')).toHaveLength(4)
    expect([...rows('dailyScores').values()].filter(row => row.userId === 'alice')).toHaveLength(0)
    expect([...rows('dailyScores').values()].filter(row => row.userId === 'bob')).toHaveLength(4)
  })
})
