import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { compositionFor, type Camera, type Composition, type Rect } from '../../scene/camera'
import { porchPose, type PorchPose } from '../../scene/porch/poses'
import { useSceneRegistration } from '../../scene/registration'
import { prefetchRoute, routeReady } from '../../prefetch-routes'
import { useStageMeasure } from './useStageMeasure'
import { useContinuingZoom } from '../../scene/useContinuingZoom'
import { handoffProgress, lerpCamera, REST_CAMERA, SCENE_ZOOM_CHAIN_MS, SCENE_ZOOM_HANDOFF_MS, SCENE_ZOOM_MS, zoomHandoffAt } from '../../scene/zoom'
import {
  consumeZoomHandoff,
  enableNavMotion,
  markSceneMove,
  peekZoomHandoff,
  queueSceneNavigation,
  SCENE_NAV_EVENT,
  setPorchChain,
  setZoomHandoff,
  type PorchChainDest,
  type SceneNavKind,
} from './returnFlag'

/** For a close-up with no HTML board to glue (the gallery wall is made of scene objects that pan with the camera on their own). */
const NO_FOCUS = (): Rect => ({ x: 0, y: 0, w: 1, h: 1 })

/**
 * The camera the close-up page now leaving is resting on (it is still mounted while the next page first renders), for a page nobody
 * flew to (an unknown URL) to start its own flight from instead of cutting to the porch.
 */
let last: { camera: Camera; endedAt: number | null } | null = null
const cameraJustLeft = (): Camera => (last && (last.endedAt === null || performance.now() - last.endedAt < 1000) ? last.camera : REST_CAMERA)

export interface PorchCloseupOptions {
  /** The pose this page rests in: the camera is on that object and the page's HTML is laid out over it. */
  pose: Exclude<PorchPose, 'rest'>
  /** The scene rect (in scene units) the page's board stands on while the camera is away from it. */
  focus?: (composition: Composition) => Rect
  /** Finds the board inside the registered root: its settled layout rect is where the camera lands. */
  anchorSelector?: string
  /** The nav kind of this page, so a nav request for the page you are already on is left alone. */
  kind: Extract<SceneNavKind, 'scores' | 'gallery'> | 'haiku'
  /** True when `path` is this very page (leave the request to the router). */
  isSelf?: (path: string) => boolean
  /** A page nobody flew to (an unknown URL typed or linked in-app): start from the porch's rest pose and fly in itself. */
  flyIn?: boolean
}

/**
 * One porch close-up (the Scores chalkboard, the gallery rack): the porch scene stays under it at the same scale,
 * the page's HTML board is glued to the canvas object frame by frame, and every way out is a camera flight to
 * another pose: rest, or straight to another close-up without passing through the porch.
 *
 * Arriving continues the zoom the sender had running; leaving flies, then hands the running zoom to the next page.
 */
