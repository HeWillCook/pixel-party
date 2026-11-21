import { describe, expect, it } from 'vitest'
import { compositionFor, projectRect } from '../camera'
import { porchLayout } from './layout'
import { chalkboardFitRect, projectChalkboardRect, scoresTargetCamera, scoresTargetLayout } from './scoresCamera'

describe('scoresCamera', () => {
  it.each([
    { w: 1440, h: 900, nav: 72 },
    { w: 1280, h: 720, nav: 72 },
    { w: 375, h: 812, nav: 64 },
  ])('fits the whole chalkboard, thrusters included, below the nav at $w×$h', ({ w, h, nav }) => {
    const comp = compositionFor(w, h)
    const camera = scoresTargetCamera({ w, h }, comp, nav)
    const fit = projectRect(chalkboardFitRect(comp), camera, { w, h }, comp)
    expect(fit.x).toBeGreaterThanOrEqual(-1)
    expect(fit.x + fit.w).toBeLessThanOrEqual(w + 1)
    expect(fit.y).toBeGreaterThanOrEqual(nav - 1)
    expect(fit.y + fit.h).toBeLessThanOrEqual(h + 1)
    // The timber frame is inside the fitted rect, so the thrusters under it are in view too.
    const board = projectRect(porchLayout[comp].chalkboard, camera, { w, h }, comp)
    expect(board.y + board.h).toBeLessThan(fit.y + fit.h)
  })

  it.each([
    { w: 1440, h: 900, nav: 72 },
    { w: 375, h: 812, nav: 64 },
  ])('lays the HTML slate on the projected canvas slate at $w×$h', ({ w, h, nav }) => {
    const comp = compositionFor(w, h)
    const layout = scoresTargetLayout({ w, h }, comp, nav)
    const slate = projectChalkboardRect(scoresTargetCamera({ w, h }, comp, nav), { w, h }, comp)
    expect(layout.slate).toEqual(slate)
    expect(layout.stageMaxWidth).toBe(slate.w)
    expect(layout.slateMinHeight).toBe(slate.h)
    // Centred horizontally, so the board and its stage share a centre line.
    expect(Math.abs(slate.x + slate.w / 2 - w / 2)).toBeLessThanOrEqual(1)
  })
})
