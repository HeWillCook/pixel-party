import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthProfileReady, usePresenceRoom } from 'deepspace'
import { rectToPercent } from '../../scene/camera'
import { SceneComposition } from '../../scene/PixelScene'
import { porchLayout } from '../../scene/porch/layout'
import { useDaily } from '../../hooks/DailyAttemptProvider'
import { summarizePorch, type PorchPeer, type PorchPresenceState, type PorchSummary } from './presenceSummary'

/** Every app route but the studio below (/party and the rooms) is the porch scene or a close-up of it (home, scores, galleries, settings, the 404). */
export const isPorchRoute = (pathname: string) => pathname !== '/party' && !pathname.startsWith('/r/')

const PresenceContext = createContext<PorchSummary | null>(null)

/**
 * Who is on the porch right now, by DeepSpace's presence room (ephemeral, in memory, nothing stored). One scope per UTC day,
 * joined only while a porch route is on screen, and each person publishes just `{ name, painting }`, once when it changes.
 */
export function PorchPresenceProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { isLoaded, isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const { state } = useDaily()
  const [summary, setSummary] = useState<PorchSummary | null>(null)
  // Joined once who you are is known, so the room never sees you twice (a reconnect when the account settles).
  // ...and once today's date is known from the server (the scope is named by it), so the room is joined exactly once.
  const ready = isLoaded && state.loaded && (!isSignedIn || (!userLoading && !!user))
  return (
    <PresenceContext.Provider value={summary}>
      {ready && isPorchRoute(pathname) && <PorchPresenceSession onSummary={setSummary} />}
      {children}
    </PresenceContext.Provider>
  )
}

function PorchPresenceSession({ onSummary }: { onSummary: (summary: PorchSummary | null) => void }) {
  const { user } = useAuthProfileReady({ requireUser: false })
  const { state } = useDaily()
  const day = state.day || new Date().toISOString().slice(0, 10)
  const { peers, connected, updateState } = usePresenceRoom(`porch:${day}`)
  const painting = state.status === 'playing'
  const name = user?.name || ''

  // Published when it changes (and again after a reconnect, which joins with empty state): never per frame, never per route.
  const published = useRef<string>('')
  useEffect(() => {
    if (!connected) { published.current = ''; return }
    const next: PorchPresenceState = { name, painting }
    const key = JSON.stringify(next)
    if (published.current === key) return
    published.current = key
    updateState({ ...next })
  }, [connected, name, painting, updateState])

  const others = useMemo(() => (peers as PorchPeer[]).filter((peer) => peer.userId !== user?.id), [peers, user?.id])
  const summary = useMemo(() => (connected ? summarizePorch(others, painting) : null), [connected, others, painting])
  useEffect(() => { onSummary(summary) }, [summary, onSummary])
  useEffect(() => () => onSummary(null), [onSummary])
  return null
}

/**
 * The porch's tally: a small plank hanging from the top of the easel, "3 on the porch" and, when someone is, "1 painting now".
 * Hovering or focusing it lists up to five names; a tap holds the list open. It only exists while the room is connected.
 */
export function PorchPresenceSign() {
  const summary = useContext(PresenceContext)
  const composition = useContext(SceneComposition)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [pinned, setPinned] = useState(false)
  if (!summary) return null
  const easel = porchLayout[composition].easel
  // A strip across the top of the easel, where the plank hangs from its crossbar. A phone's easel is a narrow column hard against the house
  // wall (its note, mailbox and the lighthouse are all beside it), so there the plank hangs under the lantern in the open sky instead.
  const lantern = porchLayout[composition].lantern
  const anchor = composition === 'portrait'
    ? { x: lantern.x - 18, y: lantern.y + lantern.h - 9, w: 52, h: 10 }
    : { x: easel.x, y: easel.y - 11, w: easel.w, h: 10 }
  const listed = hover || focus || pinned
  const hearing = summary.names.length ? ` Here now: ${summary.names.join(', ')}${summary.more ? ` and ${summary.more} more` : ''}.` : ''
  return (
    <div className="porch-presence" style={rectToPercent(anchor, composition)}>
      <button
        type="button"
        className="porch-presence__plank"
        data-testid="porch-presence"
        aria-label={`${summary.headline}${summary.detail ? `, ${summary.detail}` : ''}.${hearing}`}
        aria-expanded={listed}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) setFocus(true) }}
        onBlur={() => setFocus(false)}
        onKeyDown={(event) => { if (event.key === 'Escape') { setHover(false); setFocus(false); setPinned(false) } }}
        onClick={() => setPinned((value) => !value)}
      >
        <span className="porch-presence__headline" aria-hidden="true">{summary.headline}</span>
        {summary.detail && <span className="porch-presence__detail" aria-hidden="true">{summary.detail}</span>}
        {listed && summary.names.length > 0 && (
          <span className="porch-presence__names" aria-hidden="true">
            {summary.names.map((entry, index) => <span key={index}>{entry}</span>)}
            {summary.more > 0 && <span>+{summary.more} more</span>}
          </span>
        )}
      </button>
    </div>
  )
}