export function usePorchCloseup({ pose, focus = NO_FOCUS, anchorSelector = '[data-closeup-anchor]', kind, isSelf, flyIn = false }: PorchCloseupOptions) {
  const navigate = useNavigate()
  // A cold load (first entry in the history) is simply there; any later arrival with no hand-off flies in from the porch.
  const cold = useLocation().key === 'default'
  const backdropRef = useRef<HTMLDivElement>(null)
  const registerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cleared on unmount: a swap still waiting on its chunk must not fire (or leave a hand-off behind) after the page is gone.
  const alive = useRef(true)

  // The zoom the previous page still had running when the route changed: keep the same curve going.
  const [handoff] = useState(() => {
    if (typeof window === 'undefined') return null
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null
    return peekZoomHandoff()
  })
  useEffect(() => { if (handoff) consumeZoomHandoff() }, [handoff])

  // Stable framing: only a real window resize retargets the camera. A scrollbar appearing mid-zoom used to nudge it.
  const measure = useStageMeasure()
  const { viewport, navHeight } = measure
  const composition = compositionFor(viewport.w || 1, viewport.h || 1)

  // The pose this page rests in. A hand-off carries the exact camera the sender aimed at, so the two pages agree to the pixel.
  const landing = handoff?.to ?? porchPose(pose, viewport, composition, navHeight)
  const continued = useContinuingZoom(handoff, handoff?.from ?? REST_CAMERA, landing)
  const resting = continued ?? landing
  const restingRef = useRef(resting)
  restingRef.current = resting
  useEffect(() => { last = { camera: resting, endedAt: null } })
  const landingRef = useRef(landing)
  landingRef.current = landing
  const handoffRef = useRef(handoff)
  handoffRef.current = handoff

  const [exit, setExit] = useState<Camera | null>(null)
  const [flight, setFlight] = useState<Camera | null>(() => flyIn && !handoff && !cold && typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? cameraJustLeft() : null)
  // Mount only: one frame at the porch's rest pose, then the camera transition carries it to the landing.
  useEffect(() => {
    if (!flight) return
    const raf = requestAnimationFrame(() => setFlight(landingRef.current))
    const done = setTimeout(() => setFlight(null), SCENE_ZOOM_MS + 50)
    return () => { cancelAnimationFrame(raf); clearTimeout(done) }
  }, [])
  const camera: Camera = exit ?? flight ?? resting

  const slotAnchor = useMemo(() => ({
    get current() { return registerRef.current?.querySelector<HTMLElement>(anchorSelector) ?? null },
  }), [anchorSelector])
  useSceneRegistration({
    host: backdropRef,
    root: registerRef,
    anchor: slotAnchor as RefObject<HTMLElement | null>,
    focus,
    active: Boolean(continued) || exit !== null || flight !== null,
    // A continuing hand-off is painted from script, not from a CSS transition: ask the same clock.
    getCamera: () => {
      const running = handoffRef.current
      return running && !exit ? lerpCamera(running.from, landingRef.current, handoffProgress(running)) : null
    },
  })

  /**
   * Fly to another pose, then land on its page. Going to the porch with a chained destination (the studio below)
   * lands the zoom here first and hands the porch the follow-up; any other flight hands the running zoom over at
   * 55% so the next page keeps the same curve moving.
   */
  const startExit = useCallback((to: PorchPose, path: string, chain?: PorchChainDest) => {
    if (timerRef.current) { queueSceneNavigation(chain?.path ?? path); return }
    enableNavMotion()
    markSceneMove()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (chain) setPorchChain(chain)
      navigate(path)
      return
    }
    const from = restingRef.current
    const target = porchPose(to, viewport, composition, navHeight)
    setExit(target)
    prefetchRoute(path)
    timerRef.current = setTimeout(() => void routeReady(path).then(() => {
      if (!alive.current) return
      const cameraEl = backdropRef.current?.querySelector('.pixel-scene__camera') ?? null
      setZoomHandoff(zoomHandoffAt(cameraEl, from, target, SCENE_ZOOM_MS))
      // A chained destination (the studio below) starts its floor pan from the porch while that zoom is still running.
      if (chain) setPorchChain(chain)
      navigate(path)
    }), chain ? SCENE_ZOOM_CHAIN_MS : SCENE_ZOOM_HANDOFF_MS)
  }, [navigate, viewport, composition, navHeight])

  useEffect(() => { alive.current = true; return () => { alive.current = false; if (last) last.endedAt = performance.now(); if (timerRef.current) clearTimeout(timerRef.current) } }, [])

  // Every nav request from the bar or a link leaves through the camera, never as a cut.
  useEffect(() => {
    const onSceneNav = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: SceneNavKind; path: string }>).detail
      if (!detail) return
      if (detail.kind === kind && (isSelf?.(detail.path) ?? true)) return
      event.preventDefault()
      switch (detail.kind) {
        case 'porch': startExit('rest', '/home'); break
        case 'party': startExit('rest', '/home', { kind: 'party', path: detail.path }); break
        case 'settings': startExit('mailbox', detail.path); break
        // Signing in is the letter at the mailbox: fly there (the settings page is that close-up, and shows the form when signed out).
        case 'signin': startExit('mailbox', '/settings'); break
        case 'scores': startExit('scores', detail.path); break
        case 'gallery': startExit('gallery', detail.path); break
      }
    }
    window.addEventListener(SCENE_NAV_EVENT, onSceneNav)
    return () => window.removeEventListener(SCENE_NAV_EVENT, onSceneNav)
  }, [kind, isSelf, startExit])

  return {
    backdropRef,
    registerRef,
    camera,
    /** The camera transitions only while leaving; at rest (and while a hand-off continues in script) it is set instantly. */
    zoomMs: exit || flight ? SCENE_ZOOM_MS : 0,
    /** A hand-off is still painting the camera from script: no CSS transition may smear it. */
    continuing: Boolean(continued),
    leaving: exit !== null,
    /** Flying in from the porch on its own (no hand-off): the page's scene keeps its camera transition on. */
    flying: flight !== null,
    /** The camera has just settled on this close-up (it arrived on a running zoom and that zoom is done). */
    arrived: Boolean(handoff) && !continued && exit === null,
    viewport,
    composition,
    navHeight,
    landing,
    startExit,
  }
}
