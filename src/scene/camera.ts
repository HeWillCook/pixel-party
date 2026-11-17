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

export function rectToPercent(rect: Rect, composition: Composition): { left: string; top: string; width: string; height: string } {
  const size = sceneSize(composition)
  return { left: `${rect.x / size.w * 100}%`, top: `${rect.y / size.h * 100}%`, width: `${rect.w / size.w * 100}%`, height: `${rect.h / size.h * 100}%` }
}
