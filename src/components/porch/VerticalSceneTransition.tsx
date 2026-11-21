import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { cameraTransform, compositionFor, integerScale, sceneSize } from '../../scene/camera'
import { DETAIL } from '../../scene/detail'
import { paintFloorSection } from '../../scene/porch/floorArt'
import { porchHatch } from '../../scene/porch/layout'
import { runningZoomCamera, SCENE_ZOOM_EASING, sceneEase } from '../../scene/zoom'
import { enableNavMotion, SCENE_NAV_EVENT, type SceneNavKind } from './returnFlag'
import { routeReady } from '../../prefetch-routes'
import './vertical-scene-transition.css'

export const VERTICAL_SCENE_TRANSITION_EVENT = 'pixel:vertical-scene-transition'
const TRANSITION_MS = 1000
// Scene pixels of floor cutaway between the two rooms (40 * integer scale CSS px).
const FLOOR_DEPTH = 40
const READY_TIMEOUT_MS = 1600
/** Pan progress at which a chained follow-up (a porch close-up) is released. */
const FOLLOWUP_AT = 0.5

type Followup = { kind: Exclude<SceneNavKind, 'porch' | 'party'>; path: string }
export type SceneKind = 'porch' | 'studio' | 'room'
export type SceneTransitionRequest = {
  source: SceneKind
  /** The page the move lands on. `direction` decides which layer it travels from. */
  target: SceneKind
  direction: 'down' | 'up'
  /** Route shown after the physical move. */
  path: string
  /** Replace the current history entry (a room is stepped into from the studio). */
  replace?: boolean
  /** Let the caller own the route change (browser back proceeds through its own blocker). */
  navigate?: boolean
  followup?: Followup
}
/** Backwards-compatible name used by the porch/studio callers. */
export type VerticalSceneTransitionRequest = SceneTransitionRequest

type ActiveTransition = {
  request: SceneTransitionRequest
  /** Snapshot of the room being left (it is unmounted by the route change). */
  source: HTMLElement
  /** The live `main` element; it travels with the incoming room so its overlays never remount. */
  main: HTMLElement
  shell: HTMLElement
  mainCssText: string
  /** Viewport (not `main`) size: the floor cutaway spans the whole frame. */
  width: number
  height: number
  scale: number
  floorHeight: number
  /** Top of the source scene inside the viewport (a play page's nav is in flow). */
  sourceTop: number
}

export function requestVerticalSceneTransition(request: SceneTransitionRequest): boolean {
  if (typeof window === 'undefined') return false
  enableNavMotion()
  const event = new CustomEvent<SceneTransitionRequest>(VERTICAL_SCENE_TRANSITION_EVENT, {
    cancelable: true,
    detail: request,
  })
  return !window.dispatchEvent(event)
}

/** Resets `main`'s scroll without inheriting the app's global `scroll-behavior: smooth`. */
function resetMainScroll(main: HTMLElement): void {
  const previous = main.style.scrollBehavior
  main.style.scrollBehavior = 'auto'
  main.scrollTop = 0
  main.style.scrollBehavior = previous
}

function appMain(): HTMLElement | null {
  return document.querySelector('.porch-shell > main')
}

function findScene(kind: SceneKind, root: HTMLElement | null): HTMLElement | null {
  if (!root) return null
  if (kind === 'porch') return root.querySelector<HTMLElement>('.porch-world')
  if (kind === 'studio') return root.querySelector<HTMLElement>('.studio-world')
  // A room is the studio scene plus its foreground: the move carries both.
  return root.querySelector<HTMLElement>('.studio-root')
}

function copyScene(source: HTMLElement, top: number): HTMLElement {
  const copy = source.cloneNode(true) as HTMLElement
  copy.setAttribute('aria-hidden', 'true')
  copy.setAttribute('inert', '')
  copy.classList.add('vertical-scene-transition__snapshot')
  copy.style.position = 'absolute'
  copy.style.top = `${top}px`
  copy.style.left = '0'
  copy.style.right = '0'
  copy.style.bottom = '0'
  copy.style.width = '100%'
  copy.style.height = 'auto'
  copy.style.minHeight = '0'
  copy.style.overflow = 'hidden'

  const originals = source.querySelectorAll('canvas')
  const copies = copy.querySelectorAll('canvas')
  for (let index = 0; index < originals.length; index++) {
    const original = originals[index]
    const target = copies[index]
    if (!target || original.width === 0 || original.height === 0) continue
    try {
      target.getContext('2d')?.drawImage(original, 0, 0)
    } catch {
      // Some decorative canvases may not expose a 2D context; the rest of the scene is still cloned.
    }
  }
  return copy
}

