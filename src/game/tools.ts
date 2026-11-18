export type Tool = 'paint' | 'erase' | 'fill' | 'pick'

export const DAILY_TOOLS: readonly Tool[] = ['paint', 'erase', 'fill', 'pick']
export const PARTY_TOOLS: readonly Tool[] = ['paint', 'erase', 'pick']

export function floodFill(
  cells: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  color: number,
): Uint8Array {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return cells
  if (width <= 0 || height <= 0 || x < 0 || x >= width || y < 0 || y >= height) {
    return cells
  }

  const startIdx = y * width + x
  if (startIdx >= cells.length) return cells

  const target = cells[startIdx]
  if (target === color) return cells

  const next = new Uint8Array(cells)
  next[startIdx] = color
  const stack: number[] = [startIdx]

  while (stack.length > 0) {
    const idx = stack.pop()!
    const cx = idx % width
    const cy = (idx - cx) / width

    if (cx > 0) {
      const left = idx - 1
      if (next[left] === target) {
        next[left] = color
        stack.push(left)
      }
    }
    if (cx + 1 < width) {
      const right = idx + 1
      if (next[right] === target) {
        next[right] = color
        stack.push(right)
      }
    }
    if (cy > 0) {
      const up = idx - width
      if (next[up] === target) {
        next[up] = color
        stack.push(up)
      }
    }
    if (cy + 1 < height) {
      const down = idx + width
      if (next[down] === target) {
        next[down] = color
        stack.push(down)
      }
    }
  }

  return next
}

export function pickAt(
  cells: Uint8Array,
  width: number,
  x: number,
  y: number,
): { tool: 'paint'; color: number } | { tool: 'erase' } {
  if (!Number.isInteger(x) || !Number.isInteger(y) || width <= 0 || x < 0 || x >= width || y < 0) {
    return { tool: 'erase' }
  }
  const idx = y * width + x
  const color = cells[idx] ?? 0
  if (color === 0) return { tool: 'erase' }
  return { tool: 'paint', color }
}
