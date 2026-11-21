import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** The page each wall was last on, shared by the gallery page and the porch's own copy of the wall, so a hand-off between them never swaps pictures. */
const stored = new Map<string, number>()
const listeners = new Set<() => void>()
const setStored = (wall: string, page: number) => { stored.set(wall, page); for (const listener of listeners) listener() }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

/** The page `wall` (a user id) was last on, clamped to `pages`. Read-only: the porch's inert copy of the wall follows the gallery page with this. */
export function useWallPage(wall: string, pages: number): number {
  const page = useSyncExternalStore(subscribe, () => stored.get(wall) ?? 0, () => 0)
  return Math.max(0, Math.min(page, pages - 1))
}

export interface WallTurn { from: number; to: number; /** 1 turns to the next (older) page: the paintings travel left. */ dir: 1 | -1 }

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Which page a wall is on and the turn in progress. `go(1)` is the next (older) page and wraps from the last to the first; `go(-1)`
 * the reverse. A turn asked for while one runs is kept (one, no more) and plays right after it. Reduced motion swaps the page at once.
 */
export function useWallPager(wall: string, pages: number) {
  const resting = useWallPage(wall, pages)
  const [turn, setTurn] = useState<WallTurn | null>(null)
  const queued = useRef<1 | -1 | null>(null)
  const restingRef = useRef(resting)
  restingRef.current = resting
  const pagesRef = useRef(pages)
  pagesRef.current = pages

  const begin = useCallback((dir: 1 | -1) => {
    const count = pagesRef.current
    if (count <= 1) return
    const from = restingRef.current
    const to = (from + dir + count) % count
    if (reduced()) { setStored(wall, to); return }
    setTurn({ from, to, dir })
  }, [wall])

  const turnRef = useRef(turn)
  turnRef.current = turn
  const go = useCallback((dir: 1 | -1) => {
    if (pagesRef.current <= 1) return
    if (turnRef.current) { if (queued.current === null) queued.current = dir; return }
    begin(dir)
  }, [begin])

  const finish = useCallback(() => {
    const done = turnRef.current
    if (!done) return
    setStored(wall, done.to)
    setTurn(null)
    const next = queued.current
    queued.current = null
    if (next) { restingRef.current = done.to; turnRef.current = null; begin(next) }
  }, [wall, begin])

  // Fewer pages than the page the wall is on (data changed under it): back to the last, and no turn left half-played.
  useEffect(() => {
    if (turn && (turn.from >= pages || turn.to >= pages)) { setTurn(null); queued.current = null }
    if ((stored.get(wall) ?? 0) >= pages && pages > 0) setStored(wall, pages - 1)
  }, [pages, turn, wall])

  return { page: resting, turn, go, finish }
}