const READY_SELECTORS: Record<SceneKind, string[]> = {
  porch: ['.pixel-scene__canvas', '.porch-easel-copy', '.board-face', '.porch-basement-sign-copy'],
  studio: [
    '.pixel-scene__canvas',
    '.studio-corkboard',
    '[data-testid="join-room-form"]',
    '[data-testid="create-room-form"]',
    '.studio-magic-slot',
  ],
  room: [
    '.pixel-scene__canvas',
    '[data-testid="pixel-canvas"]',
    '[data-testid="room-lobby"]',
  ],
}

function sceneReady(kind: SceneKind, scene: HTMLElement | null): boolean {
  if (!scene) return false
  if (kind === 'studio' && scene.getAttribute('data-measured') !== '1') return false
  if (scene.classList.contains('porch-world--returning')) return false
  if (kind === 'room') {
    // A room is either a lobby or a live board; requiring both would always time out and let the
    // animation start mid-relayout (which read as a hard cut as the room swapped panels).
    const canvas = scene.querySelector<HTMLElement>('.pixel-scene__canvas')
    const content = scene.querySelector<HTMLElement>('[data-testid="pixel-canvas"], [data-testid="room-lobby"]')
    const contentBounds = content?.getBoundingClientRect()
    const canvasBounds = canvas?.getBoundingClientRect()
    return Boolean(contentBounds && contentBounds.width > 0 && contentBounds.height > 0
      && canvasBounds && canvasBounds.width > 0 && canvasBounds.height > 0)
  }
  return READY_SELECTORS[kind].every((selector) => {
    const element = scene.querySelector<HTMLElement>(selector)
    if (!element) return false
    const bounds = element.getBoundingClientRect()
    return bounds.width > 0 && bounds.height > 0
  })
}

function waitForScene(kind: SceneKind, root: HTMLElement, timeoutMs = READY_TIMEOUT_MS): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const start = performance.now()
    let raf = 0
    let timeout = 0
    let settled = false
    const finish = (scene: HTMLElement | null) => {
      if (settled) return
      settled = true
      cancelAnimationFrame(raf)
      clearTimeout(timeout)
      resolve(scene)
    }
    const check = () => {
      const scene = findScene(kind, root)
      if (sceneReady(kind, scene)) {
        finish(scene)
        return
      }
      if (performance.now() - start >= timeoutMs) {
        finish(scene)
        return
      }
      raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
    timeout = window.setTimeout(() => finish(findScene(kind, root)), timeoutMs + 50)
  })
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/**
 * Ease-in-out with a committed start: cubic-bezier(0.3, 0.05, 0.5, 1). The requested
 * cubic-bezier(0.55, 0, 0.25, 1) starts at zero velocity and peaks at ~2.9x average speed, which
 * reads as a snap mid-pan; this curve keeps immediate motion and a long soft landing at ~1.7x peak.
 */
const EASE = { x1: 0.3, y1: 0.05, x2: 0.5, y2: 1 }

function bezierAxis(t: number, p1: number, p2: number): number {
  const u = 1 - t
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t
}

function easeInOut(x: number): number {
  let t = x
  for (let i = 0; i < 6; i++) {
    const delta = bezierAxis(t, EASE.x1, EASE.x2) - x
    if (Math.abs(delta) < 1e-4) break
    const slope = 3 * (1 - t) * (1 - t) * EASE.x1
      + 6 * (1 - t) * t * (EASE.x2 - EASE.x1)
      + 3 * t * t * (1 - EASE.x2)
    if (Math.abs(slope) < 1e-6) break
    t = Math.min(1, Math.max(0, t - delta / slope))
  }
  return bezierAxis(t, EASE.y1, EASE.y2)
}

