import { describe, expect, it } from 'vitest'
import { canvasIntent } from './canvas-intent'

describe('canvasIntent', () => {
  it('paint tool sends activeColor on down and interpolates on move', () => {
    expect(
      canvasIntent({
        tool: 'paint',
        phase: 'down',
        cell: { x: 2, y: 3 },
        prevCell: null,
        activeColor: 7,
        canDraw: true,
      }),
    ).toEqual({ type: 'place', points: [{ x: 2, y: 3 }], color: 7 })

    expect(
      canvasIntent({
        tool: 'paint',
        phase: 'move',
        cell: { x: 4, y: 3 },
        prevCell: { x: 2, y: 3 },
        activeColor: 7,
        canDraw: true,
      }),
    ).toEqual({
      type: 'place',
      points: [{ x: 3, y: 3 }, { x: 4, y: 3 }],
      color: 7,
    })
  })

  it('erase tool sends color 0', () => {
    expect(
      canvasIntent({
        tool: 'erase',
        phase: 'down',
        cell: { x: 5, y: 6 },
        prevCell: null,
        activeColor: 4,
        canDraw: true,
      }),
    ).toEqual({ type: 'place', points: [{ x: 5, y: 6 }], color: 0 })

    expect(
      canvasIntent({
        tool: 'erase',
        phase: 'move',
        cell: { x: 7, y: 6 },
        prevCell: { x: 5, y: 6 },
        activeColor: 4,
        canDraw: true,
      }),
    ).toEqual({
      type: 'place',
      points: [{ x: 6, y: 6 }, { x: 7, y: 6 }],
      color: 0,
    })
  })

  it('fill tool sends single fill intent', () => {
    expect(
      canvasIntent({
        tool: 'fill',
        phase: 'down',
        cell: { x: 1, y: 2 },
        prevCell: null,
        activeColor: 9,
        canDraw: true,
      }),
    ).toEqual({ type: 'fill', x: 1, y: 2 })

    expect(
      canvasIntent({
        tool: 'fill',
        phase: 'move',
        cell: { x: 2, y: 2 },
        prevCell: { x: 1, y: 2 },
        activeColor: 9,
        canDraw: true,
      }),
    ).toEqual({ type: 'none' })
  })

  it('pick tool sends single pick intent and ignores drag', () => {
    expect(
      canvasIntent({
        tool: 'pick',
        phase: 'down',
        cell: { x: 3, y: 4 },
        prevCell: null,
        activeColor: 9,
        canDraw: true,
      }),
    ).toEqual({ type: 'pick', x: 3, y: 4 })

    expect(
      canvasIntent({
        tool: 'pick',
        phase: 'move',
        cell: { x: 4, y: 4 },
        prevCell: { x: 3, y: 4 },
        activeColor: 9,
        canDraw: true,
      }),
    ).toEqual({ type: 'none' })
  })

  it('canDraw=false places nothing', () => {
    for (const tool of ['paint', 'erase', 'fill', 'pick'] as const) {
      for (const phase of ['down', 'move'] as const) {
        expect(
          canvasIntent({
            tool,
            phase,
            cell: { x: 1, y: 1 },
            prevCell: { x: 0, y: 1 },
            activeColor: 4,
            canDraw: false,
          }),
        ).toEqual({ type: 'none' })
      }
    }
  })
})
