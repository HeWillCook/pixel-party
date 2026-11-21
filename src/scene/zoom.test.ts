import { describe, expect, it } from 'vitest'
import {
  REST_CAMERA,
  SCENE_ZOOM_MS,
  handoffProgress,
  lerpCamera,
  sceneEase,
  sceneEaseTime,
  type ZoomHandoff,
} from './zoom'

describe('scene zoom curve', () => {
  it('starts and ends at rest', () => {
    expect(sceneEase(0)).toBe(0)
    expect(sceneEase(1)).toBe(1)
    expect(sceneEase(-1)).toBe(0)
    expect(sceneEase(2)).toBe(1)
  })

  it('is monotonic and eases in before it eases out', () => {
    let previous = 0
    for (let i = 1; i <= 100; i++) {
      const value = sceneEase(i / 100)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
    // Ease-in: the first tenth of the time covers much less than a tenth of the distance.
    expect(sceneEase(0.1)).toBeLessThan(0.05)
    // Ease-out: the last tenth of the time covers very little distance.
    expect(1 - sceneEase(0.9)).toBeLessThan(0.05)
  })

  it('keeps the first frame tiny so the zoom never lurches', () => {
    const oneFrame = 16.7 / SCENE_ZOOM_MS
    expect(sceneEase(oneFrame)).toBeLessThan(0.01)
  })

  it('maps eased progress back to the wall-clock fraction', () => {
    for (const x of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      expect(sceneEaseTime(sceneEase(x))).toBeCloseTo(x, 4)
    }
  })
})

describe('zoom hand-off', () => {
  const duration = SCENE_ZOOM_MS
  const handoff: ZoomHandoff = { at: 1000, durationMs: duration, progress: 0.72, from: REST_CAMERA, to: { x: -3247, y: -1290, zoom: 3.04 } }

  it('reports the recorded progress at the hand-off instant', () => {
    expect(handoffProgress(handoff, handoff.at)).toBeCloseTo(0.72, 3)
  })

  it('finishes exactly one duration after the original curve began', () => {
    const elapsedAlready = sceneEaseTime(handoff.progress) * duration
    expect(handoffProgress(handoff, handoff.at + (duration - elapsedAlready))).toBeCloseTo(1, 3)
  })

  it('keeps advancing monotonically from the swap', () => {
    let previous = handoffProgress(handoff, handoff.at)
    for (let elapsed = 16; elapsed <= duration; elapsed += 16) {
      const value = handoffProgress(handoff, handoff.at + elapsed)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('continues the same camera path, not a restart from rest', () => {
    const target = { x: -3247, y: -1290, zoom: 3.04 }
    const atSwap = lerpCamera(REST_CAMERA, target, handoffProgress(handoff, handoff.at))
    const nextFrame = lerpCamera(REST_CAMERA, target, handoffProgress(handoff, handoff.at + 16))
    expect(atSwap.zoom).toBeGreaterThan(1.5)
    expect(nextFrame.zoom).toBeGreaterThan(atSwap.zoom)
  })
})

describe('lerpCamera', () => {
  it('clamps and interpolates every component', () => {
    const from = { x: 10, y: -20, zoom: 3 }
    const to = { x: 0, y: 0, zoom: 1 }
    expect(lerpCamera(from, to, 0)).toEqual(from)
    expect(lerpCamera(from, to, 1)).toEqual(to)
    expect(lerpCamera(from, to, 0.5)).toEqual({ x: 5, y: -10, zoom: 2 })
    expect(lerpCamera(from, to, -3)).toEqual(from)
    expect(lerpCamera(from, to, 4)).toEqual(to)
  })
})
