import type { Camera, Composition } from '../camera'
import { REST_CAMERA } from '../zoom'
import { haikuTargetCamera } from './haikuCamera'
import { galleryTargetCamera } from './galleryCamera'
import { mailboxTargetCamera } from './mailboxCamera'
import { scoresTargetCamera } from './scoresCamera'

/** The places the porch camera rests: the whole porch, or close on one object. Every move is a flight between two of them. */
export type PorchPose = 'rest' | 'scores' | 'gallery' | 'mailbox' | 'haiku'

export function porchPose(pose: PorchPose, viewport: { w: number; h: number }, composition: Composition, navHeight: number): Camera {
  if (!viewport.w || !viewport.h) return { ...REST_CAMERA }
  switch (pose) {
    case 'scores': return scoresTargetCamera(viewport, composition, navHeight)
    case 'gallery': return galleryTargetCamera(viewport, composition)
    case 'mailbox': return mailboxTargetCamera(viewport, composition)
    case 'haiku': return haikuTargetCamera(viewport, composition, navHeight)
    default: return { ...REST_CAMERA }
  }
}
