export interface History {
  past: Uint8Array[]
  future: Uint8Array[]
}

export const HISTORY_LIMIT = 100

export function emptyHistory(): History {
  return { past: [], future: [] }
}

export function record(h: History, before: Uint8Array): History {
  const nextPast = [...h.past, new Uint8Array(before)]
  if (nextPast.length > HISTORY_LIMIT) {
    nextPast.splice(0, nextPast.length - HISTORY_LIMIT)
  }
  return { past: nextPast, future: [] }
}

export function undo(
  h: History,
  current: Uint8Array,
): { history: History; cells: Uint8Array } | null {
  if (h.past.length === 0) return null
  const cells = h.past[h.past.length - 1]!
  const past = h.past.slice(0, -1)
  const future = [...h.future, new Uint8Array(current)]
  return { history: { past, future }, cells }
}

export function redo(
  h: History,
  current: Uint8Array,
): { history: History; cells: Uint8Array } | null {
  if (h.future.length === 0) return null
  const cells = h.future[h.future.length - 1]!
  const future = h.future.slice(0, -1)
  const past = [...h.past, new Uint8Array(current)]
  if (past.length > HISTORY_LIMIT) {
    past.splice(0, past.length - HISTORY_LIMIT)
  }
  return { history: { past, future }, cells }
}
