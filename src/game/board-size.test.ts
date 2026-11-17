import { describe, expect, it } from 'vitest'
import { boardCellSize } from './board-size'

describe('boardCellSize', () => {
  it('fits 32x32 into 1440x900 chrome-adjusted space at 18px', () => {
    expect(boardCellSize({ availWidth: 700, availHeight: 600, cols: 32, rows: 32 })).toBe(18)
  })

  it('caps the side at 768px', () => {
    expect(boardCellSize({ availWidth: 2000, availHeight: 2000, cols: 32, rows: 32 })).toBe(24)
  })

  it('uses the board aspect ratio for 64x32', () => {
    expect(boardCellSize({ availWidth: 700, availHeight: 600, cols: 64, rows: 32 })).toBe(10)
  })

  it('never goes below minCell on tiny screens', () => {
    expect(boardCellSize({ availWidth: 100, availHeight: 80, cols: 32, rows: 32 })).toBe(4)
  })
})
