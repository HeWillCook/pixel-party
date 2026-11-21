import { cameraFor, type Camera, type Composition, type Rect } from '../camera'
import { porchLayout } from './layout'
import { MAILBOX_GAP, mailboxFraming } from './mailboxCamera'

/** Porch close-ups that need no route of their own: the house-rules note and the mailbox's account menu. */
export type LocalKind = 'rules' | 'mailbox'

export interface LocalCloseup {
  camera: Camera
  /** The settled rect of the object the close-up's HTML grows out of (the paper itself, or the mailbox). */
  anchor: Rect
  /** The scene object (in scene units) the camera is on while the HTML is still small. */
  focus: Rect
  /** Where the HTML panel settles (the rules paper, or the mailbox's menu card beside or above it). */
  panel: Rect
}

const NOTE_ASPECT = 15 / 22

export function localCloseup(kind: LocalKind, viewport: { w: number; h: number }, composition: Composition, navHeight: number): LocalCloseup {
  if (kind === 'rules') {
    const focus = porchLayout[composition].note
    const height = Math.max(120, Math.min(560, viewport.h - navHeight - 40))
    const width = Math.min(viewport.w - 32, height * NOTE_ASPECT)
    const paperH = width / NOTE_ASPECT
    const paper: Rect = { x: (viewport.w - width) / 2, y: navHeight + (viewport.h - navHeight - paperH) / 2, w: width, h: paperH }
    return { camera: cameraFor(focus, paper, viewport, composition), anchor: paper, focus, panel: paper }
  }
  const framing = mailboxFraming(viewport, composition)
  const focus = porchLayout[composition].mailbox
  const panel: Rect = framing.mode === 'side'
    ? { x: framing.rect.x + framing.rect.w + MAILBOX_GAP, y: Math.max(navHeight + 16, framing.rect.y), w: Math.min(340, viewport.w - (framing.rect.x + framing.rect.w + MAILBOX_GAP) - 16), h: 0 }
    : { x: 16, y: navHeight + 16, w: viewport.w - 32, h: 0 }
  return { camera: framing.camera, anchor: framing.rect, focus, panel }
}
