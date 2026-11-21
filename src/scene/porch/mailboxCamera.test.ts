import { describe, expect, it } from 'vitest'
import { compositionFor, integerScale, sceneSize } from '../camera'
import { porchLayout } from './layout'
import { MAILBOX_ZOOM, mailboxFraming, mailboxTargetCamera } from './mailboxCamera'

describe('mailboxCamera', () => {
  it.each([
    { w: 1440, h: 900 },
    { w: 1280, h: 720 },
    { w: 375, h: 812 },
    { w: 768, h: 1024 },
  ])('frames the mailbox with no bare canvas edges at $w×$h', ({ w, h }) => {
    const comp = compositionFor(w, h)
    const size = sceneSize(comp)
    const scale = integerScale(w, h, comp)
    const camera = mailboxTargetCamera({ w, h })
    const mailbox = porchLayout[comp].mailbox
    expect(camera.zoom).toBe(MAILBOX_ZOOM)

    // The scene must still cover the viewport (the clamp keeps it flush, never letterboxed).
    const canvasW = size.w * scale * camera.zoom
    const canvasH = size.h * scale * camera.zoom
    const ox = (w - size.w * scale) / 2
    const oy = (h - size.h * scale) / 2
    expect(ox + camera.x).toBeLessThanOrEqual(0.5)
    expect(ox + camera.x + canvasW).toBeGreaterThanOrEqual(w - 0.5)
    expect(oy + camera.y).toBeLessThanOrEqual(0.5)
    expect(oy + camera.y + canvasH).toBeGreaterThanOrEqual(h - 0.5)

    // And the mailbox itself has to stay on screen.
    const left = ox + camera.x + mailbox.x * scale * camera.zoom
    const top = oy + camera.y + mailbox.y * scale * camera.zoom
    const right = left + mailbox.w * scale * camera.zoom
    const bottom = top + mailbox.h * scale * camera.zoom
    expect(left).toBeGreaterThan(-1)
    expect(top).toBeGreaterThan(-1)
    expect(right).toBeLessThan(w + 1)
    expect(bottom).toBeLessThan(h + 1)
  })

  it('returns a rest camera before the first measure', () => {
    expect(mailboxTargetCamera({ w: 0, h: 0 })).toEqual({ x: 0, y: 0, zoom: MAILBOX_ZOOM })
  })

  it('frames the mailbox beside the letter when there is room, and below it when there is not', () => {
    const wide = mailboxFraming({ w: 1440, h: 900 })
    expect(wide.mode).toBe('side')
    expect(wide.rect.x).toBeGreaterThan(0)
    expect(wide.rect.x + wide.rect.w).toBeLessThan(1440 / 2)

    const phone = mailboxFraming({ w: 375, h: 812 })
    expect(phone.mode).toBe('below')
    // Centred horizontally, pinned low so the letter can sit above it.
    expect(Math.abs(phone.rect.x + phone.rect.w / 2 - 375 / 2)).toBeLessThanOrEqual(1)
    expect(phone.rect.y + phone.rect.h).toBeGreaterThan(812 * 0.85)
  })
})