export function VerticalSceneTransition() {
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  const [active, setActive] = useState<ActiveTransition | null>(null)
  const activeRef = useRef<ActiveTransition | null>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const topPanel = useRef<HTMLDivElement>(null)
  const bottomPanel = useRef<HTMLDivElement>(null)
  const sectionCanvas = useRef<HTMLCanvasElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  useLayoutEffect(() => { navigateRef.current = navigate }, [navigate])

  useLayoutEffect(() => {
    const handle = (event: Event) => {
      const request = (event as CustomEvent<SceneTransitionRequest>).detail
      if (!request || activeRef.current) {
        if (request) event.preventDefault()
        return
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const main = appMain()
      const shell = main?.parentElement ?? null
      const source = findScene(request.source, main)
      if (!main || !shell || !source) return
      // A scrolled `main` is re-inserted when the move finishes and would lose its scroll offset
      // then, showing a one-frame shift. Normalise to the top before snapshotting either side.
      resetMainScroll(main)
      const shellBounds = shell.getBoundingClientRect()
      if (!shellBounds.width || !shellBounds.height) return

      const composition = compositionFor(shellBounds.width, shellBounds.height)
      const scale = integerScale(shellBounds.width, shellBounds.height, composition)
      const sourceTop = Math.max(0, source.getBoundingClientRect().top)
      const transition: ActiveTransition = {
        request,
        source: copyScene(source, sourceTop),
        main,
        shell,
        mainCssText: main.style.cssText,
        width: shellBounds.width,
        height: shellBounds.height,
        scale,
        floorHeight: FLOOR_DEPTH * scale,
        sourceTop,
      }
      document.documentElement.setAttribute('data-scene-moving', '')
      event.preventDefault()
      activeRef.current = transition
      setActive(transition)
    }
    window.addEventListener(VERTICAL_SCENE_TRANSITION_EVENT, handle)
    return () => window.removeEventListener(VERTICAL_SCENE_TRANSITION_EVENT, handle)
  }, [])

  useLayoutEffect(() => {
    if (!active) return
    const top = topPanel.current
    const bottom = bottomPanel.current
    const canvas = sectionCanvas.current
    const stage = track.current
    const root = overlay.current
    if (!root || !top || !bottom || !canvas || !stage) return

    const targetKind = active.request.target
    const direction = active.request.direction
    const sourcePanel = direction === 'down' ? top : bottom
    const targetPanel = direction === 'down' ? bottom : top

    sourcePanel.replaceChildren(active.source)
    // A move that takes over from a zoom still running (a close-up pulling back out) keeps that zoom going inside its
    // copy of the scene, so the pan and the last of the zoom-out are one camera path rather than a freeze and a pan.
    const copyCamera = active.source.querySelector<HTMLElement>('.pixel-scene__camera')
    let keepZooming = 0
    const followZoom = () => {
      const camera = runningZoomCamera()
      if (camera && copyCamera) copyCamera.style.setProperty('transform', cameraTransform(camera), 'important')
      keepZooming = requestAnimationFrame(followZoom)
    }
    followZoom()
    active.main.style.visibility = 'hidden'

    let startY = 0
    let endY = 0
    {
      const sceneWidth = sceneSize(compositionFor(active.width, active.height)).w
      // Painted at 2x detail; the CSS size below is unchanged.
      canvas.width = sceneWidth * DETAIL
      canvas.height = FLOOR_DEPTH * DETAIL
      const floorCtx = canvas.getContext('2d')
      if (floorCtx) {
        floorCtx.imageSmoothingEnabled = false
        floorCtx.scale(DETAIL, DETAIL)
        const { opening } = porchHatch[compositionFor(active.width, active.height)]
        paintFloorSection(floorCtx, sceneWidth, FLOOR_DEPTH, opening)
      }
      canvas.style.width = `${sceneWidth * active.scale}px`
      canvas.style.height = `${active.floorHeight}px`
      const trackHeight = active.height * 2 + active.floorHeight
      stage.style.height = `${trackHeight}px`
      startY = direction === 'down' ? 0 : -(active.height + active.floorHeight)
      endY = direction === 'down' ? -(active.height + active.floorHeight) : 0
      stage.style.transform = `translate3d(0, ${startY.toFixed(2)}px, 0)`
    }

    let finished = false
    let cancelled = false
    let mainMoved = false

    const restoreMain = () => {
      const { main, shell, mainCssText } = active
      if (mainMoved) {
        mainMoved = false
        if (root.parentElement === shell) shell.insertBefore(main, root)
        else shell.appendChild(main)
      }
      main.style.cssText = mainCssText
      resetMainScroll(main)
    }

    // A chained move (the basement to the chalkboard) must not wait for the floor to land: the porch starts its own
    // zoom while the last stretch of the pan is still settling, so the two read as one move.
    let followed = false
    const dispatchFollowup = () => {
      const followup = active.request.followup
      if (!followup || followed) return
      followed = true
      window.dispatchEvent(new CustomEvent(SCENE_NAV_EVENT, {
        cancelable: true,
        detail: { ...followup, verticalArrival: true },
      }))
    }

    const finish = () => {
      if (finished) return
      finished = true
      cancelAnimationFrame(keepZooming)
      restoreMain()
      document.documentElement.removeAttribute('data-scene-moving')
      activeRef.current = null
      setActive(null)
      dispatchFollowup()
    }

    const prepareAndAnimate = async () => {
      // Swap the route while the outgoing snapshot covers the screen, then wait for the incoming
      // room (and all of its DOM overlays) to paint. The live `main` then enters the off-screen
      // half of the stack, so nothing remounts at the end of the move.
      if (active.request.navigate !== false) {
        await routeReady(active.request.path)
        if (cancelled) return
        navigateRef.current(active.request.path, { state: { verticalScene: targetKind }, replace: active.request.replace })
      }
      await waitForScene(targetKind, active.main)
      await nextFrame()
      await nextFrame()
      if (cancelled) return

      // The target page may lay out its scene at a different offset (the studio's nav overlays
      // the scene, while a room's nav is in flow). Place `main` at that natural offset inside the
      // full-frame panel so restoring it after the move is pixel-identical.
      const targetScene = findScene(targetKind, active.main)
      const targetTop = targetScene ? Math.max(0, targetScene.getBoundingClientRect().top) : 0
      active.main.style.cssText = `${active.mainCssText};position:absolute;top:${targetTop}px;left:0;width:100%;height:${Math.max(0, active.height - targetTop)}px;min-height:0;overflow:hidden;visibility:hidden;`
      targetPanel.replaceChildren(active.main)
      mainMoved = true
      active.main.style.visibility = 'visible'
      await nextFrame()
      if (cancelled) return

      let landed = false
      const startedAt = performance.now()
      const animate = (now: number) => {
        if (cancelled) return
        const progress = Math.min(1, (now - startedAt) / TRANSITION_MS)
        if (progress >= FOLLOWUP_AT) dispatchFollowup()
        const y = startY + (endY - startY) * easeInOut(progress)
        stage.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate)
          return
        }
        // The landed frame paints once in place before `main` returns to the shell, so the
        // restore is invisible rather than a one-frame nudge.
        if (landed) return
        landed = true
        rafRef.current = requestAnimationFrame(() => finish())
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    void prepareAndAnimate().catch((error) => {
      // A destination that throws while mounting must not strand the overlay: restore the
      // shell and let the route swap stand (the router already owns the URL).
      console.error('[vertical-scene-transition] move failed', error)
      restoreMain()
      activeRef.current = null
      setActive(null)
    })

    return () => {
      cancelAnimationFrame(keepZooming)
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      restoreMain()
      document.documentElement.removeAttribute('data-scene-moving')
    }
  }, [active])

  if (!active || typeof document === 'undefined') return null
  const trackHeight = active.height * 2 + active.floorHeight
  return createPortal((
    <div ref={overlay} className="vertical-scene-transition" data-testid="vertical-scene-transition">
      <div
        ref={track}
        className="vertical-scene-transition__track"
        style={{ height: `${trackHeight}px`, width: `${active.width}px` }}
      >
        <div ref={topPanel} className="vertical-scene-transition__panel vertical-scene-transition__panel--top" style={{ height: `${active.height}px` }} />
        <div className="vertical-scene-transition__floor" style={{ top: `${active.height}px`, height: `${active.floorHeight}px` }}>
          <canvas ref={sectionCanvas} className="vertical-scene-transition__floor-art" />
        </div>
        <div ref={bottomPanel} className="vertical-scene-transition__panel vertical-scene-transition__panel--bottom" style={{ top: `${active.height + active.floorHeight}px`, height: `${active.height}px` }} />
      </div>
    </div>
  ), document.body)
}
