import { describe, expect, it } from 'vitest'
import { drawCatSleepZs } from './drawPorch'
import { studioLayout } from '../studio/layout'
import { PORCH_EASEL_ART, PORCH_EASEL_CANVAS, PORCH_EASEL_FRAME, porchChalkboardRect, porchEaselBoardRect, porchHatch, porchLayout } from './layout'
import { P } from '../palette'
import { DETAIL } from '../detail'

function captureRects(frame: number) {
  const rects: Array<{ x: number; y: number; w: number; h: number; fillStyle: string }> = []
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fillStyle: ctx.fillStyle })
    },
  }
  drawCatSleepZs(ctx as unknown as CanvasRenderingContext2D, 50, 139, frame)
  return rects
}

/** The glyph's inked cells (not its dark rim), as detail-pixel rows relative to the topmost-left ink. */
function inkCells(rects: ReturnType<typeof captureRects>, ink: string) {
  return rects.filter(r => r.fillStyle === ink).map(r => ({ x: Math.round(r.x * DETAIL), y: Math.round(r.y * DETAIL) }))
}

describe('porch cat sleeping z animation', () => {
  it('draws one small and one big "z" at frame 0 (reduced motion), in palette colours on the detail grid', () => {
    const rects = captureRects(0)
    const palette = new Set(Object.values(P).flat())
    for (const r of rects) {
      expect(Number.isInteger(r.x * DETAIL)).toBe(true)
      expect(Number.isInteger(r.y * DETAIL)).toBe(true)
      expect(r.w * DETAIL).toBe(1)
      expect(palette.has(r.fillStyle as (typeof P.paper)[number])).toBe(true)
    }
    // Small z (5 wide) in paper[4], big z (7 wide) in paper[3], each ringed by the dark outline colour.
    const small = inkCells(rects, P.paper[4])
    const big = inkCells(rects, P.paper[3])
    expect(small.length).toBe(5 + 2 + 2 + 2 + 5)
    expect(big.length).toBe(7 + 3 + 3 + 3 + 3 + 3 + 7)
    expect(Math.max(...small.map(c => c.x)) - Math.min(...small.map(c => c.x))).toBe(4)
    expect(Math.max(...big.map(c => c.x)) - Math.min(...big.map(c => c.x))).toBe(6)
    expect(new Set(rects.map(r => r.fillStyle))).toEqual(new Set([P.wood[0], P.paper[4], P.paper[3]]))
  })

  it('rises from the nose, drifts right and fades over the animation loop', () => {
    const noseY = 139 * DETAIL
    // Frames 12-17 show only the first z (the second is between loops), so its climb can be read directly.
    const low = captureRects(12)
    const high = captureRects(17)
    const topY = (rects: ReturnType<typeof captureRects>) => Math.min(...rects.map(r => r.y * DETAIL))
    const leftX = (rects: ReturnType<typeof captureRects>) => Math.min(...rects.map(r => r.x * DETAIL))
    expect(topY(low)).toBeLessThan(noseY)
    expect(topY(high)).toBeLessThan(topY(low))
    expect(leftX(high)).toBeGreaterThanOrEqual(leftX(low))
    // Late in its life the z has faded to the dimmest paper step.
    expect(captureRects(27).some(r => r.fillStyle === P.paper[2])).toBe(true)
  })
})

describe('porch easel proportions and camera focus', () => {
  it('focuses on the exact 32x32 art area and centers 38x38 frame and 34x34 mat on (34, 41)', () => {
    expect(PORCH_EASEL_FRAME).toEqual({ x: 15, y: 22, w: 38, h: 38 })
    expect(PORCH_EASEL_CANVAS).toEqual({ x: 17, y: 24, w: 34, h: 34 })
    expect(PORCH_EASEL_ART).toEqual({ x: 18, y: 25, w: 32, h: 32 })
    for (const rect of [PORCH_EASEL_FRAME, PORCH_EASEL_CANVAS, PORCH_EASEL_ART]) {
      expect(rect.x + rect.w / 2).toBe(34)
      expect(rect.y + rect.h / 2).toBe(41)
    }
    expect(porchEaselBoardRect('landscape')).toEqual({
      x: porchLayout.landscape.easel.x + 18,
      y: porchLayout.landscape.easel.y + 25,
      w: 32,
      h: 32,
    })
    expect(porchEaselBoardRect('portrait')).toEqual({
      x: porchLayout.portrait.easel.x + 18,
      y: porchLayout.portrait.easel.y + 25,
      w: 32,
      h: 32,
    })
  })
})

