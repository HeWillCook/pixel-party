/**
 * Spatial transition handoff flags and navigation event helpers.
 *
 * Pixel Party has two physical spaces:
 * - Upstairs (Porch): `/home` (`/`), `/scores`, `/u/:userId`, `/settings`
 * - Downstairs (Basement Studio): `/party`, `/r/:code`
 *
 * Cross-space navigation may route through the porch before a scene-specific zoom or reveal.
 */
export type PorchOrigin = 'party' | 'scores' | 'gallery'
/** `signin` is not a place to go but a request: put the sign-in form on the object this scene keeps it on (mailbox, ticket board). */
export type SceneNavKind = 'porch' | 'party' | 'scores' | 'gallery' | 'settings' | 'signin'
export type PorchChainDest = { kind: Exclude<SceneNavKind, 'porch' | 'signin'>; path: string }

export const PORCH_RETURN_KEY = 'porch-return-from'
export const PORCH_CHAIN_KEY = 'porch-chain-to'
export const SETTINGS_ARRIVAL_KEY = 'settings-from-porch'
export const ZOOM_HANDOFF_KEY = 'zoom-handoff'
export const SCENE_NAV_EVENT = 'pixel:scene-nav'

import { playWhoosh } from '../../scene/whoosh'
import { SCENE_ZOOM_MS, type ZoomHandoff } from '../../scene/zoom'

/**
 * In-flight zoom passed between routes. The destination continues the same curve from the hand-off progress
 * instead of snapping to a fresh camera, so the scene canvas never restarts mid-zoom. Stored in sessionStorage
 * because the swap is a full route change.
 */
export type ZoomHandoffFlag = ZoomHandoff

export function setZoomHandoff(handoff: ZoomHandoffFlag | null): void {
  if (!handoff) {
    consumeFlag(ZOOM_HANDOFF_KEY)
    return
  }
  setFlag(ZOOM_HANDOFF_KEY, JSON.stringify(handoff))
}

function parseCamera(raw: unknown): { x: number; y: number; zoom: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const { x, y, zoom } = raw as { x?: unknown; y?: unknown; zoom?: unknown }
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(zoom) ? { x: x as number, y: y as number, zoom: zoom as number } : null
}

/** Reads the pending hand-off without consuming it (safe across React re-renders). */
export function peekZoomHandoff(): ZoomHandoffFlag | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(ZOOM_HANDOFF_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ZoomHandoffFlag>
    if (!parsed || typeof parsed.at !== 'number' || typeof parsed.durationMs !== 'number' || typeof parsed.progress !== 'number') return null
    // A hand-off no page picked up (the arriving page was an ended Daily close-up, say) must not fly a later arrival: it expires, and one from an earlier page load (a different clock) is void.
    const age = performance.now() - parsed.at
    if (age < 0 || age > parsed.durationMs + 2000) { sessionStorage.removeItem(ZOOM_HANDOFF_KEY); return null }
    const from = parseCamera(parsed.from)
    const to = parseCamera(parsed.to)
    return from && to ? { at: parsed.at, durationMs: parsed.durationMs, progress: parsed.progress, from, to } : null
  } catch {
    return null
  }
}

export function consumeZoomHandoff(): ZoomHandoffFlag | null {
  const handoff = peekZoomHandoff()
  if (handoff) consumeFlag(ZOOM_HANDOFF_KEY)
  return handoff
}

export function porchOriginFor(pathname: string): PorchOrigin | null {
  if (pathname === '/party' || pathname.startsWith('/r/')) return 'party'
  if (pathname === '/scores') return 'scores'
  if (pathname === '/u' || pathname.startsWith('/u/')) return 'gallery'
  return null
}

function setFlag(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function consumeFlag(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const val = sessionStorage.getItem(key)
    if (val !== null) sessionStorage.removeItem(key)
    return val
  } catch {
    return null
  }
}

export function setPorchReturnFrom(origin: PorchOrigin | null): void {
  if (!origin) return
  setFlag(PORCH_RETURN_KEY, origin)
}

export function markPorchReturn(pathname: string): void {
  setPorchReturnFrom(porchOriginFor(pathname))
}

/**
 * Runs `swap` once no floor pan is in flight. A page that mounts while the pan still carries `main` in its transformed
 * track has its fixed backdrop measured against the whole tall track (a few frames of the wrong composition), so a
 * route swap that lands inside the pan's last stretch waits for it to land (capped, never stranded).
 */
