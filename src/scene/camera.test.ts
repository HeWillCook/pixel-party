import { describe, expect, it } from 'vitest'
import { cameraFor, compositionFor, integerScale, rectToPercent, scenePointToScreen, sceneSize } from './camera'

describe('scene camera', () => {
  it('uses the identity for the wide view', () => {
    expect(cameraFor(null, null, { w: 1440, h: 900 }, 'landscape')).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('maps a focus rectangle to its screen target', () => {
    const focus = { x: 104, y: 26, w: 96, h: 96 }
    const target = { x: 500, y: 120, w: 576, h: 576 }
    const viewport = { w: 1440, h: 900 }
    const scale = integerScale(viewport.w, viewport.h, 'landscape')
    const size = sceneSize('landscape')
    const camera = cameraFor(focus, target, viewport, 'landscape')
    expect((viewport.w - size.w * scale) / 2 + camera.x + focus.x * scale * camera.zoom).toBeCloseTo(target.x, 0)
    expect((viewport.h - size.h * scale) / 2 + camera.y + focus.y * scale * camera.zoom).toBeCloseTo(target.y, 0)
    expect(focus.w * scale * camera.zoom).toBeCloseTo(target.w, 0)
    expect(focus.h * scale * camera.zoom).toBeCloseTo(target.h, 0)
  })

  it('selects compositions from the aspect ratio', () => {
    expect(compositionFor(1440, 900)).toBe('landscape')
    expect(compositionFor(375, 812)).toBe('portrait')
  })

  it('uses integer cover scaling with a minimum of two', () => {
    expect(integerScale(1440, 900, 'landscape')).toBe(5)
    expect(integerScale(375, 812, 'portrait')).toBe(3)
    expect(integerScale(1, 1, 'landscape')).toBe(2)
  })

  it('converts scene rectangles to percentages', () => {
    expect(rectToPercent({ x: 32, y: 18, w: 64, h: 36 }, 'landscape')).toEqual({ left: '10%', top: '10%', width: '20%', height: '20%' })
  })

  it('projects a scene point through the centred integer scale and camera transform', () => {
    const viewport = { w: 1440, h: 900 }
    const scale = integerScale(viewport.w, viewport.h, 'landscape')
    const size = sceneSize('landscape')
    // Identity camera: the porch hatch centre lands on its plain scaled pixel.
    expect(scenePointToScreen({ x: 102.5, y: 159.5 }, { x: 0, y: 0, zoom: 1 }, viewport, 'landscape')).toEqual({
      cx: (viewport.w - size.w * scale) / 2 + 102.5 * scale,
      cy: (viewport.h - size.h * scale) / 2 + 159.5 * scale,
    })
    // A zoomed camera centred on the same point puts it back on the viewport centre.
    const focus = { x: 85, y: 155, w: 35, h: 15 }
    const camera = cameraFor(focus, { x: 0, y: 0, w: viewport.w, h: viewport.h }, viewport, 'landscape')
    const projected = scenePointToScreen({ x: focus.x + focus.w / 2, y: focus.y + focus.h / 2 }, camera, viewport, 'landscape')
    expect(projected.cx).toBeCloseTo(viewport.w / 2, 6)
    expect(projected.cy).toBeCloseTo(viewport.h / 2, 6)
    // Portrait keeps the same contract while the canvas is taller than the viewport.
    const portraitViewport = { w: 375, h: 812 }
    const portraitScale = integerScale(portraitViewport.w, portraitViewport.h, 'portrait')
    const portraitSize = sceneSize('portrait')
    const portraitPoint = scenePointToScreen({ x: 94, y: 206 }, { x: 12, y: -8, zoom: 2 }, portraitViewport, 'portrait')
    expect(portraitPoint).toEqual({
      cx: (portraitViewport.w - portraitSize.w * portraitScale) / 2 + 12 + 94 * portraitScale * 2,
      cy: (portraitViewport.h - portraitSize.h * portraitScale) / 2 - 8 + 206 * portraitScale * 2,
    })
  })
})
