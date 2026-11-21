import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { compositionFor, projectRect, type Camera, type Rect } from './camera'
import { readCameraTransform, REST_CAMERA } from './zoom'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * An element's layout rectangle in viewport coordinates with the registration transform lifted: `getBoundingClientRect`
 * on a board that is currently scaled onto the small easel would feed the shrunken rect straight back into the
 * camera maths. The registered root (`data-registered`) is un-transformed for the instant of the measurement only,
 * so the result keeps its fractional precision (summing integer `offsetLeft`s would drift by a few pixels). A caller
 * measuring several elements lifts the root once itself and passes `lifted` to avoid a layout per element.
 */
export function untransformedRect(element: HTMLElement, lifted = false): Rect {
  if (lifted) {
    const bounds = element.getBoundingClientRect()
    return { x: bounds.left, y: bounds.top, w: bounds.width, h: bounds.height }
  }
  const root = element.closest<HTMLElement>('[data-registered]')
  const saved = root ? root.style.transform : ''
  if (root) root.style.transform = ''
  const bounds = element.getBoundingClientRect()
  if (root) root.style.transform = saved
  return { x: bounds.left, y: bounds.top, w: bounds.width, h: bounds.height }
}

export interface RegistrationOptions {
  /** The element that contains the `PixelScene` (its client box is the scene's viewport). */
  host: RefObject<HTMLElement | null>
  /** The HTML assembly to glue to the scene: scaled and moved so `anchor` lands on `focus`. */
  root: RefObject<HTMLElement | null>
  /** The element inside `root` that is the board; its settled layout rect is the target of the zoom. */
  anchor: RefObject<HTMLElement | null>
  /** The scene rect (in scene units) the anchor stands on while the camera is away from it. */
  focus: (composition: ReturnType<typeof compositionFor>) => Rect
  /** True while the camera is moving (or about to). Off, every transform is cleared and the layout is exact. */
  active: boolean
  /** Panels inside `root` that slide out from behind the board as the camera arrives (and back in as it leaves). */
  panelSelector?: string
  /**
   * The camera for this frame when the page drives it itself (a hand-off continuing in script). Without it the
   * camera is read back from the scene's live CSS transform, which is what a CSS transition is painting.
   */
  getCamera?: () => Camera | null
}

type Panel = { element: HTMLElement; dx: number; dy: number }

/**
 * Glues an HTML close-up (board + the panels around it) to the scene object it grows out of.
 *
 * Every frame it reads the camera the scene is really painting with, projects `focus` through it and gives
 * `root` the transform that maps the settled board rect onto that projection. Because the projection is
 * linear in the camera, the assembly scales and travels with the scene art instead of appearing at full size.
 * Panels start hidden behind the board and slide out to their settled places, so nothing fades in. All of
 * it is imperative (no React state), so a page re-renders nothing per frame.
 */
