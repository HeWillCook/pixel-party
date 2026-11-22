import { expect, describe, it } from 'vitest'
import {
  clampPan,
  clampZoom,
  contentPointAt,
  distanceBetween,
  IDENTITY_ZOOM,
  MAX_ZOOM,
  midpoint,
  pinchUpdate,
  toFramePoint,
  zoomAt,
} from './usePinchZoom'

const frame = { width: 320, height: 320 }

describe('zoom clamping', () => {
  it('stays between 1x and 5x, and treats junk as 1x', () => {
    expect(clampZoom(0.2)).toBe(1)
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(2.5)).toBe(2.5)
    expect(clampZoom(9)).toBe(MAX_ZOOM)
    expect(clampZoom(Number.NaN)).toBe(1)
  })

  it('is the identity at 1x, whatever the incoming offset', () => {
    expect(clampPan({ zoom: 1, x: -40, y: 12 }, frame.width, frame.height)).toEqual(IDENTITY_ZOOM)
    expect(clampPan({ zoom: 0.5, x: 0, y: 0 }, frame.width, frame.height)).toEqual(IDENTITY_ZOOM)
  })

  it('never lets a zoomed board leave a blank edge', () => {
    expect(clampPan({ zoom: 2, x: 100, y: 100 }, 320, 320)).toEqual({ zoom: 2, x: 0, y: 0 })
    expect(clampPan({ zoom: 2, x: -900, y: -900 }, 320, 320)).toEqual({ zoom: 2, x: -320, y: -320 })
    expect(clampPan({ zoom: 4, x: -100, y: -800 }, 320, 320)).toEqual({ zoom: 4, x: -100, y: -800 })
  })

  it('keeps the board inside the frame when the frame has no size yet', () => {
    expect(clampPan({ zoom: 3, x: -50, y: -50 }, 0, 0)).toEqual({ zoom: 3, x: 0, y: 0 })
  })
})

describe('zoomAt', () => {
  it('keeps the content point under the anchor fixed', () => {
    const anchor = { x: 100, y: 80 }
    const next = zoomAt(IDENTITY_ZOOM, anchor, 2, frame.width, frame.height)
    expect(next).toEqual({ zoom: 2, x: -100, y: -80 })
    expect(contentPointAt(next, anchor)).toEqual({ x: 100, y: 80 })
  })

  it('pans within the clamp so a corner anchor can still be centred', () => {
    const anchor = { x: 10, y: 10 }
    const next = zoomAt(IDENTITY_ZOOM, anchor, 2, frame.width, frame.height)
    expect(next).toEqual({ zoom: 2, x: -10, y: -10 })
    expect(contentPointAt(next, anchor)).toEqual(anchor)
  })

  it('refuses to zoom out below 1x', () => {
    const zoomed = zoomAt(IDENTITY_ZOOM, { x: 160, y: 160 }, 4, frame.width, frame.height)
    expect(zoomed.zoom).toBe(4)
    expect(zoomAt(zoomed, { x: 160, y: 160 }, 0.5, frame.width, frame.height)).toEqual(IDENTITY_ZOOM)
  })
})

describe('pinchUpdate', () => {
  it('scales by how far the fingers spread', () => {
    const start = { transform: IDENTITY_ZOOM, mid: { x: 160, y: 160 }, distance: 40 }
    const next = pinchUpdate(start, { x: 160, y: 160 }, 80, frame.width, frame.height)
    expect(next).toEqual({ zoom: 2, x: -160, y: -160 })
    expect(contentPointAt(next, { x: 160, y: 160 })).toEqual({ x: 160, y: 160 })
  })

  it('drags the content with the midpoint', () => {
    const start = { transform: IDENTITY_ZOOM, mid: { x: 160, y: 160 }, distance: 40 }
    const next = pinchUpdate(start, { x: 120, y: 140 }, 40, frame.width, frame.height)
    expect(next).toEqual({ zoom: 1, x: 0, y: 0 })
    const zoomed = pinchUpdate({ ...start, transform: { zoom: 2, x: -160, y: -160 } }, { x: 120, y: 140 }, 40, frame.width, frame.height)
    expect(zoomed).toEqual({ zoom: 2, x: -200, y: -180 })
  })

  it('caps the zoom and falls back when the fingers land on the same point', () => {
    const start = { transform: IDENTITY_ZOOM, mid: { x: 160, y: 160 }, distance: 10 }
    expect(pinchUpdate(start, { x: 160, y: 160 }, 500, frame.width, frame.height).zoom).toBe(MAX_ZOOM)
    const degenerate = { ...start, distance: 0 }
    expect(pinchUpdate(degenerate, { x: 160, y: 160 }, 50, frame.width, frame.height)).toEqual(IDENTITY_ZOOM)
  })
})

describe('frame-space helpers', () => {
  it('measures between touches and their midpoint', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(midpoint({ x: 10, y: 20 }, { x: 30, y: 40 })).toEqual({ x: 20, y: 30 })
  })

  it('undoes an ancestor scene scale', () => {
    // The frame is 320 CSS px wide but rendered at 640 px (the easel camera is at 2x).
    const rect = { left: 50, top: 20, width: 640, height: 640 }
    expect(toFramePoint(rect, frame, { x: 50 + 320, y: 20 + 160 })).toEqual({ x: 160, y: 80 })
    expect(toFramePoint(rect, frame, { x: 50, y: 20 })).toEqual({ x: 0, y: 0 })
  })

  it('passes client points through when the frame is not rendered yet', () => {
    const rect = { left: 0, top: 0, width: 0, height: 0 }
    expect(toFramePoint(rect, frame, { x: 12, y: 34 })).toEqual({ x: 12, y: 34 })
  })
})
