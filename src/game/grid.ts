import type { Zone } from './config'

export interface Grid {
  width: number
  height: number
  cells: Uint8Array
  placedBy: string[]
}

export function createGrid(w: number, h: number): Grid {
  const len = w * h
  return {
    width: w,
    height: h,
    cells: new Uint8Array(len),
    placedBy: new Array<string>(len).fill(''),
  }
}

export function setPixel(
  g: Grid,
  x: number,
  y: number,
  color: number,
  userId: string,
): void {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return
  if (x < 0 || x >= g.width || y < 0 || y >= g.height) return
  const idx = y * g.width + x
  g.cells[idx] = color
  g.placedBy[idx] = color === 0 ? '' : userId
}

export function clearGrid(g: Grid): void {
  g.cells.fill(0)
  g.placedBy.fill('')
}

export function encodeCells(cells: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < cells.length; i++) {
    binary += String.fromCharCode(cells[i])
  }
  return btoa(binary)
}

export function decodeCells(s: string, length: number): Uint8Array {
  const binary = atob(s)
  const out = new Uint8Array(length)
  const n = Math.min(binary.length, length)
  for (let i = 0; i < n; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

function zoneBounds(g: Grid, zone?: Zone): { x0: number; y0: number; x1: number; y1: number } {
  if (!zone) {
    return { x0: 0, y0: 0, x1: g.width, y1: g.height }
  }
  return {
    x0: Math.max(0, zone.x),
    y0: Math.max(0, zone.y),
    x1: Math.min(g.width, zone.x + zone.w),
    y1: Math.min(g.height, zone.y + zone.h),
  }
}

export function pixelsUsed(g: Grid, zone?: Zone): number {
  const { x0, y0, x1, y1 } = zoneBounds(g, zone)
  let count = 0
  for (let y = y0; y < y1; y++) {
    const rowOffset = y * g.width
    for (let x = x0; x < x1; x++) {
      if (g.cells[rowOffset + x] !== 0) {
        count++
      }
    }
  }
  return count
}

export function contributors(g: Grid, zone?: Zone): string[] {
  const { x0, y0, x1, y1 } = zoneBounds(g, zone)
  const users = new Set<string>()
  for (let y = y0; y < y1; y++) {
    const rowOffset = y * g.width
    for (let x = x0; x < x1; x++) {
      const idx = rowOffset + x
      if (g.cells[idx] !== 0) {
        const uid = g.placedBy[idx]
        if (uid) {
          users.add(uid)
        }
      }
    }
  }
  return Array.from(users).sort()
}
