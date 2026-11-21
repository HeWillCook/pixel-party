import { projectRect, type Camera, type Composition, type Rect } from '../camera'
import { fitCloseupCamera } from './fitCamera'
import { porchHaiku } from './layout'

/** Camera on Haiku's spot: him, the spilled paint round him and his speech bubble: the 404 pose. */
export function haikuTargetCamera(viewport: { w: number; h: number }, composition: Composition, navHeight?: number): Camera {
  return fitCloseupCamera(porchHaiku[composition].fit, viewport, composition, navHeight)
}

/** Where the speech bubble lands on screen for a camera, and how many screen pixels one scene unit covers there. */
export function haikuLayout(camera: Camera, viewport: { w: number; h: number }, composition: Composition): { bubble: Rect; unit: number } {
  const bubble = projectRect(porchHaiku[composition].bubble, camera, viewport, composition)
  return { bubble, unit: bubble.w / porchHaiku[composition].bubble.w }
}
