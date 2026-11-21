export interface Rect { x: number; y: number; w: number; h: number }
export interface Camera { x: number; y: number; zoom: number }
export type Composition = 'landscape' | 'portrait'

export function compositionFor(viewportW: number, viewportH: number): Composition {
  return viewportW >= viewportH ? 'landscape' : 'portrait'
}

export function sceneSize(composition: Composition): { w: number; h: number } {
  return composition === 'landscape' ? { w: 320, h: 180 } : { w: 180, h: 320 }
}

export function integerScale(viewportW: number, viewportH: number, composition: Composition): number {
  const size = sceneSize(composition)
  return Math.max(2, Math.ceil(Math.max(viewportW / size.w, viewportH / size.h)))
}

export function cameraFor(focus: Rect | null, target: Rect | null, viewport: { w: number; h: number }, composition: Composition): Camera {
  if (!focus || !target) return { x: 0, y: 0, zoom: 1 }
  const size = sceneSize(composition)
  const scale = integerScale(viewport.w, viewport.h, composition)
  const zoom = Math.min(target.w / (focus.w * scale), target.h / (focus.h * scale))
  return {
    x: target.x + target.w / 2 - (viewport.w - size.w * scale) / 2 - (focus.x + focus.w / 2) * scale * zoom,
    y: target.y + target.h / 2 - (viewport.h - size.h * scale) / 2 - (focus.y + focus.h / 2) * scale * zoom,
    zoom,
  }
}

export function cameraTransform(camera: Camera): string {
  return `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`
}

/**
 * Projects a scene-space point to pixels inside a `PixelScene` root, matching its CSS exactly:
 * the centred integer-scaled block (`ox`/`oy`) plus the camera's `translate(...) scale(...)`.
 * Returned coordinates are relative to the scene element's top-left corner.
 */
export function scenePointToScreen(point: { x: number; y: number }, camera: Camera, viewport: { w: number; h: number }, composition: Composition): { cx: number; cy: number } {
  const size = sceneSize(composition)
  const scale = integerScale(viewport.w, viewport.h, composition)
  const ox = (viewport.w - size.w * scale) / 2
  const oy = (viewport.h - size.h * scale) / 2
  return {
    cx: ox + camera.x + point.x * scale * camera.zoom,
    cy: oy + camera.y + point.y * scale * camera.zoom,
  }
}

/**
 * Projects a scene-space rect to pixels inside a `PixelScene` root, matching its CSS exactly:
 * the centred integer-scaled block (`ox`/`oy`) plus the camera's `translate(...) scale(...)`.
 * Returned coordinates are relative to the scene element's top-left corner.
 */
export function projectRect(rect: Rect, camera: Camera, viewport: { w: number; h: number }, composition: Composition): Rect {
  const size = sceneSize(composition)
  const scale = integerScale(viewport.w, viewport.h, composition)
  const ox = (viewport.w - size.w * scale) / 2
  const oy = (viewport.h - size.h * scale) / 2
  return {
    x: ox + camera.x + rect.x * scale * camera.zoom,
    y: oy + camera.y + rect.y * scale * camera.zoom,
    w: rect.w * scale * camera.zoom,
    h: rect.h * scale * camera.zoom,
  }
}

export function rectToPercent(rect: Rect, composition: Composition): { left: string; top: string; width: string; height: string } {
  const size = sceneSize(composition)
  return { left: `${rect.x / size.w * 100}%`, top: `${rect.y / size.h * 100}%`, width: `${rect.w / size.w * 100}%`, height: `${rect.h / size.h * 100}%` }
}

/**
 * Like `cameraFor`, for a focus rect measured in the camera element's own pixels (scene units x integer
 * scale, before any camera transform). Used when the object to land on is an HTML element of the scene.
 */
export function cameraForLocal(local: Rect, target: Rect, viewport: { w: number; h: number }, composition: Composition): Camera {
  const size = sceneSize(composition)
  const scale = integerScale(viewport.w, viewport.h, composition)
  const zoom = Math.min(target.w / local.w, target.h / local.h)
  return {
    x: target.x + target.w / 2 - (viewport.w - size.w * scale) / 2 - (local.x + local.w / 2) * zoom,
    y: target.y + target.h / 2 - (viewport.h - size.h * scale) / 2 - (local.y + local.h / 2) * zoom,
    zoom,
  }
}