export function useSceneRegistration({ host, root, anchor, focus, active, panelSelector, getCamera }: RegistrationOptions): void {
  // Read through a ref: a fresh closure each render must not restart the frame loop.
  const cameraSource = useRef(getCamera)
  cameraSource.current = getCamera
  const refresh = useRef<(() => void) | null>(null)
  // Every commit while glued: a board that a layout effect elsewhere just resized is re-measured before the browser can paint it.
  useIsomorphicLayoutEffect(() => { refresh.current?.() })
  useIsomorphicLayoutEffect(() => {
    const clear = () => {
      const target = root.current
      if (!target) return
      target.style.transform = ''
      target.style.transformOrigin = ''
      target.style.willChange = ''
      target.style.removeProperty('--panel-progress')
      if (panelSelector) for (const panel of target.querySelectorAll<HTMLElement>(panelSelector)) panel.style.transform = ''
    }
    if (!active) { clear(); return }
    const hostElement = host.current
    const rootElement = root.current
    const anchorElement = anchor.current
    if (!hostElement || !rootElement || !anchorElement) return

    // Settled geometry, measured with every transform out of the way. It is measured again whenever the layout under
    // the close-up changes size (a board that finishes sizing itself mid-move must not leave the glue on a stale rect).
    let rest: number | null = null
    let seenW = 0
    let seenH = 0
    let base: Rect = { x: 0, y: 0, w: 0, h: 0 }
    let baseCx = 0
    let baseCy = 0
    let panels: Panel[] = []
    const measure = (): boolean => {
      rest = null
      rootElement.style.transform = ''
      for (const panel of panels) panel.element.style.transform = ''
      base = untransformedRect(anchorElement, true)
      seenW = anchorElement.offsetWidth
      seenH = anchorElement.offsetHeight
      if (!base.w || !base.h) return false
      const rootBox = untransformedRect(rootElement, true)
      baseCx = base.x + base.w / 2
      baseCy = base.y + base.h / 2
      panels = panelSelector
        ? Array.from(rootElement.querySelectorAll<HTMLElement>(panelSelector)).map((element) => {
            const box = untransformedRect(element, true)
            return { element, dx: baseCx - (box.x + box.w / 2), dy: baseCy - (box.y + box.h / 2) }
          })
        : []
      rootElement.style.transformOrigin = `${baseCx - rootBox.x}px ${baseCy - rootBox.y}px`
      return true
    }
    if (!measure()) return
    rootElement.style.willChange = 'transform'

    const apply = () => {
      // A board that sized itself since the last measurement (a layout effect elsewhere) is measured before it is glued.
      // A board that sized itself, or panels that arrived (a room finishing connecting mid-move), since the last
      // measurement are measured before they are glued.
      const stale = anchorElement.offsetWidth !== seenW || anchorElement.offsetHeight !== seenH
        || (panelSelector !== undefined && rootElement.querySelectorAll(panelSelector).length !== panels.length)
      if (stale && !measure()) return
      const bounds = hostElement.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const camera = cameraSource.current?.() ?? readCameraTransform(hostElement.querySelector('.pixel-scene__camera')) ?? REST_CAMERA
      const viewport = { w: hostElement.clientWidth, h: hostElement.clientHeight }
      const composition = compositionFor(viewport.w, viewport.h)
      const sceneRect = focus(composition)
      const projected = projectRect(sceneRect, camera, viewport, composition)
      if (rest === null) rest = projectRect(sceneRect, REST_CAMERA, viewport, composition).w / base.w
      const scale = projected.w / base.w
      const tx = projected.x + projected.w / 2 - baseCx
      const ty = projected.y + projected.h / 2 - baseCy
      rootElement.style.transform = `translate3d(${tx.toFixed(3)}px, ${ty.toFixed(3)}px, 0) scale(${scale.toFixed(5)})`
      // 0 while the board is still the small easel, 1 once it has landed.
      const linear = rest >= 1 ? 1 : Math.min(1, Math.max(0, (scale - rest) / (1 - rest)))
      // Ease the slide out so the panels are well clear of the board before the camera settles.
      const progress = 1 - (1 - linear) ** 3
      rootElement.style.setProperty('--panel-progress', progress.toFixed(4))
      for (const panel of panels) {
        panel.element.style.transform = progress >= 1
          ? 'translate3d(0px, 0px, 0) scale(1)'
          : `translate3d(${(panel.dx * (1 - progress)).toFixed(2)}px, ${(panel.dy * (1 - progress)).toFixed(2)}px, 0) scale(${(0.3 + 0.7 * progress).toFixed(4)})`
      }
    }
    refresh.current = () => {
      const stale = anchorElement.offsetWidth !== seenW || anchorElement.offsetHeight !== seenH
        || (panelSelector !== undefined && rootElement.querySelectorAll(panelSelector).length !== panels.length)
      if (stale && measure()) apply()
    }
    apply()
    // Layout resizes land between the frame's callbacks and its paint: re-measure and re-apply in the same breath.
    const observer = new ResizeObserver(() => { if (measure()) apply() })
    observer.observe(anchorElement)
    observer.observe(rootElement)
    for (const panel of panels) observer.observe(panel.element)
    let raf = requestAnimationFrame(function tick() {
      apply()
      raf = requestAnimationFrame(tick)
    })
    return () => { refresh.current = null; observer.disconnect(); cancelAnimationFrame(raf); clear() }
  }, [active, host, root, anchor, focus, panelSelector])
}
