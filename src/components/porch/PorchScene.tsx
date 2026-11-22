import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { PixelScene, SceneComposition } from '../../scene/PixelScene'
import { Hotspot } from '../../scene/Hotspot'
import { drawPorch, type PorchOptions } from '../../scene/porch/drawPorch'
import { porchHatch, porchLayout, type PorchObject } from '../../scene/porch/layout'
import { porchPose, type PorchPose } from '../../scene/porch/poses'
import { compositionFor, projectRect, rectToPercent, type Camera, type Composition } from '../../scene/camera'
import { useContinuingZoom } from '../../scene/useContinuingZoom'
import {
  REST_CAMERA,
  SCENE_ZOOM_HANDOFF_MS,
  SCENE_ZOOM_MS,
  zoomHandoffAt,
  type ZoomHandoff,
} from '../../scene/zoom'
import { PorchLocalCloseup, type LocalPhase } from './PorchLocalCloseup'
import { RulesNote } from './RulesNote'
import { HaikuHello } from './HaikuHello'
import { PorchPresenceSign } from './PorchPresence'
import type { HaikuFacts } from './haikuGreeting'
import { PorchWall } from '../gallery/PorchWall'
import { BasementSignCopy } from './PorchLabels'
import { ChalkboardBoard } from './ChalkboardBoard'
import { SignInCard } from '../auth/SignInCard'
import { localCloseup, type LocalKind } from '../../scene/porch/localPoses'
import { requestVerticalSceneTransition } from './VerticalSceneTransition'
import { prefetchRoute, routeReady } from '../../prefetch-routes'
import {
  afterSceneMove,
  enableNavMotion,
  consumePorchChain,
  consumeZoomHandoff,
  peekZoomHandoff,
  PORCH_RETURN_KEY,
  SCENE_NAV_EVENT,
  setSettingsArrival,
  clearQueuedSceneNavigation,
  isPrimaryClick,
  markSceneMove,
  queueSceneNavigation,
  setZoomHandoff,
  type PorchChainDest,
  type SceneNavKind,
} from './returnFlag'
import { settledNavHeight } from './navMetrics'
import './porch.css'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// Every porch zoom — daily, scores, gallery — shares one duration and curve (see scene/zoom.ts).
const ZOOM_MS = SCENE_ZOOM_MS
// Room pages still use their own legacy exit while they are outside this transition's scope.
const ASCENT_MS = 400

export interface PorchSceneProps {
  easelState: PorchOptions['easelState']
  easelLabel: string
  signedIn: boolean
  galleryHref?: string
  muted: boolean
  onEasel: () => void
  /** The static landing has no account layer: its mailbox sends you to /home. Everywhere else the form is on the mailbox. */
  onSignIn?: () => void
  onSignOut: () => void
  onToggleMute: () => void
  easelTestId?: string
  easelDisabled?: boolean
  easelCells?: Uint8Array
  landing?: boolean
  easelText?: ReactNode
  pendingChain?: PorchChainDest | null
  onConsumePendingChain?: () => void
  /** What the cat can tell you about today, once the page has it (his first words are always who he is). */
  haikuFacts?: HaikuFacts
  /** The wall to the left of the porch (with the player's paintings, once they are loaded); a bare wall when absent. */
  wall?: ReactNode
  children?: ReactNode
}

const measuredNavHeight = settledNavHeight

