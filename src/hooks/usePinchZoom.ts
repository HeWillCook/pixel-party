import { useCallback, useEffect, useRef, useState } from 'react'

/** Smallest zoom is the board exactly filling its frame; largest is 5x. */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 5

export interface ZoomPoint {
  x: number
  y: number
}

/**
 * Zoom is a CSS transform on the canvas content: the content is scaled by `zoom`
 * around its top-left corner and then moved by (`x`, `y`). Both values are in the
 * drawing frame's own CSS pixels, so an ancestor scene zoom never has to be undone
 * here (points reach these helpers already converted with `toFramePoint`).
 */
export interface ZoomTransform {
  zoom: number
  x: number
  y: number
}

export interface PinchStart {
  transform: ZoomTransform
  /** Pinch midpoint at the moment the second finger landed, in frame pixels. */
  mid: ZoomPoint
  /** Distance between the two fingers at that moment, in frame pixels. */
  distance: number
}

/** A rendered element rect: what `getBoundingClientRect()` returns, ancestor transforms included. */
export interface RenderedRect {
  left: number
  top: number
  width: number
  height: number
}

export interface FrameSize {
  width: number
  height: number
}

export const IDENTITY_ZOOM: ZoomTransform = { zoom: MIN_ZOOM, x: 0, y: 0 }

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clampOffset(value: number, min: number): number {
  const clamped = Math.min(0, Math.max(min, value))
  // Normalise -0 so a clamped edge compares cleanly with the identity transform.
  return clamped === 0 ? 0 : clamped
}

/**
 * Keeps the scaled content covering the frame: at 1x the offset is zero, and at
 * higher zooms the content cannot be dragged far enough to leave a blank edge, so
 * the drawing can never be lost off-screen.
 */
export function clampPan(transform: ZoomTransform, frameWidth: number, frameHeight: number): ZoomTransform {
  const zoom = clampZoom(transform.zoom)
  if (zoom <= MIN_ZOOM) return IDENTITY_ZOOM
  const width = Math.max(0, finiteOr(frameWidth, 0))
  const height = Math.max(0, finiteOr(frameHeight, 0))
  // Both bounds are <= 0: 0 is fully panned right/down, width * (1 - zoom) fully left/up.
  return {
    zoom,
    x: clampOffset(finiteOr(transform.x, 0), width * (1 - zoom)),
    y: clampOffset(finiteOr(transform.y, 0), height * (1 - zoom)),
  }
}

/** The content point currently under `point` (frame pixels). */
export function contentPointAt(transform: ZoomTransform, point: ZoomPoint): ZoomPoint {
  const zoom = clampZoom(transform.zoom)
  return { x: (point.x - transform.x) / zoom, y: (point.y - transform.y) / zoom }
}

/** Zooms so the content point under `point` stays under it. */
export function zoomAt(
  transform: ZoomTransform,
  point: ZoomPoint,
  zoom: number,
  frameWidth: number,
  frameHeight: number,
): ZoomTransform {
  const next = clampZoom(zoom)
  const anchor = contentPointAt(transform, point)
  return clampPan(
    { zoom: next, x: point.x - anchor.x * next, y: point.y - anchor.y * next },
    frameWidth,
    frameHeight,
  )
}

export function midpoint(a: ZoomPoint, b: ZoomPoint): ZoomPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export function distanceBetween(a: ZoomPoint, b: ZoomPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Folds a live pinch into a transform: the scale change zooms, and the midpoint
 * moving drags the content with the fingers. Anchoring on the start midpoint keeps
 * the board under the pinch, so zooming in does not slide the drawing away.
 */
export function pinchUpdate(
  start: PinchStart,
  mid: ZoomPoint,
  distance: number,
  frameWidth: number,
  frameHeight: number,
): ZoomTransform {
  if (!(start.distance > 0) || !Number.isFinite(distance)) {
    return clampPan(start.transform, frameWidth, frameHeight)
  }
  const zoom = clampZoom(start.transform.zoom * (distance / start.distance))
  const anchor = contentPointAt(start.transform, start.mid)
  return clampPan(
    { zoom, x: mid.x - anchor.x * zoom, y: mid.y - anchor.y * zoom },
    frameWidth,
    frameHeight,
  )
}

/**
 * Converts a client point (viewport pixels) into the frame's own CSS pixels,
 * undoing any ancestor CSS transform — the porch/easel camera scales the whole
 * scene, so one client pixel is not one frame pixel while a zoom runs.
 */
export function toFramePoint(rect: RenderedRect, frame: FrameSize, client: ZoomPoint): ZoomPoint {
  const scaleX = rect.width > 0 ? frame.width / rect.width : 1
  const scaleY = rect.height > 0 ? frame.height / rect.height : 1
  return { x: (client.x - rect.left) * scaleX, y: (client.y - rect.top) * scaleY }
}

/**
 * Owns the board's zoom/pan. The transform is mirrored in a ref so pointer
 * handlers always read the latest value without re-subscribing, and the zoom
 * resets whenever the frame changes size (new board size, rotation, resize).
 */
export function usePinchZoom(frameWidth: number, frameHeight: number) {
  const [transform, setTransform] = useState<ZoomTransform>(IDENTITY_ZOOM)
  const transformRef = useRef<ZoomTransform>(IDENTITY_ZOOM)
  const frameRef = useRef<FrameSize>({ width: frameWidth, height: frameHeight })

  useEffect(() => {
    frameRef.current = { width: frameWidth, height: frameHeight }
  }, [frameWidth, frameHeight])

  useEffect(() => {
    transformRef.current = IDENTITY_ZOOM
    setTransform(IDENTITY_ZOOM)
  }, [frameWidth, frameHeight])

  const apply = useCallback((next: ZoomTransform) => {
    const { width, height } = frameRef.current
    const clamped = clampPan(next, width, height)
    transformRef.current = clamped
    setTransform(clamped)
  }, [])

  const reset = useCallback(() => apply(IDENTITY_ZOOM), [apply])

  return { transform, transformRef, apply, reset }
}
