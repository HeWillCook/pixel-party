/**
 * Dynamic app boundary — the auth + realtime data layer.
 *
 * `(app)` is a Generouted route group: the parentheses mean it does NOT appear
 * in the URL, so (app)/home.tsx is served at /home. Every page under this
 * folder is wrapped in the DeepSpace providers below, so it may call `useAuth`,
 * `useQuery`, `useMutations`, presence/Yjs hooks, etc.
 *
 * Pages OUTSIDE this folder (top level of src/pages/) get none of this — they
 * render as static pages with no auth fetch and no records WebSocket. Move a
 * page in or out of (app)/ to flip it between dynamic and static. Require
 * sign-in on top of the data layer by nesting under (app)/(protected)/.
 *
 * This is where the app chrome (Navigation) lives, so static pages can present
 * their own layout without inheriting it.
 */

import { Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { DeepSpaceAuthProvider, useAuthStatus } from 'deepspace'
import { RecordProvider, RecordScope, AgentTools } from 'deepspace'
import Navigation from '../../components/Navigation'
import { useToast } from '@/components/ui'
import { SCOPE_ID } from '../../constants'
import { routeTitle } from '../../route-titles'
import { Seo } from '../../components/Seo'
import { seo } from '../../seo'
import { schemas } from '../../schemas'
import { DailyAttemptProvider } from '../../hooks/DailyAttemptProvider'
import { useDailyLock } from '../../hooks/useDailyLock'
import { VerticalSceneTransition } from '../../components/porch/VerticalSceneTransition'
import { usePopMoves } from '../../components/porch/popMoves'
import { prefetchAllRoutes } from '../../prefetch-routes'
import { warmSceneArt } from '../../scene/warm-art'
// The scores page's stylesheet (and the porch's `--to-scores` backdrop it owns) is needed on the porch before the first Scores visit.
import './scores'

export default function AppLayout() {
  return (
    <DeepSpaceAuthProvider>
      {/* The prerendered landing owns the document <title> and React drops it
          when <Seo> unmounts, so every route sets its own (see routeTitle). */}
      <AppHead />
      <AuthBoot>
        <ShellChrome>
        <div className="porch-shell flex h-screen flex-col overflow-hidden">
          <Navigation />
          <main className="flex-1 overflow-y-auto min-h-0">
            <DailyLockGuard />
            <PopMoves />
            <Suspense fallback={<RouteCurtain />}>
              <Outlet />
            </Suspense>
          </main>
          <VerticalSceneTransition />
        </div>
        </ShellChrome>
      </AuthBoot>
    </DeepSpaceAuthProvider>
  )
}

/**
 * Head tags for the app routes. Per-user and per-room screens only ever show
 * the signed-in player's own data or a room's live state, so they ask crawlers
 * to stay away; the public screens (/scores, /party) are indexable. Every
 * screen has its own tab title; a gallery (named after its owner) and the 404
 * render their own, so this renders nothing for them.
 */
const NOINDEX_ROUTES = [/^\/home\/?$/, /^\/settings\/?$/, /^\/r\/[^/]+\/?$/]

function AppHead() {
  const { pathname } = useLocation()
  const title = routeTitle(pathname)
  if (!title) return null
  return NOINDEX_ROUTES.some(pattern => pattern.test(pathname))
    ? <Seo title={title} description={seo.description} noindex />
    : <title>{title}</title>
}

/** A running Daily attempt owns the screen: a typed URL or a stale link to anywhere else lands back on the easel. */
function DailyLockGuard() {
  const locked = useDailyLock()
  const { pathname } = useLocation()
  return locked && pathname !== '/home' ? <Navigate to="/home" replace /> : null
}

/** Browser Back/Forward play the camera move (see popMoves.ts). */
function PopMoves() {
  usePopMoves()
  return null
}

/**
 * Enables the nav's chrome transitions only after the first route has settled, so a cold load
 * (shell → lazy route → play/room content) never animates the bar into place. Later scene moves
 * still retract/expand it on the shared curve.
 */
function ShellChrome({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    const timer = window.setTimeout(() => root.setAttribute('data-nav-ready', ''), 1000)
    return () => {
      window.clearTimeout(timer)
      root.removeAttribute('data-nav-ready')
    }
  }, [])
  return <>{children}</>
}

/** Chunk-load fallback: a silent curtain instead of "Loading..." text. */
function RouteCurtain() {
  return <div aria-busy="true" className="route-curtain" />
}

/**
 * Waits for auth to resolve, then mounts the data layer. Distinct from the SDK's `AuthGate`.
 *
 * While the initial session check is in flight, renders a fixed full-viewport
 * panel in the theme background — visually identical to the pre-JS page
 * (index.html primes <html> with the same color), so a cold load shows a
 * steady theme-colored screen until the shell appears. No spinner text: the
 * check is one round-trip, and in-flow placeholders read as a layout jump.
 */
function AuthBoot({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuthStatus()
  // Warm the other route chunks once the shell is interactive, so a nav click never waits on
  // a network fetch inside its camera move.
  useEffect(() => {
    if (!isLoaded) return
    prefetchAllRoutes()
    warmSceneArt()
  }, [isLoaded])
  // Record writes (`create`/`put`/`remove`) are fire-and-forget — they resolve
  // before the server answers, so a denied or invalid write only surfaces
  // through onWriteError. Route rejections to toasts so they're never a
  // silent no-op. Keep this wiring when customizing the layout.
  const { error, warning } = useToast()

  if (!isLoaded) {
    return <div aria-busy="true" className="fixed inset-0 bg-background" />
  }

  return (
    <RecordProvider
      allowAnonymous
      onWriteError={(e) =>
        e.kind === 'permission' ? warning(e.title, e.detail) : error(e.title, e.detail)
      }
    >
      <RecordScope roomId={SCOPE_ID} schemas={schemas}>
        <AgentTools />
        <DailyAttemptProvider>{children}</DailyAttemptProvider>
      </RecordScope>
    </RecordProvider>
  )
}