function Objects({
  moreOpen,
  onToggleMore,
  onParty,
  onScores,
  onGallery,
  onRules,
  onMailbox,
  ...props
}: PorchSceneProps & {
  moreOpen: boolean
  onToggleMore: () => void
  onParty: (event: MouseEvent) => void
  onScores: (event: MouseEvent) => void
  onGallery: (event: MouseEvent) => void
  onRules: () => void
  onMailbox: () => void
}) {
  const composition = useContext(SceneComposition)
  const rect = porchLayout[composition]
  // Tab order is the reading order of the scene: the house on the left (rules, mailbox, gallery), the easel, the board, the radio, the hatch.
  return <>
    {composition === 'landscape' && <Hotspot rect={rect.note} label="Scoring rules" onClick={onRules}>
      <span className="porch-note-title" aria-hidden="true">House rules</span>
    </Hotspot>}
    <Hotspot rect={rect.mailbox} label={props.signedIn ? 'Account menu' : 'Sign in at the mailbox'} onClick={onMailbox} />
    <Hotspot rect={rect.gallery} label="Your gallery" href={props.signedIn ? props.galleryHref : undefined} onClick={props.signedIn ? onGallery : props.landing ? props.onSignIn : onMailbox}>
      <span className="porch-gallery-sign-copy" aria-hidden="true">Gallery</span>
    </Hotspot>
    <HaikuHello rect={rect.cat} facts={props.haikuFacts} />
    {!props.landing && <PorchPresenceSign />}
    <Hotspot rect={rect.easel} label={props.easelLabel} href={props.landing ? '/home' : undefined} onClick={props.landing ? undefined : props.onEasel} testId={props.easelTestId} disabled={props.easelDisabled}><span className={props.easelState === 'finished' ? 'porch-easel-copy porch-easel-copy--tag' : 'porch-easel-copy'}>{props.easelText}</span></Hotspot>
    <Hotspot rect={rect.chalkboard} label="Today's scores" href="/scores" onClick={onScores} />
    {!props.landing && <ChalkboardBoard />}
    {composition === 'landscape' && <Hotspot rect={rect.radio} label={props.muted ? 'Unmute sounds' : 'Mute sounds'} pressed={props.muted} onClick={props.onToggleMute} />}
    <Hotspot rect={rect.basement} label="Basement studio" href="/party" onClick={onParty} testId={props.landing ? 'landing-browse-lobby' : undefined}>
      <BasementSignCopy composition={composition} />
    </Hotspot>
    {composition !== 'landscape' && <button type="button" className="porch-more-ticket" style={rectToPercent(rect.more, composition)} aria-expanded={moreOpen} onClick={onToggleMore}>More</button>}
  </>
}

type PorchTransition =
  | null
  | { pose: Exclude<PorchPose, 'rest'>; kind: 'scores' | 'gallery' | 'settings'; durationMs: number; navigateAt: number }

