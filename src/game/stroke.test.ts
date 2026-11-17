import { expect, it } from 'vitest'
import { strokeCells } from './stroke'

it.each([[0, 0, 7, 0], [7, 0, 0, 0], [0, 0, 0, 7], [0, 0, 7, 7], [0, 0, 3, 7], [7, 7, 3, 0]])('interpolates every cell from (%i,%i) to (%i,%i)', (x, y, endX, endY) => {
  const cells = strokeCells({ x, y }, { x: endX, y: endY })
  expect(cells[0]).toEqual({ x, y })
  expect(cells.at(-1)).toEqual({ x: endX, y: endY })
  expect(cells).toHaveLength(Math.max(Math.abs(endX - x), Math.abs(endY - y)) + 1)
  for (let i = 1; i < cells.length; i++) {
    expect(Math.abs(cells[i].x - cells[i - 1].x)).toBeLessThanOrEqual(1)
    expect(Math.abs(cells[i].y - cells[i - 1].y)).toBeLessThanOrEqual(1)
  }
})
