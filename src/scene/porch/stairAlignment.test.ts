import { describe, expect, it, vi } from 'vitest'

// Records, per call, the horizontal extent of everything `paintStairRun` fills (in scene units), whichever section calls it.
const runs: { minX: number; maxX: number }[] = []
vi.mock('./stairArt', async (importOriginal) => {
  const original = await importOriginal<typeof import('./stairArt')>()
  return {
    ...original,
    paintStairRun: (...args: Parameters<typeof original.paintStairRun>) => {
      const ctx = args[0]
      const real = ctx.fillRect.bind(ctx)
      const run = { minX: Infinity, maxX: -Infinity }
      ctx.fillRect = (x: number, y: number, w: number, h: number) => { run.minX = Math.min(run.minX, x); run.maxX = Math.max(run.maxX, x + w); real(x, y, w, h) }
      original.paintStairRun(...args)
      ctx.fillRect = real
      runs.push(run)
    },
  }
})

import { paintFloorSection } from './floorArt'
import { porchHatch } from './layout'
import { paintHatch } from './propsArt'
import { studioLayout } from '../studio/layout'
import { paintStudioForeground } from '../studio/studioArt'

function recorder() {
  const ctx = { canvas: { width: 320, height: 180 }, imageSmoothingEnabled: true, globalAlpha: 1, fillStyle: '', save() {}, restore() {}, translate() {}, fillRect() {} }
  return ctx as unknown as CanvasRenderingContext2D
}

/** The stair is one column from the deck hatch, through the floor cutaway, to the basement: same x and same width in every section. */
describe('stair alignment through the floor pan', () => {
  it.each(['landscape', 'portrait'] as const)('%s: the hatch shaft, the cutaway stair and the basement stair share x and width', (composition) => {
    const { opening } = porchHatch[composition]
    const width = composition === 'landscape' ? 320 : 180
    const height = composition === 'landscape' ? 180 : 320
    const portrait = composition === 'portrait'

    runs.length = 0
    paintHatch(recorder(), porchHatch[composition])
    paintFloorSection(recorder(), width, 40, opening)
    paintStudioForeground(recorder(), { portrait, width, height, layout: studioLayout[composition], dadoY: portrait ? 82 : 78, floorY: portrait ? 96 : 98 })
    expect(runs).toHaveLength(3)
    const [hatch, cutaway, basement] = runs
    expect(basement.minX).toBe(opening.x)
    for (const run of [hatch, cutaway, basement]) expect(run).toEqual({ minX: opening.x, maxX: opening.x + opening.w + 2 })
  })
})
