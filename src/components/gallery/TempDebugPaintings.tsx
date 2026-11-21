// DEV ONLY (__DEBUG_TOOLS__)
import { useState } from 'react'
import { getAuthToken } from 'deepspace'

/** Adds or clears generated paintings on the signed-in player's own wall, to test a full gallery without painting dozens. */
export function TempDebugPaintings() {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const run = async (body: { add: number } | { clear: true }) => {
    if (busy) return
    setBusy(true)
    setNote('…')
    try {
      const token = await getAuthToken()
      const total = 'add' in body ? body.add : 0
      let done = 0
      // The server makes at most 100 a request; the wall updates by itself as the records arrive.
      do {
        const res = await fetch('/api/daily/debug-paintings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify('add' in body ? { add: Math.min(100, total - done) } : body),
        })
        if (!res.ok) { setNote('failed'); return }
        const json = (await res.json()) as { added?: number; removed?: number }
        done += json.added ?? 0
        if ('clear' in body) { setNote(`removed ${json.removed ?? 0}`); return }
        if (!json.added) break
      } while (done < total)
      setNote(`added ${done}`)
    } catch {
      setNote('failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="gallery-debug" data-testid="temp-debug-paintings" title="Temporary testing buttons: add generated paintings to your wall">
      <span className="gallery-debug__label">Debug paintings</span>
      {[1, 10, 100].map(count => (
        <button key={count} type="button" disabled={busy} onClick={() => void run({ add: count })} className="pp-chip gallery-debug__button">+{count}</button>
      ))}
      <button type="button" disabled={busy} onClick={() => void run({ clear: true })} className="pp-chip gallery-debug__button">Clear debug paintings</button>
      {note && <span className="gallery-debug__note" role="status">{note}</span>}
    </div>
  )
}
