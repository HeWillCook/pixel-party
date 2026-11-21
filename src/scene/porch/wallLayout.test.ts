import { describe, expect, it } from 'vitest'
import { integerScale, projectRect, sceneSize, type Composition } from '../camera'
import { porchLayout } from './layout'
import { galleryTargetCamera } from './galleryCamera'
import { WALL_ARROW, wallPageCount, wallPageLayout, wallSlot, wallTargetCamera } from './wallLayout'

const VIEWPORTS = [{ w: 1980, h: 1240 }, { w: 1440, h: 900 }, { w: 1280, h: 720 }, { w: 1024, h: 768 }, { w: 768, h: 1024 }, { w: 375, h: 812 }, { w: 375, h: 667 }]
const compositionOf = (v: { w: number; h: number }): Composition => (v.w >= v.h ? 'landscape' : 'portrait')
const layoutOf = (viewport: { w: number; h: number }, count = 47) => {
  const composition = compositionOf(viewport)
  const scale = integerScale(viewport.w, viewport.h, composition)
  return { composition, scale, layout: wallPageLayout(composition, viewport, scale, count) }
}

describe('gallery wall', () => {
  it.each(VIEWPORTS)('is off-screen at the rest pose and on screen at the gallery pose at $w x $h', (viewport) => {
    const composition = compositionOf(viewport)
    const rest = { x: 0, y: 0, zoom: 1 }
    const pose = wallTargetCamera(viewport, composition)
    const wall = { x: -200, y: 0, w: 200, h: sceneSize(composition).h }
    // At rest no part of the wall is on screen: the centred scene block is always at least as wide as the viewport.
    expect(projectRect(wall, rest, viewport, composition).x + projectRect(wall, rest, viewport, composition).w).toBeLessThanOrEqual(0.001)
    // At the pose the camera is a pure pan at the rest zoom, and the wall's edge is where the porch begins.
    expect(pose.zoom).toBe(1)
    expect(pose.y).toBe(0)
    expect(pose.x).toBeGreaterThan(0)
    expect(galleryTargetCamera(viewport, composition)).toEqual(pose)
    const edge = projectRect({ x: 0, y: 0, w: 1, h: 1 }, pose, viewport, composition)
    expect(edge.x).toBeGreaterThan(viewport.w - integerScale(viewport.w, viewport.h, composition) * 8)
    expect(edge.x).toBeLessThanOrEqual(viewport.w)
    // The porch's gallery sign sits on the house wall inside the porch view, in both compositions.
    const sign = porchLayout[composition].gallery
    expect(sign.x).toBeGreaterThanOrEqual(0)
    expect(sign.x + sign.w).toBeLessThan(80)
  })

  it.each(VIEWPORTS)('hangs a page of whole rows and columns inside the view, below the nav and above the deck, at $w x $h', (viewport) => {
    const { composition, scale, layout } = layoutOf(viewport)
    const oy = (viewport.h - sceneSize(composition).h * scale) / 2
    const screen = (units: number) => units * scale
    const nav = viewport.w >= 768 ? 108 : 72
    expect(layout.perPage).toBe(layout.cols * layout.rows)
    expect(layout.perPage).toBeGreaterThanOrEqual(2)
    const edge = projectRect({ x: 0, y: 0, w: 1, h: 1 }, wallTargetCamera(viewport, composition), viewport, composition).x
    const view = { left: edge - viewport.w, right: edge }
    for (let index = 0; index < layout.perPage; index++) {
      const { frame, card } = wallSlot(layout, index, layout.perPage)
      const left = layout.rail.x + frame.x, top = layout.rail.y + frame.y
      expect(edge + screen(left), `painting ${index} left`).toBeGreaterThanOrEqual(0)
      expect(edge + screen(left + frame.w), `painting ${index} right`).toBeLessThanOrEqual(viewport.w)
      expect(oy + screen(top), `painting ${index} top`).toBeGreaterThanOrEqual(nav)
      expect(oy + screen(layout.rail.y + card.y + card.h), `painting ${index} bottom`).toBeLessThanOrEqual(viewport.h)
      expect(layout.rail.y + card.y + card.h).toBeLessThan(composition === 'landscape' ? 154 : 232)
    }
    expect(view.left).toBeLessThan(0)
    // Arrows either side of the rail with the gap between, the plank under it, nothing overlapping.
    expect(layout.arrowLeft.x + WALL_ARROW.w).toBeLessThanOrEqual(layout.rail.x)
    expect(layout.arrowRight.x).toBeGreaterThanOrEqual(layout.rail.x + layout.rail.w)
    expect(edge + screen(layout.arrowLeft.x)).toBeGreaterThanOrEqual(0)
    expect(edge + screen(layout.arrowRight.x + WALL_ARROW.w)).toBeLessThanOrEqual(viewport.w)
    expect(layout.arrowRight.x + WALL_ARROW.w).toBeLessThan(0)
    expect(layout.plank.y).toBeGreaterThanOrEqual(layout.rail.y + layout.rail.h - 8)
  })

  it('fills a page left to right, top to bottom in date order, centring a short last row, with no empty frames', () => {
    const { layout } = layoutOf({ w: 1980, h: 1240 })
    expect(layout.cols).toBeGreaterThanOrEqual(5)
    const full = Array.from({ length: layout.perPage }, (_, index) => wallSlot(layout, index, layout.perPage))
    expect(full[1].frame.x).toBeGreaterThan(full[0].frame.x)
    expect(full[1].frame.y).toBe(full[0].frame.y)
    expect(full[layout.cols].frame.x).toBe(full[0].frame.x) // the next row starts under the first
    expect(full[layout.cols].frame.y).toBeGreaterThan(full[0].card.y + full[0].card.h)
    // A page of one hangs in the middle of the first row, not in a corner.
    const only = wallSlot(layout, 0, 1)
    const mid = full[0].frame.x + (full[layout.cols - 1].frame.x + layout.frame - full[0].frame.x) / 2
    expect(Math.abs(only.frame.x + layout.frame / 2 - mid)).toBeLessThanOrEqual(layout.frame / 2 + 1)
  })

  it('counts pages: none for an empty wall, a partial last page for 47 paintings', () => {
    const { layout } = layoutOf({ w: 1980, h: 1240 })
    expect(wallPageCount(0, layout.perPage)).toBe(0)
    expect(wallPageCount(1, layout.perPage)).toBe(1)
    expect(wallPageCount(layout.perPage, layout.perPage)).toBe(1)
    expect(wallPageCount(layout.perPage + 1, layout.perPage)).toBe(2)
    expect(wallPageCount(47, layout.perPage)).toBe(Math.ceil(47 / layout.perPage))
  })

  it('does not grow with the paintings: the wall layout is the same for 1 or 5000', () => {
    const one = layoutOf({ w: 1440, h: 900 }, 40).layout
    const many = layoutOf({ w: 1440, h: 900 }, 5000).layout
    expect(many).toEqual(one)
  })
})