export function PorchScene(props: PorchSceneProps) {
  const navigate = useNavigate()
  const location = useLocation()
  // The vertical floor pan already supplies the motion; skip the return flourish so every
  // overlay is fully painted for the whole move.
  const verticalArrival = (location.state as { verticalScene?: string } | null)?.verticalScene === 'porch'
  const [moreOpen, setMoreOpen] = useState(false)
  // Where focus returns when the More sheet or a local close-up is put away.
  const returnFocus = useRef<HTMLElement | null>(null)
  const toggleMore = useCallback(() => {
    setMoreOpen((open) => {
      if (!open) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      return !open
    })
  }, [])
  const closeMore = useCallback(() => {
    setMoreOpen(false)
    returnFocus.current?.focus()
  }, [])
  // The rules note and the mailbox's account menu are close-ups of the porch itself: no route, just the camera.
  const [local, setLocal] = useState<{ kind: LocalKind; phase: LocalPhase } | null>(null)
  const localTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openLocal = useCallback((kind: LocalKind) => {
    if (localTimer.current) return
    if (!returnFocus.current || returnFocus.current === document.body) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    enableNavMotion()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setLocal({ kind, phase: 'open' }); return }
    setLocal({ kind, phase: 'in' })
    localTimer.current = setTimeout(() => { localTimer.current = null; setLocal((current) => current && { ...current, phase: 'open' }) }, ZOOM_MS)
  }, [])
  const closeLocal = useCallback(() => {
    if (localTimer.current) clearTimeout(localTimer.current)
    localTimer.current = null
    const restore = () => { setLocal(null); returnFocus.current?.focus(); returnFocus.current = null }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { restore(); return }
    setLocal((current) => current && { ...current, phase: 'out' })
    localTimer.current = setTimeout(() => { localTimer.current = null; restore() }, ZOOM_MS)
  }, [])
  useEffect(() => () => { if (localTimer.current) clearTimeout(localTimer.current) }, [])
  const openRules = useCallback(() => { returnFocus.current = returnFocus.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null); openLocal('rules') }, [openLocal])
  const openMailbox = useCallback(() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; openLocal('mailbox') }, [openLocal])
  const [transition, setTransition] = useState<PorchTransition>(null)
  const [returnFrom, setReturnFrom] = useState<null | 'party'>(() => {
    if (typeof window === 'undefined' || props.landing) return null
    let origin: string | null = null
    try {
      origin = sessionStorage.getItem(PORCH_RETURN_KEY)
      if (origin) sessionStorage.removeItem(PORCH_RETURN_KEY)
    } catch {
      origin = null
    }
    if (verticalArrival) return null
    if (origin === 'party' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return origin
    }
    return null
  })
  // A scores exit that was already zooming when the route changed: keep the same curve running.
  const [handoff] = useState<ZoomHandoff | null>(() => {
    if (typeof window === 'undefined' || props.landing) return null
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null
    return peekZoomHandoff()
  })
  const [mountChain, setMountChain] = useState<PorchChainDest | null>(() => {
    if (typeof window === 'undefined' || props.landing) return null
    return consumePorchChain()
  })
  // Overlays are hidden on the first frame of a return so they fade back in as the zoom lands
  // (a scores exit hands over mid-zoom, so this must not depend on the return camera).
  const [overlayFade, setOverlayFade] = useState(() => Boolean(handoff) || returnFrom !== null)
  useEffect(() => {
    if (!overlayFade) return
    const raf = requestAnimationFrame(() => setOverlayFade(false))
    return () => cancelAnimationFrame(raf)
  }, [overlayFade])
  // Remember the previous space for the still-supported room-page chained arrivals.
  const initialReturnRef = useRef(returnFrom)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const root = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bumped when a move is cancelled or the page goes away, so a swap still waiting on its chunk never fires late.
  const moveToken = useRef(0)
  const chainTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Final camera of the running transition, read again when the hand-off is captured.
  const transitionTarget = useRef<Camera | null>(null)

  useIsomorphicLayoutEffect(() => {
    if (handoff) consumeZoomHandoff()
  }, [handoff])

  useIsomorphicLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => {
      const bounds = element.getBoundingClientRect()
      setViewport(cur => cur.w === bounds.width && cur.h === bounds.height ? cur : { w: bounds.width, h: bounds.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!returnFrom) return
    const raf = requestAnimationFrame(() => setReturnFrom(null))
    return () => cancelAnimationFrame(raf)
  }, [returnFrom])

  const startTransition = useCallback((path: string, spec: NonNullable<PorchTransition>) => {
    if (timer.current) { queueSceneNavigation(path); return }
    enableNavMotion()
    markSceneMove()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (spec.kind === 'settings') setSettingsArrival()
      navigate(path)
      return
    }
    prefetchRoute(path)
    setTransition(spec)
    // The swap waits for the destination's chunk (normally already warm), so the page mounts the frame it swaps in.
    const token = ++moveToken.current
    timer.current = setTimeout(() => void routeReady(path).then(() => moveToken.current === token && afterSceneMove(() => {
      if (!root.current || moveToken.current !== token) return
      // Hand the in-flight zoom to the destination instead of cutting it off at the swap.
      const cameraEl = root.current?.querySelector('.pixel-scene__camera') ?? null
      const reach = transitionTarget.current
      if (reach) setZoomHandoff(zoomHandoffAt(cameraEl, REST_CAMERA, reach, spec.durationMs))
      if (spec.kind === 'settings') setSettingsArrival()
      navigate(path)
    })), spec.navigateAt)
  }, [navigate])

  const goParty = useCallback(() => {
    if (timer.current) { queueSceneNavigation('/party'); return }
    enableNavMotion()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigate('/party')
      return
    }
    const handled = requestVerticalSceneTransition({
      source: 'porch',
      target: 'studio',
      direction: 'down',
      path: '/party',
    })
    if (!handled) navigate('/party')
  }, [navigate])

  const goScores = useCallback(() => {
    startTransition('/scores', { pose: 'scores', kind: 'scores', durationMs: ZOOM_MS, navigateAt: SCENE_ZOOM_HANDOFF_MS })
  }, [startTransition])

  const goSettings = useCallback((path = '/settings') => {
    startTransition(path, { pose: 'mailbox', kind: 'settings', durationMs: ZOOM_MS, navigateAt: SCENE_ZOOM_HANDOFF_MS })
  }, [startTransition])

  const goGallery = useCallback((href?: string) => {
    const destination = href || props.galleryHref
    if (!destination) return
    startTransition(destination, { pose: 'gallery', kind: 'gallery', durationMs: ZOOM_MS, navigateAt: SCENE_ZOOM_HANDOFF_MS })
  }, [props.galleryHref, startTransition])

  // Existing room-page return chains still arrive here; Porch↔Studio now uses the shared vertical move.
  useEffect(() => {
    const activeChain = props.pendingChain ?? mountChain
    if (!activeChain) return
    if (viewport.w === 0 || viewport.h === 0) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const origin = initialReturnRef.current
    // Chained destinations start only once this page's own arrival motion has landed, so the
    // two curves never overlap (the floor pan is always one clean vertical move).
    const waitMs = reduced
      ? 0
      : handoff
        // The floor pan takes over from the zoom-out still running, as one camera path.
        ? 0
        : origin === 'party'
          ? ASCENT_MS - 40
          : 20
    chainTimer.current = setTimeout(() => {
      setMountChain(null)
      props.onConsumePendingChain?.()
      if (activeChain.kind === 'party') goParty()
      else if (activeChain.kind === 'scores') goScores()
      else if (activeChain.kind === 'gallery') goGallery(activeChain.path)
      else if (activeChain.kind === 'settings') goSettings(activeChain.path)
    }, waitMs)
    return () => {
      if (chainTimer.current) {
        clearTimeout(chainTimer.current)
        chainTimer.current = null
      }
    }
  }, [mountChain, props.pendingChain, props.onConsumePendingChain, viewport.w, viewport.h, goParty, goScores, goGallery, goSettings])

  useEffect(() => {
    const cancelPending = () => {
      clearQueuedSceneNavigation()
      if (chainTimer.current) {
        clearTimeout(chainTimer.current)
        chainTimer.current = null
      }
      setMountChain(null)
      props.onConsumePendingChain?.()
      moveToken.current++
      if (!timer.current) return
      clearTimeout(timer.current)
      timer.current = null
      setTransition(null)
    }
    const onSceneNav = (event: Event) => {
      if (props.landing) return
      const detail = (event as CustomEvent<{ kind: SceneNavKind; path: string; verticalArrival?: boolean }>).detail
      if (!detail) return
      if (detail.kind === 'party') { event.preventDefault(); goParty() }
      else if (detail.kind === 'scores') { event.preventDefault(); goScores() }
      else if (detail.kind === 'gallery') { event.preventDefault(); goGallery(detail.path) }
      else if (detail.kind === 'settings') { event.preventDefault(); goSettings(detail.path) }
      else if (detail.kind === 'porch') { event.preventDefault(); cancelPending() }
      else if (detail.kind === 'signin') { event.preventDefault(); openMailbox() }
    }
    const onPartyNav = (event: Event) => { event.preventDefault(); goParty() }
    const onScoresNav = (event: Event) => { event.preventDefault(); goScores() }
    const onGalleryNav = (event: Event) => {
      event.preventDefault()
      const href = (event as CustomEvent<string>).detail
      goGallery(href)
    }
    window.addEventListener(SCENE_NAV_EVENT, onSceneNav)
    window.addEventListener('porch-party-transition', onPartyNav)
    window.addEventListener('porch-scores-transition', onScoresNav)
    window.addEventListener('porch-gallery-transition', onGalleryNav)
    window.addEventListener('pixel:return-porch', cancelPending)
    return () => {
      window.removeEventListener(SCENE_NAV_EVENT, onSceneNav)
      window.removeEventListener('pixel:return-porch', cancelPending)
      window.removeEventListener('porch-party-transition', onPartyNav)
      window.removeEventListener('porch-scores-transition', onScoresNav)
      window.removeEventListener('porch-gallery-transition', onGalleryNav)
    }
  }, [props.landing, goParty, goScores, goGallery, goSettings, openMailbox])

  // Only clear the pending route swap on unmount; listener re-subscription must not strand it.
  useEffect(() => () => {
    moveToken.current++
    if (timer.current) clearTimeout(timer.current)
    if (chainTimer.current) clearTimeout(chainTimer.current)
  }, [])

  const onParty = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    goParty()
  }
  const onScores = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    goScores()
  }
  const onGallery = (event: MouseEvent) => {
    if (!props.signedIn || !props.galleryHref) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    goGallery(props.galleryHref)
  }

  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    const height = root.current?.clientHeight ?? window.innerHeight
    const width = root.current?.clientWidth ?? window.innerWidth
    const scale = Math.max(2, Math.ceil(Math.max(width / ctx.canvas.width, height / ctx.canvas.height)))
    const roofTop = Math.max(0, Math.floor((ctx.canvas.height - height / scale) / 2))
    drawPorch(ctx, frame, { easelState: props.easelState, bob: !transition, soundOn: !props.muted, signedIn: props.signedIn, roofTop, easelCells: props.easelCells })
  }, [props.easelState, props.muted, props.signedIn, props.easelCells, transition])

  const composition = viewport.w && viewport.h ? compositionFor(viewport.w, viewport.h) : 'landscape'
  const restCamera: Camera = REST_CAMERA
  const transitionCamera: Camera | null = transition && viewport.w && viewport.h
    ? porchPose(transition.pose, viewport, composition, measuredNavHeight())
    : null
  transitionTarget.current = transitionCamera
  const localLayout = local && viewport.w && viewport.h ? localCloseup(local.kind, viewport, composition, measuredNavHeight()) : null
  // A zoom that was still running when a close-up handed over (back to rest, or on from the previous porch pose).
  const continuedCamera = useContinuingZoom(handoff, handoff?.from ?? restCamera, handoff?.to ?? restCamera)
  const camera: Camera = continuedCamera ?? transitionCamera ?? (local && local.phase !== 'out' && localLayout ? localLayout.camera : restCamera)
  const activeZoomMs = transition?.durationMs ?? ZOOM_MS

  return <div ref={root} className={[props.landing ? 'porch-world porch-world--landing' : 'porch-world', transition || local ? 'porch-world--transitioning' : '', transition?.kind === 'scores' ? 'porch-world--to-scores' : '', overlayFade ? 'porch-world--returning' : '', verticalArrival ? 'porch-world--vertical-arrival' : ''].filter(Boolean).join(' ')}>
    <PixelScene draw={draw} className="porch-world__scene" camera={camera} zoomMs={activeZoomMs} instant={Boolean(continuedCamera)} syncScale>{props.wall ?? <PorchWall />}<Objects {...props} moreOpen={moreOpen} onToggleMore={toggleMore} onParty={onParty} onScores={onScores} onGallery={onGallery} onRules={openRules} onMailbox={openMailbox} /></PixelScene>
    <nav className="porch-dock" aria-label="Porch shortcuts">
      {/* Like the desktop Daily sign: back to the easel's rest pose, never "start" (that is the easel's own button). */}
      <button type="button" aria-current={props.landing ? undefined : 'page'} onClick={props.landing ? props.onEasel : () => { closeMore(); window.dispatchEvent(new Event('pixel:return-porch')) }}><span aria-hidden="true">✎</span>Daily</button>
      <a href="/scores" onClick={onScores}><span aria-hidden="true">★</span>Scores</a>
      <a href="/party" onClick={onParty}><span aria-hidden="true">♫</span>Party</a>
      {props.signedIn && props.galleryHref ? <a href={props.galleryHref} onClick={onGallery}><span aria-hidden="true">▣</span>Gallery</a> : <button type="button" onClick={props.landing ? props.onSignIn : openMailbox}><span aria-hidden="true">▣</span>Gallery</button>}
      <button type="button" aria-expanded={moreOpen} onClick={toggleMore}><span aria-hidden="true">⋯</span>More</button>
    </nav>
    {moreOpen && viewport.w > 0 && createPortal((() => {
      // The ticket's sheet slides up out of the ticket; the scene around it (or Escape) puts it away.
      const ticket = projectRect(porchLayout[composition].more, REST_CAMERA, viewport, composition)
      return <>
        <div className="porch-local__dismiss porch-local__dismiss--open" data-testid="scene-dismiss" onClick={closeMore} />
        <div
          role="dialog"
          aria-label="More porch actions"
          className="porch-more-sheet"
          // Portrait has a ticket to slide out of; a wide short screen opens it from the dock instead.
          style={ticket.w > 0 ? { left: ticket.x, bottom: viewport.h - ticket.y } : { right: 12, bottom: 64 }}
          onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); closeMore() } }}
        >
          <div role="group" aria-label="More porch actions" className="porch-more-actions">
            <button type="button" ref={(element) => element?.focus()} onClick={() => { closeMore(); openMailbox() }}>{props.signedIn ? 'Account' : 'Sign in'}</button>
            <button type="button" onClick={props.onToggleMute}>{props.muted ? 'Unmute sounds' : 'Mute sounds'}</button>
            <button type="button" onClick={() => { closeMore(); openRules() }}>Scoring rules</button>
          </div>
        </div>
      </>
    })(), document.body)}
    {local && localLayout && (
      <PorchLocalCloseup
        kind={local.kind}
        phase={local.phase}
        hostRef={root}
        viewport={viewport}
        composition={composition}
        navHeight={measuredNavHeight()}
        label={local.kind === 'rules' ? 'Daily scoring rules' : 'Account menu'}
        onClose={closeLocal}
      >
        {local.kind === 'rules'
          ? <RulesNote onClose={closeLocal} closeRef={(element) => { if (element && local.phase === 'open') element.focus() }} />
          : <MailboxPanel
              signedIn={props.signedIn}
              galleryHref={props.galleryHref}
              onGallery={() => { closeLocal(); goGallery(props.galleryHref) }}
              onSettings={() => { setSettingsArrival(); enableNavMotion(); navigate('/settings') }}
              onSignIn={props.landing ? () => { closeLocal(); props.onSignIn?.() } : undefined}
              onSignOut={props.onSignOut}
              onClose={closeLocal}
            />}
      </PorchLocalCloseup>
    )}
    {props.children}
  </div>
}