describe('porch chalkboard proportions', () => {
  it('keeps the slate wide and landscape in both compositions', () => {
    expect(porchChalkboardRect('landscape')).toEqual({ x: 220, y: 96, w: 50, h: 35 })
    expect(porchChalkboardRect('portrait')).toEqual({ x: 106, y: 203, w: 40, h: 27 })
    for (const rect of [porchChalkboardRect('landscape'), porchChalkboardRect('portrait')]) {
      expect(rect.w / rect.h).toBeGreaterThan(1.3)
      expect(rect.w / rect.h).toBeLessThan(1.7)
    }
  })

  it('keeps the hatch assembly inside the porch and clear of the other major objects', () => {
    const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    for (const composition of ['landscape', 'portrait'] as const) {
      const size = composition === 'landscape' ? { w: 320, h: 180 } : { w: 180, h: 320 }
      const board = porchLayout[composition].chalkboard
      expect(board.x).toBeGreaterThanOrEqual(0)
      expect(board.y).toBeGreaterThanOrEqual(0)
      expect(board.x + board.w).toBeLessThanOrEqual(size.w)
      expect(board.y + board.h).toBeLessThanOrEqual(size.h)
      for (const key of ['easel', 'lantern', 'gallery', 'basement', 'mailbox'] as const) {
        expect(overlaps(board, porchLayout[composition][key]), `${composition} ${key}`).toBe(false)
      }
      const sign = porchLayout[composition].basement
      expect(sign.x).toBeGreaterThanOrEqual(0)
      expect(sign.y).toBeGreaterThanOrEqual(0)
      expect(sign.x + sign.w).toBeLessThanOrEqual(size.w)
      expect(sign.y + sign.h).toBeLessThanOrEqual(size.h)
      expect(overlaps(sign, porchLayout[composition].easel), `${composition} easel`).toBe(false)
      expect(overlaps(sign, porchLayout[composition].chalkboard), `${composition} chalkboard`).toBe(false)
    }
  })

  it('puts the hatch on the deck, in the right half, with the basement stair directly under its opening', () => {
    for (const composition of ['landscape', 'portrait'] as const) {
      const floor = composition === 'landscape' ? 154 : 232
      const width = composition === 'landscape' ? 320 : 180
      const { opening, sign } = porchHatch[composition]
      const whole = porchLayout[composition].basement
      for (const part of [opening, sign]) {
        expect(part.x).toBeGreaterThanOrEqual(whole.x)
        expect(part.x + part.w).toBeLessThanOrEqual(whole.x + whole.w)
        expect(part.y + part.h).toBeLessThanOrEqual(whole.y + whole.h)
        expect(part.y).toBeGreaterThan(floor)
      }
      expect(opening.x + opening.w / 2).toBeGreaterThan(width / 2)
      expect(sign.x + sign.w).toBeLessThan(opening.x) // the sign stands beside the opening, not on it
      const stairs = studioLayout[composition].stairs
      expect({ x: stairs.x, w: stairs.w }).toEqual({ x: opening.x, w: opening.w })
    }
  })

  it('stands the easel and the chalkboard on the deck in both compositions', () => {
    // The thrusters' flames end a few rows above where the hover shadows land on the boards.
    for (const [composition, floor] of [['landscape', 154], ['portrait', 232]] as const) {
      const { easel, chalkboard } = porchLayout[composition]
      expect(easel.y + 112).toBeGreaterThan(floor - 8)
      expect(chalkboard.y + chalkboard.h).toBeGreaterThan(floor - 12)
      expect(chalkboard.y + chalkboard.h).toBeLessThanOrEqual(porchLayout[composition].basement.y) // the hatch lid stays clear of the board's flames
    }
  })
})
