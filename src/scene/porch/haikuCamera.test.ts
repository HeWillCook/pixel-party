import { describe, expect, it } from 'vitest'
import { projectRect, type Composition } from '../camera'
import { haikuLayout, haikuTargetCamera } from './haikuCamera'
import { porchHaiku, porchLayout } from './layout'

const VIEWPORTS = [{ w: 1980, h: 1240 }, { w: 1440, h: 900 }, { w: 375, h: 812 }]

describe("Haiku's corner (the 404 pose)", () => {
  it.each(VIEWPORTS)('frames him and the speech bubble (and keeps them apart) inside the screen below the nav at $w x $h', (viewport) => {
    const composition: Composition = viewport.w >= viewport.h ? 'landscape' : 'portrait'
    const camera = haikuTargetCamera(viewport, composition, 72)
    expect(camera.zoom).toBeGreaterThan(1.5)
    const { sit, bubble } = porchHaiku[composition]
    for (const [name, rect] of [['Haiku', { x: sit.x, y: sit.y, w: 28, h: 26 }], ['bubble', bubble]] as const) {
      const on = projectRect(rect, camera, viewport, composition)
      expect(on.x, `${name} left`).toBeGreaterThanOrEqual(-1)
      expect(on.x + on.w, `${name} right`).toBeLessThanOrEqual(viewport.w + 1)
      expect(on.y, `${name} top`).toBeGreaterThanOrEqual(71)
      expect(on.y + on.h, `${name} bottom`).toBeLessThanOrEqual(viewport.h + 1)
    }
    // The bubble stands beside him on a wide screen, above him on a phone: never over his face.
    if (composition === 'landscape') expect(bubble.x).toBeGreaterThanOrEqual(sit.x + 28)
    else expect(bubble.y + bubble.h).toBeLessThanOrEqual(sit.y)
    const { bubble: box, unit } = haikuLayout(camera, viewport, composition)
    expect(box.w / bubble.w).toBeCloseTo(unit, 5)
  })

  it('sits him where the napper lies (landscape) and on the deck beside the hatch (portrait)', () => {
    const cat = porchLayout.landscape.cat
    expect(porchHaiku.landscape.sit.x).toBeGreaterThanOrEqual(cat.x - 4)
    expect(porchHaiku.landscape.sit.x + 28).toBeLessThanOrEqual(cat.x + cat.w + 8)
    expect(porchHaiku.portrait.sit.y + 26).toBeLessThan(272) // clear of the phone's bottom dock
  })
})
