import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { compositionFor } from '../../scene/camera'
import { porchPose, type PorchPose } from '../../scene/porch/poses'
import { SCENE_ZOOM_MS } from '../../scene/zoom'
import { useDailyLock } from '../../hooks/useDailyLock'
import { settledNavHeight } from './navMetrics'
import { enableNavMotion, markSceneMove, setZoomHandoff } from './returnFlag'
import { requestVerticalSceneTransition } from './VerticalSceneTransition'

/** Where a path puts the camera: a pose on the porch, or the studio below it. Rooms and the static landing are not part of these moves. */
type Place = { kind: 'porch'; pose: PorchPose } | { kind: 'studio' } | null

function placeOf(pathname: string): Place {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/' || path.startsWith('/r/')) return null
  if (path === '/home') return { kind: 'porch', pose: 'rest' }
  if (path === '/scores') return { kind: 'porch', pose: 'scores' }
  if (path === '/u' || path.startsWith('/u/')) return { kind: 'porch', pose: 'gallery' }
  if (path === '/settings') return { kind: 'porch', pose: 'mailbox' }
  if (path === '/party') return { kind: 'studio' }
  return { kind: 'porch', pose: 'haiku' }
}

/**
 * Browser Back and Forward are camera moves too. The router swaps the route on popstate, and main.tsx re-emits it first as `pixel:popstate`, so this runs while the page
 * being left is still on screen: a move between porch poses leaves a hand-off for the page arriving (it flies from where the old page
 * rested to where it rests, on the one shared curve); the floor pan between the porch and the studio snapshots the old scene before it
 * is unmounted and lets the router do the swap behind it. Reduced motion and a running Daily stay instant.
 */
export function usePopMoves(): void {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  const locked = useDailyLock()
  const lockedRef = useRef(locked)
  lockedRef.current = locked

  useEffect(() => {
    const onPop = () => {
      const from = placeOf(previous.current)
      const to = placeOf(window.location.pathname)
      previous.current = window.location.pathname
      if (!from || !to || lockedRef.current) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      if (from.kind === 'porch' && to.kind === 'porch') {
        if (from.pose === to.pose) return
        const viewport = { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }
        const composition = compositionFor(viewport.w || 1, viewport.h || 1)
        const navHeight = settledNavHeight()
        enableNavMotion()
        markSceneMove()
        setZoomHandoff({
          at: performance.now(),
          durationMs: SCENE_ZOOM_MS,
          progress: 0,
          from: porchPose(from.pose, viewport, composition, navHeight),
          to: porchPose(to.pose, viewport, composition, navHeight),
        })
      } else if (from.kind !== to.kind) {
        const down = from.kind === 'porch'
        requestVerticalSceneTransition({
          source: down ? 'porch' : 'studio',
          target: down ? 'studio' : 'porch',
          direction: down ? 'down' : 'up',
          path: window.location.pathname,
          navigate: false,
        })
      }
    }
    window.addEventListener('pixel:popstate', onPop)
    return () => window.removeEventListener('pixel:popstate', onPop)
  }, [])

  useEffect(() => { previous.current = pathname }, [pathname])
}
