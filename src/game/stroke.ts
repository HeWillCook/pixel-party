export interface Cell { x: number; y: number }

/** Bresenham, including both endpoints, for all octants. */
export function strokeCells(from: Cell, to: Cell): Cell[] {
  let { x, y } = from
  const dx = Math.abs(to.x - x), dy = -Math.abs(to.y - y)
  const sx = x < to.x ? 1 : -1, sy = y < to.y ? 1 : -1
  let error = dx + dy
  const cells: Cell[] = []
  for (;;) {
    cells.push({ x, y })
    if (x === to.x && y === to.y) return cells
    const doubled = 2 * error
    if (doubled >= dy) { error += dy; x += sx }
    if (doubled <= dx) { error += dx; y += sy }
  }
}
