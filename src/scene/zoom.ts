import type { Camera } from './camera'

/**
 * Shared porch zoom timing. Every porch zoom (daily easel, scores chalkboard, gallery wall)
 * and its reverse uses this duration and curve so the whole app reads as one motion.
 */
export const SCENE_ZOOM_MS = 800
/** Route swaps land here so the destination still has ~30% of the curve left to keep moving. */
export const SCENE_ZOOM_HANDOFF_MS = Math.round(SCENE_ZOOM_MS * 0.55)
/** A chained move (a close-up on its way to the studio below) hands over earlier: the floor pan has the rest of the work. */
export const SCENE_ZOOM_CHAIN_MS = Math.round(SCENE_ZOOM_MS * 0.2)
/**
 * The one camera curve: a gentle start (no first-frame lurch), a confident middle that peaks at about 3.4x the average
 * speed 40% in, and a long soft settle. It is a single monotonic cubic-bezier, so `sceneEase` below is its exact script
 * twin, which a hand-off between pages relies on. Change both together, and the `--scene-zoom-easing` fallbacks in CSS.
 */
export const SCENE_ZOOM_EASING = 'cubic-bezier(0.6, 0, 0.2, 1)'

const X1 = 0.6
const X2 = 0.2
const Y1 = 0
const Y2 = 1

/** One axis of a cubic-bezier from 0..1, evaluated at t. */
function bezier(t: number, p1: number, p2: number): number {
  const mt = 1 - t
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t
}

/** Bezier parameter t whose curve value on the given axis is `value`. */
function solve(value: number, p1: number, p2: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  let lo = 0
  let hi = 1
  let t = value
  for (let i = 0; i < 24; i++) {
    const current = bezier(t, p1, p2)
    if (Math.abs(current - value) < 1e-6) break
    if (current < value) lo = t
    else hi = t
    t = (lo + hi) / 2
  }
  return t
}

/** Eased progress (0..1) for linear progress x, matching SCENE_ZOOM_EASING exactly. */
export function sceneEase(x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  return bezier(solve(x, X1, X2), Y1, Y2)
}

/** Inverse of `sceneEase` on the curve axis: the bezier parameter whose eased value is y. */
export function sceneEaseInverse(y: number): number {
  if (y <= 0) return 0
  if (y >= 1) return 1
  return solve(y, Y1, Y2)
}

/** Linear time fraction (0..1) at which the eased curve reaches `y` — wall clock, not the bezier parameter. */
export function sceneEaseTime(y: number): number {
  if (y <= 0) return 0
  if (y >= 1) return 1
  return bezier(sceneEaseInverse(y), X1, X2)
}

export function lerpCamera(from: Camera, to: Camera, p: number): Camera {
  const t = Math.min(1, Math.max(0, p))
  if (t <= 0) return { ...from }
  if (t >= 1) return { ...to }
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    zoom: from.zoom + (to.zoom - from.zoom) * t,
  }
}

export const REST_CAMERA: Camera = { x: 0, y: 0, zoom: 1 }

/** Reads a `translate(...) scale(...)` transform back into a camera. */
export function readCameraTransform(element: Element | null): Camera | null {
  if (!element || typeof window === 'undefined') return null
  const raw = getComputedStyle(element).transform
  if (!raw || raw === 'none') return { ...REST_CAMERA }
  const match = raw.match(/matrix\(([^)]+)\)/)
  if (!match) return null
  const parts = match[1].split(',').map(value => Number(value.trim()))
  if (parts.length !== 6 || parts.some(value => !Number.isFinite(value))) return null
  return { x: parts[4], y: parts[5], zoom: parts[0] }
}

/**
 * A zoom already in flight when the route changes. The receiving page continues the exact same curve, so the
 * canvas keeps moving through the swap instead of restarting or snapping. `from` and `to` are the two poses the
 * sender was flying between (rest, the chalkboard, the gallery rack, the mailbox...), so any close-up can hand
 * over to any other, and `to` is the exact camera the receiver lands on rather than one it re-derives from its
 * own (possibly scrollbar-shifted) viewport.
 */
export type ZoomHandoff = { at: number; durationMs: number; progress: number; from: Camera; to: Camera }

/** Snapshots the live zoom of `element`, mapping its current camera between `from` and `to`. */
export function zoomHandoffAt(
  element: Element | null,
  from: Camera,
  to: Camera,
  durationMs: number,
): ZoomHandoff | null {
  const current = readCameraTransform(element)
  if (!current) return null
  // How far along the straight line from `from` to `to` the live camera is (the CSS transition interpolates every
  // component linearly, so the camera never leaves that line). Zoom is weighted so it counts beside pixel travel.
  const dx = to.x - from.x, dy = to.y - from.y, dz = (to.zoom - from.zoom) * 400
  const length = dx * dx + dy * dy + dz * dz
  const along = length === 0 ? 1 : ((current.x - from.x) * dx + (current.y - from.y) * dy + (current.zoom - from.zoom) * 400 * dz) / length
  const progress = Math.min(1, Math.max(0, along))
  return { at: performance.now(), durationMs, progress, from: { ...from }, to: { ...to } }
}

/** Eased progress of a hand-off at `now`, on the original (never restarted) curve. */
export function handoffProgress(handoff: ZoomHandoff, now = performance.now()): number {
  // Where the original curve already was (in wall-clock time), plus the time since the hand-off.
  const curveStart = sceneEaseTime(handoff.progress) * handoff.durationMs
  const elapsed = Math.max(0, now - handoff.at)
  const advanced = sceneEase((curveStart + elapsed) / handoff.durationMs)
  // Never step backwards from the frame that was already on screen when the route changed.
  return Math.max(handoff.progress, advanced)
}

/**
 * The hand-off zoom a porch is currently running, so a move that snapshots the scene mid-zoom (the floor pan taking
 * over from a half-finished zoom-out) can keep that zoom going inside its copy instead of freezing it.
 */
let runningZoom: { handoff: ZoomHandoff; from: Camera; to: Camera } | null = null
export function setRunningZoom(zoom: { handoff: ZoomHandoff; from: Camera; to: Camera } | null): void { runningZoom = zoom }
/** The camera that running zoom is at now, or null when none is running. */
export function runningZoomCamera(now = performance.now()): Camera | null {
  if (!runningZoom) return null
  const progress = handoffProgress(runningZoom.handoff, now)
  return progress >= 1 ? null : lerpCamera(runningZoom.from, runningZoom.to, progress)
}
