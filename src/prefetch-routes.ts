/**
 * Route code splitting keeps the first load small, but every route swap then waits for a
 * chunk fetch. That fetch lands in the middle of a camera move whenever the visitor clicks
 * before the router's own lazy import has warmed up, which reads as a frame drop. Warm the
 * route whose sign/page is about to be used: on idle after the shell paints, and on
 * hover/focus of the link that leads there.
 */
const loaders: Array<() => Promise<unknown>> = [
  () => import('./pages/(app)/home'),
  () => import('./pages/(app)/scores'),
  // The studio layout owns the scene for both the lobby and every room, so it is part of each of their chunks.
  () => Promise.all([import('./pages/(app)/(studio)/_layout'), import('./pages/(app)/(studio)/party')]),
  () => import('./pages/(app)/u/[userId]'),
  () => Promise.all([import('./pages/(app)/(studio)/_layout'), import('./pages/(app)/(studio)/r/[code]')]),
  () => import('./pages/(app)/settings'),
  // Haiku's corner, the 404: warm too, so an unknown URL flies there without waiting on its chunk.
  () => import('./pages/(app)/[...all]'),
]

const started = new Map<number, Promise<void>>()

function load(index: number): Promise<void> {
  const existing = started.get(index)
  if (existing) return existing
  const promise = loaders[index]().then(() => undefined, () => { started.delete(index) })
  started.set(index, promise)
  return promise
}

function indexFor(path: string): number | null {
  if (path === '/home' || path === '/') return 0
  if (path === '/scores') return 1
  if (path === '/party') return 2
  if (path === '/u' || path.startsWith('/u/')) return 3
  if (path.startsWith('/r/')) return 4
  if (path === '/settings') return 5
  return null
}

export function prefetchRoute(path: string): void {
  const index = indexFor(path)
  if (index !== null) void load(index)
}

/**
 * Resolves once the route's chunk is in memory (never rejects, capped so a dead network can't strand a move). A camera move
 * awaits this before swapping routes, so the destination mounts the frame the swap happens, never a chunk-fetch later.
 */
export function routeReady(path: string, capMs = 4000): Promise<void> {
  const index = indexFor(path)
  if (index === null) return Promise.resolve()
  return Promise.race([load(index), new Promise<void>((resolve) => setTimeout(resolve, capMs))])
}

export function prefetchAllRoutes(): void {
  const run = () => { for (let index = 0; index < loaders.length; index++) load(index) }
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(run, { timeout: 1500 })
  else window.setTimeout(run, 200)
}
