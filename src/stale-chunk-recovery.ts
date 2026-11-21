const FAILED_KEY = 'deepspace:stale-chunk-failed'

interface RecoveryOptions {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  reload: () => void
}

function browserRecovery(): RecoveryOptions {
  let storage: RecoveryOptions['storage'] = null
  try {
    storage = sessionStorage
  } catch {
    // Storage can be unavailable under hardened privacy settings. Without a
    // durable marker, reloading could loop forever, so fail closed.
  }
  return { storage, reload: () => window.location.reload() }
}

/** A failed dynamic import of a route chunk: the old hash is gone (a deploy, or the dev server restarted under an open tab). */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|error loading dynamically/i.test(message)
}

/** The module that failed, without its cache-busting query (Safari names none, so those share one key). */
function failedModule(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.match(/https?:\/\/[^\s'"]+/)?.[0].replace(/[?#].*$/, '') ?? 'unknown'
}

function readFailed(storage: NonNullable<RecoveryOptions['storage']>): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(FAILED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/**
 * Reload this tab once per failing module (sessionStorage remembers the module for the whole tab session, so a chunk that
 * always fails reaches the error card on its second failure instead of reloading on every click). Returns true when a
 * reload was started. There is deliberately no `vite:preloadError` listener: idle route prefetches (prefetch-routes.ts)
 * fail through it too, and reloading for those looped the tab while the visitor sat on a working page. A navigation's own
 * failed import is caught by guardLazyRoutes, and the error boundary calls this too.
 */
export function reloadForStaleChunk(error: unknown, { storage, reload }: RecoveryOptions = browserRecovery()): boolean {
  if (!isChunkLoadError(error) || !storage) return false
  const module = failedModule(error)
  const failed = readFailed(storage)
  if (failed.includes(module)) return false
  try {
    storage.setItem(FAILED_KEY, JSON.stringify([...failed, module]))
  } catch {
    return false
  }
  reload()
  return true
}

interface LazyRoute { lazy?: unknown; children?: LazyRoute[] }

/** Wraps every lazy route loader so a stale chunk reloads the page once instead of landing on the error boundary. */
export function guardLazyRoutes<T extends LazyRoute>(routes: T[]): T[] {
  return routes.map((route) => {
    const next: LazyRoute = { ...route }
    if (typeof route.lazy === 'function') {
      const load = route.lazy as () => Promise<unknown>
      next.lazy = async () => {
        try {
          return await load()
        } catch (error) {
          // The page is about to reload: never resolve, so no error boundary flashes in between.
          if (reloadForStaleChunk(error)) return new Promise<never>(() => {})
          throw error
        }
      }
    }
    if (route.children) next.children = guardLazyRoutes(route.children)
    return next as T
  })
}
