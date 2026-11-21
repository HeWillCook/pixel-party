import type { Camera, Composition } from '../camera'
import { wallTargetCamera } from './wallLayout'

/** Camera on the gallery wall: a horizontal pan along the porch at the rest zoom (see `wallLayout.ts`). */
export function galleryTargetCamera(viewport: { w: number; h: number }, composition: Composition): Camera {
  return wallTargetCamera(viewport, composition)
}
