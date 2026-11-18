import { describe, expect, it } from 'vitest'
import { cameraFor, compositionFor, integerScale, rectToPercent, sceneSize } from './camera'

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
})
