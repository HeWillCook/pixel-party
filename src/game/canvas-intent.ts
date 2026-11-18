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

export interface StrokeSession {
  activePointerId: number | null
  lastCell: GridPoint | null
}

export function createStrokeSession(): StrokeSession {
  return { activePointerId: null, lastCell: null }
}

export type StrokeDownStep =
  | { kind: 'ignore' }
  | { kind: 'start'; points: GridPoint[]; color: number }
  | { kind: 'intent'; intent: CanvasIntent }

export function strokePointerDown(
  session: StrokeSession,
  input: {
    pointerId: number
    cell: GridPoint
    tool: Tool
    activeColor: number
    canDraw: boolean
  },
): StrokeDownStep {
  if (session.activePointerId !== null) {
    return { kind: 'ignore' }
  }
  const intent = canvasIntent({
    tool: input.tool,
    phase: 'down',
    cell: input.cell,
    prevCell: null,
    activeColor: input.activeColor,
    canDraw: input.canDraw,
  })
  if (intent.type !== 'place') {
    return { kind: 'intent', intent }
  }
  session.activePointerId = input.pointerId
  session.lastCell = input.cell
  return { kind: 'start', points: intent.points, color: intent.color }
}

export type StrokeMoveStep =
  | { kind: 'ignore' }
  | { kind: 'hover'; cell: GridPoint | null }
  | { kind: 'move'; cell: GridPoint; points: GridPoint[]; color: number }

export function strokePointerMove(
  session: StrokeSession,
  input: {
    pointerId: number
    cell: GridPoint | null
    tool: Tool
    activeColor: number
    canDraw: boolean
  },
): StrokeMoveStep {
  if (session.activePointerId !== null && session.activePointerId !== input.pointerId) {
    return { kind: 'ignore' }
  }
  if (session.activePointerId === null || !input.cell) {
    return { kind: 'hover', cell: input.cell }
  }
  const intent = canvasIntent({
    tool: input.tool,
    phase: 'move',
    cell: input.cell,
    prevCell: session.lastCell,
    activeColor: input.activeColor,
    canDraw: input.canDraw,
  })
  if (intent.type !== 'place') {
    return { kind: 'hover', cell: input.cell }
  }
  session.lastCell = input.cell
  return { kind: 'move', cell: input.cell, points: intent.points, color: intent.color }
}

export function strokePointerEnd(session: StrokeSession, pointerId?: number): boolean {
  if (session.activePointerId === null) return false
  if (pointerId !== undefined && session.activePointerId !== pointerId) return false
  session.activePointerId = null
  session.lastCell = null
  return true
}
