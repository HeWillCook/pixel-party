import { describe, expect, it } from 'vitest'
import { EMPTY_CANVAS, MAX_COLOR, MODES, PALETTE } from './config'
import {
  clearGrid,
  contributors,
  createGrid,
  decodeCells,
  encodeCells,
  pixelsUsed,
  setPixel,
} from './grid'

describe('config', () => {
  it('defines a 17-entry palette with empty white at 0 and white paint at 16', () => {
    expect(PALETTE).toHaveLength(17)
    expect(PALETTE[0]).toBe('#ffffff')
    expect(PALETTE[16]).toBe('#ffffff')
    expect(MAX_COLOR).toBe(16)
    expect(EMPTY_CANVAS).toEqual(['#f3ead8', '#efe3cc'])
  })

  it('defines coop and team mode dimensions, zones, and timers', () => {
    expect(MODES.coop).toEqual({
      width: 32,
      height: 32,
      zones: [{ id: 'all', x: 0, y: 0, w: 32, h: 32 }],
      roundMs: null,
      capMs: 300_000,
      intermissionMs: 8_000,
    })
    expect(MODES.team).toEqual({
      width: 64,
      height: 32,
      zones: [
        { id: 'red', x: 0, y: 0, w: 32, h: 32 },
        { id: 'blue', x: 32, y: 0, w: 32, h: 32 },
      ],
      roundMs: 180_000,
      capMs: 180_000,
      intermissionMs: 8_000,
    })
  })
})

describe('grid', () => {
  it('creates an empty grid of the requested dimensions', () => {
    const g = createGrid(32, 32)
    expect(g.width).toBe(32)
    expect(g.height).toBe(32)
    expect(g.cells).toBeInstanceOf(Uint8Array)
    expect(g.cells).toHaveLength(1024)
    expect(g.placedBy).toHaveLength(1024)
    expect(pixelsUsed(g)).toBe(0)
    expect(contributors(g)).toEqual([])
  })

  it('overwrites pixels and tracks latest contributor per cell', () => {
    const g = createGrid(32, 32)
    setPixel(g, 3, 4, 2, 'u1')
    setPixel(g, 3, 4, 5, 'u2')
    expect(g.cells[4 * 32 + 3]).toBe(5)
    expect(contributors(g)).toEqual(['u2'])
    expect(pixelsUsed(g)).toBe(1)
  })

  it('round-trips cells through base64 encoding', () => {
    const g = createGrid(32, 32)
    setPixel(g, 0, 0, 1, 'u1')
    setPixel(g, 3, 4, 15, 'u2')
    setPixel(g, 31, 31, 9, 'u3')
    expect(decodeCells(encodeCells(g.cells), 1024)).toEqual(g.cells)
  })

  it('legacy cells still valid', () => {
    const legacy = new Uint8Array(1024)
    for (let i = 0; i < legacy.length; i++) legacy[i] = i % 16
    expect(decodeCells(encodeCells(legacy), 1024)).toEqual(legacy)
  })

  it('throws on decodeCells length mismatches (short or long payload)', () => {
    const shortEncoded = encodeCells(new Uint8Array(10))
    const longEncoded = encodeCells(new Uint8Array(1025))
    expect(() => decodeCells(shortEncoded, 1024)).toThrow(
      'decodeCells: expected 1024 bytes, got 10',
    )
    expect(() => decodeCells(longEncoded, 1024)).toThrow(
      'decodeCells: expected 1024 bytes, got 1025',
    )
  })

  it('clears all cells and contributors', () => {
    const g = createGrid(32, 32)
    setPixel(g, 1, 2, 4, 'u1')
    setPixel(g, 5, 6, 7, 'u2')
    clearGrid(g)
    expect(pixelsUsed(g)).toBe(0)
    expect(contributors(g)).toEqual([])
    expect(g.cells.every((c) => c === 0)).toBe(true)
  })

  it('computes pixelsUsed and sorted contributors restricted to a zone on a 64x32 grid', () => {
    const g = createGrid(MODES.team.width, MODES.team.height)
    const [redZone, blueZone] = MODES.team.zones

    setPixel(g, 0, 0, 4, 'red-alice')
    setPixel(g, 31, 31, 5, 'red-bob')
    setPixel(g, 32, 0, 10, 'blue-zoe')
    setPixel(g, 63, 31, 11, 'blue-amy')
    setPixel(g, 40, 10, 12, 'blue-zoe')

    expect(pixelsUsed(g)).toBe(5)
    expect(pixelsUsed(g, redZone)).toBe(2)
    expect(pixelsUsed(g, blueZone)).toBe(3)
    expect(contributors(g, redZone)).toEqual(['red-alice', 'red-bob'])
    expect(contributors(g, blueZone)).toEqual(['blue-amy', 'blue-zoe'])
  })

  it('ignores out-of-bounds setPixel calls without mutating grid', () => {
    const g = createGrid(32, 32)
    setPixel(g, -1, 0, 3, 'u1')
    setPixel(g, 32, 0, 3, 'u1')
    setPixel(g, 0, 32, 3, 'u1')
    setPixel(g, 1.5, 2, 3, 'u1')
    expect(pixelsUsed(g)).toBe(0)
    expect(contributors(g)).toEqual([])
  })
})
