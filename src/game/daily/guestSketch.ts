/**
 * The signed-out "guest sketch": cells, UTC day and start time kept in localStorage so a visitor's painting survives
 * the OAuth redirect (and username onboarding). Client-only; nothing here is sent to a server. One entry per UTC day;
 * only today's is ever returned, and older days are swept on save.
 */
import { MAX_COLOR } from '../config'
import { decodeCells, encodeCells } from '../grid'

const GRID_CELLS = 1024

export interface GuestSketch {
  day: string
  startedAt: number
  cells: Uint8Array
}

const PREFIX = 'pixle:guest-sketch:'

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function saveGuestSketch(sketch: GuestSketch): void {
  const store = storage()
  if (!store || !sketch.day) return
  try {
    for (let i = store.length - 1; i >= 0; i--) {
      const key = store.key(i)
      if (key?.startsWith(PREFIX) && key !== PREFIX + sketch.day) store.removeItem(key)
    }
    store.setItem(PREFIX + sketch.day, JSON.stringify({ day: sketch.day, startedAt: sketch.startedAt, cells: encodeCells(sketch.cells) }))
  } catch {
    // Ignore quota or security errors
  }
}

/** The saved sketch for `day` (default: today, UTC), or null when none, malformed, or for another day. */
export function loadGuestSketch(day = utcDay()): GuestSketch | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(PREFIX + day)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { day?: unknown; startedAt?: unknown; cells?: unknown }
    if (parsed.day !== day || typeof parsed.startedAt !== 'number' || typeof parsed.cells !== 'string') return null
    const cells = decodeCells(parsed.cells, GRID_CELLS)
    if (!cells.every(c => c <= MAX_COLOR)) return null
    return { day, startedAt: parsed.startedAt, cells }
  } catch {
    return null
  }
}

export function clearGuestSketch(): void {
  const store = storage()
  if (!store) return
  try {
    for (let i = store.length - 1; i >= 0; i--) {
      const key = store.key(i)
      if (key?.startsWith(PREFIX)) store.removeItem(key)
    }
  } catch {
    // Ignore
  }
}
