import { cameraFor, integerScale, sceneSize, type Camera, type Composition, type Rect } from '../camera'

const DEFAULT_NAV_HEIGHT = 72
const MOBILE_BREAKPOINT = 640

/**
 * Camera that fits `fit` (a scene rect) in the viewport below the nav, centred, with the porch around it at the same scale.
 * Where the object stands near the porch's edge the scene still covers the frame instead of showing past its edge.
 */
export function fitCloseupCamera(fit: Rect, viewport: { w: number; h: number }, composition: Composition, navHeight = DEFAULT_NAV_HEIGHT): Camera {
  if (!viewport.w || !viewport.h) return { x: 0, y: 0, zoom: 1 }
  const gutter = viewport.w <= MOBILE_BREAKPOINT ? 8 : 24
  const target: Rect = { x: gutter, y: navHeight, w: Math.max(1, viewport.w - gutter * 2), h: Math.max(1, viewport.h - navHeight - gutter) }
  const camera = cameraFor(fit, target, viewport, composition)
  const size = sceneSize(composition)
  const scale = integerScale(viewport.w, viewport.h, composition)
  const ox = (viewport.w - size.w * scale) / 2
  const oy = (viewport.h - size.h * scale) / 2
  const clamp = (desired: number, canvas: number, frame: number, offset: number) =>
    canvas <= frame ? (frame - canvas) / 2 - offset : Math.min(-offset, Math.max(frame - canvas - offset, desired))
  return {
    x: clamp(camera.x, size.w * scale * camera.zoom, viewport.w, ox),
    y: clamp(camera.y, size.h * scale * camera.zoom, viewport.h, oy),
    zoom: camera.zoom,
  }
}