export function afterSceneMove(swap: () => void, capMs = 400): void {
  const started = performance.now()
  const wait = () => {
    if (!document.documentElement.hasAttribute('data-scene-moving') || performance.now() - started >= capMs) swap()
    else requestAnimationFrame(wait)
  }
  wait()
}

export function setPorchChain(dest: PorchChainDest | null): void {
  if (!dest) {
    consumeFlag(PORCH_CHAIN_KEY)
    return
  }
  setFlag(PORCH_CHAIN_KEY, JSON.stringify(dest))
}

export function consumePorchChain(): PorchChainDest | null {
  const raw = consumeFlag(PORCH_CHAIN_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PorchChainDest>
    if (
      parsed &&
      typeof parsed.path === 'string' &&
      (parsed.kind === 'party' || parsed.kind === 'scores' || parsed.kind === 'gallery' || parsed.kind === 'settings')
    ) {
      return { kind: parsed.kind, path: parsed.path }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function setSettingsArrival(): void {
  setFlag(SETTINGS_ARRIVAL_KEY, '1')
}

export function consumeSettingsArrival(): boolean {
  return consumeFlag(SETTINGS_ARRIVAL_KEY) === '1'
}

export function isPrimaryClick(event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button: number }): boolean {
  return !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0
}

/**
 * Dispatches a cancelable scene navigation request so the active view (`PorchScene`, `Daily`,
 * `Scores`, `Gallery`, `StudioLobby`, `RoomPage`, `Settings`) can play its spatial exit first.
 * Returns `true` if a scene handled the transition (caller should `event.preventDefault()`).
 */
/** Turns on the nav's chrome transitions for a user-initiated move (never on a cold first paint). */
export function enableNavMotion(): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-nav-ready', '')
  playWhoosh()
}

export function dispatchSceneNavigation(kind: SceneNavKind, path: string): boolean {
  if (typeof window === 'undefined') return false
  enableNavMotion()
  const ev = new CustomEvent<{ kind: SceneNavKind; path: string }>(SCENE_NAV_EVENT, {
    cancelable: true,
    detail: { kind, path },
  })
  return !window.dispatchEvent(ev)
}

/** Asks the scene on screen to show its sign-in form. Returns false when no scene took the request (the caller falls back to /settings). */
export function requestSignIn(): boolean {
  return dispatchSceneNavigation('signin', typeof window === 'undefined' ? '/' : window.location.pathname)
}

/**
 * A click while the camera is already moving is not lost: the latest one waits and runs when the move lands (the way the gallery's
 * page turns queue). A move marks itself when it starts; the page that refuses the new request hands it here.
 */
let moveUntil = 0
let queuedPath: string | null = null
let queueTimer = 0

export function markSceneMove(ms = SCENE_ZOOM_MS + 150): void {
  if (typeof performance !== 'undefined') moveUntil = Math.max(moveUntil, performance.now() + ms)
}

/** True while a marked camera move is still in flight (a request made now is queued, not started). */
export function sceneMoving(): boolean {
  return typeof performance !== 'undefined' && performance.now() < moveUntil
}

function navKindForPath(path: string): SceneNavKind | null {
  if (path === '/home') return 'porch'
  if (path === '/scores') return 'scores'
  if (path === '/party') return 'party'
  if (path === '/settings') return 'settings'
  if (path === '/u' || path.startsWith('/u/')) return 'gallery'
  return null
}

/** The porch's own "stay here" (a click on Daily while on the porch) cancels the move and whatever waited behind it. */
export function clearQueuedSceneNavigation(): void {
  queuedPath = null
  if (typeof window !== 'undefined') window.clearTimeout(queueTimer)
}

export function queueSceneNavigation(path: string): void {
  if (typeof window === 'undefined' || !navKindForPath(path)) return
  queuedPath = path
  window.clearTimeout(queueTimer)
  const fire = () => {
    const wait = moveUntil - performance.now()
    if (wait > 0) { queueTimer = window.setTimeout(fire, wait); return }
    const next = queuedPath
    queuedPath = null
    const kind = next ? navKindForPath(next) : null
    if (next && kind) dispatchSceneNavigation(kind, next)
  }
  queueTimer = window.setTimeout(fire, Math.max(0, moveUntil - performance.now()))
}
