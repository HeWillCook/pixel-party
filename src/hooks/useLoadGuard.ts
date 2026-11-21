import { useCallback, useEffect, useState } from 'react'

/** How long a record query may stay `loading` before the screen says it could not load. */
export const LOAD_TIMEOUT_MS = 10_000

export type QueryStatus = 'loading' | 'ready' | 'error'

/**
 * Every retry is a query nobody has asked before. The SDK's store keeps a query's last snapshot after it unsubscribes (it never calls
 * `removeQuery`), so a limit that came back to an earlier value would render that old snapshot at once, error card and all, with no
 * "Loading..." in between. Each attempt therefore steps the limit down by one (1000, 999, 998 ... the floor is far beyond any real
 * number of retries; the gallery wall reads at most 1000 days, the board shows a handful of rows).
 */
export const retryLimit = (attempt: number) => 1000 - Math.min(attempt, 400)

/**
 * A retry for a record query without remounting anything: pass `limit` to the query, each `retry()` is a new query and a fresh
 * subscription (the SDK has no refetch for a live query).
 */
export function useQueryRetry() {
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return { attempt, limit: retryLimit(attempt), retry }
}

/**
 * The SDK's `useQuery` reports `error` only when the server answers with one: a socket that never answers (offline, a stalled
 * connection) leaves it `loading` for ever. This turns a load that outlasts `timeoutMs` into `error`, so the screen shows its error
 * copy and a Retry. `attempt` restarts the clock after a retry.
 */
export function useLoadTimeout(status: QueryStatus, attempt = 0, timeoutMs = LOAD_TIMEOUT_MS): QueryStatus {
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    if (status !== 'loading') return
    const timer = window.setTimeout(() => setTimedOut(true), timeoutMs)
    // Leaving `loading` (answered, or retried) forgets the timeout: the next load gets a fresh clock.
    return () => { window.clearTimeout(timer); setTimedOut(false) }
  }, [status, attempt, timeoutMs])
  return status === 'loading' && timedOut ? 'error' : status
}
