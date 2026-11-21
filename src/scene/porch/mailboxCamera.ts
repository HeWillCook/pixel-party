import { compositionFor, integerScale, projectRect, sceneSize, type Camera, type Composition, type Rect } from '../camera'
import { porchLayout } from './layout'

/**
 * Close-up on the porch mailbox for the `/settings` hand-off. Kept small enough that the mailbox
 * stays a recognisable object beside the letter and no coarser than the Daily easel's scene pixels.
 */
export const MAILBOX_ZOOM = 2.4
/** Clear space between the mailbox and the letter column. */
export const MAILBOX_GAP = 24
/** Below this the letter stops being readable, so the layout stacks instead. */
export const MIN_LETTER_WIDTH = 300

export type MailboxMode = 'side' | 'below'
export type MailboxFraming = {
  mode: MailboxMode
  camera: Camera
  /** Settled mailbox rect in viewport coordinates. */
  rect: Rect
}

function clampAxis(desired: number, canvas: number, frame: number, offset: number) {
  return canvas <= frame ? (frame - canvas) / 2 - offset : Math.min(-offset, Math.max(frame - canvas - offset, desired))
}

/** The porch mailbox in viewport coordinates for a given camera. */
export function projectMailboxRect(
  camera: Camera,
  viewport: { w: number; h: number },
  composition?: Composition,
): Rect {
  if (!viewport.w || !viewport.h) return { x: 0, y: 0, w: 0, h: 0 }
  const shape = composition ?? compositionFor(viewport.w, viewport.h)
  return projectRect(porchLayout[shape].mailbox, camera, viewport, shape)
}

/**
 * Frames the mailbox either beside the letter (mailbox in the left third) or, when the viewport is
 * too narrow for both, above the letter's bottom edge with the mailbox pinned low.
 */
export function mailboxFraming(
  viewport: { w: number; h: number },
  composition?: Composition,
): MailboxFraming {
  const shape = composition ?? compositionFor(Math.max(1, viewport.w), Math.max(1, viewport.h))
  if (!viewport.w || !viewport.h) {
    return { mode: 'side', camera: { x: 0, y: 0, zoom: MAILBOX_ZOOM }, rect: { x: 0, y: 0, w: 0, h: 0 } }
  }
  const size = sceneSize(shape)
  const scale = integerScale(viewport.w, viewport.h, shape)
  const box = porchLayout[shape].mailbox
  const ox = (viewport.w - size.w * scale) / 2
  const oy = (viewport.h - size.h * scale) / 2
  const cx = (box.x + box.w / 2) * scale
  const cy = (box.y + box.h / 2) * scale
  const canvasW = size.w * scale * MAILBOX_ZOOM
  const canvasH = size.h * scale * MAILBOX_ZOOM

  // Side by side: flush to the left edge (the clamp keeps the scene covering the frame), vertically
  // centred on the mailbox.
  const sideCamera: Camera = {
    x: Math.round(clampAxis((size.w * scale) / 2 - cx * MAILBOX_ZOOM, canvasW, viewport.w, ox)),
    y: Math.round(clampAxis((size.h * scale) / 2 - cy * MAILBOX_ZOOM, canvasH, viewport.h, oy)),
    zoom: MAILBOX_ZOOM,
  }
  const sideRect = projectMailboxRect(sideCamera, viewport, shape)
  if (sideRect.x + sideRect.w + MAILBOX_GAP + MIN_LETTER_WIDTH <= viewport.w) {
    return { mode: 'side', camera: sideCamera, rect: sideRect }
  }

  // Stacked: mailbox centred and pinned near the bottom so the letter can sit above it.
  const bottomPinned = viewport.h - MAILBOX_GAP - oy - (box.y + box.h) * scale * MAILBOX_ZOOM
  const belowCamera: Camera = {
    x: Math.round(clampAxis((size.w * scale) / 2 - cx * MAILBOX_ZOOM, canvasW, viewport.w, ox)),
    y: Math.round(clampAxis(bottomPinned, canvasH, viewport.h, oy)),
    zoom: MAILBOX_ZOOM,
  }
  return { mode: 'below', camera: belowCamera, rect: projectMailboxRect(belowCamera, viewport, shape) }
}

/** Shared by the porch's mailbox zoom and the `/settings` backdrop so the hand-off never shifts. */
export function mailboxTargetCamera(
  viewport: { w: number; h: number },
  composition?: Composition,
): Camera {
  return mailboxFraming(viewport, composition).camera
}
