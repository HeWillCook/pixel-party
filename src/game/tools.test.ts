import { describe, expect, it } from 'vitest'
import { DAILY_TOOLS, PARTY_TOOLS, floodFill, pickAt } from './tools'

describe('tool lists', () => {
  it('exposes daily and party tool sets', () => {
    expect(DAILY_TOOLS).toEqual(['paint', 'erase', 'fill', 'pick'])
    expect(PARTY_TOOLS).toEqual(['paint', 'erase', 'pick'])
  })
})

describe('floodFill', () => {
  it('fill bounded region', () => {
    // 4x4 grid: outer ring or 3x3 ring of 1 around (1,1)
    // 1 1 1 0
    // 1 0 1 0
    // 1 1 1 0
    // 0 0 0 0
    const cells = new Uint8Array([
      1, 1, 1, 0,
      1, 0, 1, 0,
      1, 1, 1, 0,
      0, 0, 0, 0,
    ])
    const snapshot = new Uint8Array(cells)
    const filled = floodFill(cells, 4, 4, 1, 1, 7)

    expect(cells).toEqual(snapshot)
    expect(filled).not.toBe(cells)
    expect([...filled]).toEqual([
      1, 1, 1, 0,
      1, 7, 1, 0,
      1, 1, 1, 0,
      0, 0, 0, 0,
    ])
  })

  it('fill whole canvas', () => {
    const cells = new Uint8Array(32 * 32)
    const start = performance.now()
    const filled = floodFill(cells, 32, 32, 16, 16, 5)
    const elapsedMs = performance.now() - start

    expect(elapsedMs).toBeLessThan(50)
    expect(filled).toHaveLength(1024)
    expect(filled.every((c) => c === 5)).toBe(true)
  })

  it('fill same colour is identity', () => {
    const cells = new Uint8Array(16).fill(3)
    const result = floodFill(cells, 4, 4, 2, 2, 3)
    expect(result).toBe(cells)
  })

  it('fill is 4-connected', () => {
    // Diagonal 0s separated by 1s should not be crossed:
    // 0 1 0
    // 1 0 1
    // 0 1 0
    const cells = new Uint8Array([
      0, 1, 0,
      1, 0, 1,
      0, 1, 0,
    ])
    const filled = floodFill(cells, 3, 3, 1, 1, 4)
    expect([...filled]).toEqual([
      0, 1, 0,
      1, 4, 1,
      0, 1, 0,
    ])
  })

  it('fills non-empty connected region including erasing with 0', () => {
    const cells = new Uint8Array([
      2, 2, 1,
      2, 1, 1,
      0, 2, 2,
    ])
    const filled = floodFill(cells, 3, 3, 0, 0, 0)
    expect([...filled]).toEqual([
      0, 0, 1,
      0, 1, 1,
      0, 2, 2,
    ])
  })
})

describe('pickAt', () => {
  it('pick paint colour', () => {
    const cells = new Uint8Array(16)
    cells[2 * 4 + 3] = 16
    expect(pickAt(cells, 4, 3, 2)).toEqual({ tool: 'paint', color: 16 })
  })

  it('pick empty returns erase', () => {
    const cells = new Uint8Array(16)
    expect(pickAt(cells, 4, 1, 1)).toEqual({ tool: 'erase' })
  })
})