/** The mailbox's menu card: what the letterbox holds for you. */
function MailboxPanel({ signedIn, galleryHref, onGallery, onSettings, onSignIn, onSignOut, onClose }: {
  signedIn: boolean
  galleryHref?: string
  onGallery: () => void
  onSettings: () => void
  /** Only the static landing passes it (its mailbox sends you to /home); elsewhere the SDK's sign-in form is the letter. */
  onSignIn?: () => void
  onSignOut: () => void
  onClose: () => void
}) {
  if (!signedIn && !onSignIn) return <SignInCard onClose={onClose} />
  const focusFirst = (element: HTMLElement | null) => element?.focus()
  return <div className="porch-mailbox-card">
    <h2>{signedIn ? 'Your mailbox' : 'Post for you'}</h2>
    {signedIn ? <>
      <a ref={focusFirst} href={galleryHref} onClick={(event) => { if (isPrimaryClick(event)) { event.preventDefault(); onGallery() } }}>My gallery</a>
      <a href="/settings" onClick={(event) => { if (isPrimaryClick(event)) { event.preventDefault(); onSettings() } }}>Settings</a>
      <button type="button" onClick={onSignOut}>Sign out</button>
    </> : <button ref={focusFirst} type="button" className="pp-btn" onClick={onSignIn}>Sign in to paint</button>}
    <button type="button" onClick={onClose}>Close</button>
  </div>
}

/**
 * The cold-start view: the real porch (the same art the page settles into, minus the objects that need data), so the
 * first paint never shows a different picture that the real porch then replaces.
 */
export function NeutralPorchLoading({ testId = 'daily-loading' }: { testId?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    const height = host.current?.clientHeight ?? window.innerHeight
    const width = host.current?.clientWidth ?? window.innerWidth
    const scale = Math.max(2, Math.ceil(Math.max(width / ctx.canvas.width, height / ctx.canvas.height)))
    const roofTop = Math.max(0, Math.floor((ctx.canvas.height - height / scale) / 2))
    drawPorch(ctx, frame, { easelState: 'cover', bob: false, soundOn: false, signedIn: false, roofTop })
  }, [])
  return <div ref={host} className="porch-world"><PixelScene draw={draw} className="porch-world__scene" syncScale /><div data-testid={testId} role="status" className="porch-loading pp-panel">Setting up your easel…</div></div>
}
