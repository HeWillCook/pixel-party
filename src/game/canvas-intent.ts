import { strokeCells } from './stroke'
import type { Tool } from './tools'

export interface GridPoint {
  x: number
  y: number
}

export type CanvasIntent =
  | { type: 'place'; points: GridPoint[]; color: number }
  | { type: 'fill'; x: number; y: number }
  | { type: 'pick'; x: number; y: number }
  | { type: 'none' }

export function canvasIntent(input: {
  tool: Tool
  phase: 'down' | 'move'
  cell: GridPoint | null
  prevCell: GridPoint | null
  activeColor: number
  canDraw: boolean
}): CanvasIntent {
  const { tool, phase, cell, prevCell, activeColor, canDraw } = input
  if (!canDraw || !cell) return { type: 'none' }

  if (phase === 'down') {
    if (tool === 'fill') return { type: 'fill', x: cell.x, y: cell.y }
    if (tool === 'pick') return { type: 'pick', x: cell.x, y: cell.y }
    return {
      type: 'place',
      points: [cell],
      color: tool === 'erase' ? 0 : activeColor,
    }
  }

  if (tool === 'fill' || tool === 'pick') return { type: 'none' }
  if (prevCell && prevCell.x === cell.x && prevCell.y === cell.y) {
    return { type: 'none' }
  }

  const points = prevCell ? strokeCells(prevCell, cell).slice(1) : [cell]
  return {
    type: 'place',
    points,
    color: tool === 'erase' ? 0 : activeColor,
  }
}
