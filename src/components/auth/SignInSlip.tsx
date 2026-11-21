import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useAuth } from 'deepspace'
import { SignInCard } from './SignInCard'
import './sign-in.css'

type Phase = 'closed' | 'in' | 'open' | 'out'
const SLIP_MS = 450

/**
 * A paper slip pinned to a scene object (the studio's room-tickets corkboard, a room's ticket stub). It slides out from
 * behind that object (transform only, never a fade) and slides back in when put away: by its close button, Escape, a
 * click anywhere on the scene around it, or signing in. The caller places it (`style`, and `--slip-hide` for the move).
 */
export function SignInSlip({ open, onClose, style, className, fill = false }: { open: boolean; onClose: () => void; style?: CSSProperties; className?: string; /** The slip is as big as its style says, with the form centred on it (instead of a form-sized slip). */ fill?: boolean }) {
  const [phase, setPhase] = useState<Phase>('closed')
  const slipRef = useRef<HTMLDivElement>(null)
  const { isSignedIn } = useAuth()

  // One state machine, every transition a function of the latest phase: a timer or frame that fires late (a busy
  // machine, Escape pressed while the slip is still sliding in) can never overwrite a newer phase with a stale one.
  useEffect(() => {
    if (open) {
      if (phase === 'closed') { setPhase((current) => (current === 'closed' ? 'in' : current)); return }
      if (phase === 'out') { setPhase((current) => (current === 'out' ? 'open' : current)); return }
      if (phase === 'in') {
        // Two frames: the hidden pose has to paint once for the slide to have somewhere to start from.
        let second = 0
        const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setPhase((current) => (current === 'in' ? 'open' : current))) })
        return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) }
      }
      return
    }
    if (phase === 'in' || phase === 'open') { setPhase((current) => (current === 'in' || current === 'open' ? 'out' : current)); return }
    if (phase === 'out') {
      const timer = setTimeout(() => setPhase((current) => (current === 'out' ? 'closed' : current)), SLIP_MS)
      return () => clearTimeout(timer)
    }
  }, [open, phase])
  // Escape is registered with the layout effects of the commit that shows the slip, never a frame later.
  useLayoutEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  // A slip with a size of its own shrinks the form to fit it (a phone's board is smaller than the form), never cuts it.
  useLayoutEffect(() => {
    const slip = slipRef.current
    const card = slip?.querySelector<HTMLElement>('.sign-in-card')
    if (!fill || !slip || !card) return
    const fit = () => {
      slip.style.setProperty('--slip-fit', '1')
      const scale = Math.min(1, (slip.clientHeight - 12) / card.offsetHeight, (slip.clientWidth - 12) / card.offsetWidth)
      slip.style.setProperty('--slip-fit', String(Math.max(0.5, scale)))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(slip)
    return () => observer.disconnect()
  }, [fill, phase])
  // Anything pressed outside the slip puts it away (no dim layer: a layer would also sit over the scene's own objects).
  useLayoutEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => { if (!slipRef.current?.contains(event.target as Node)) onClose() }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [open, onClose])
  useEffect(() => { if (open && isSignedIn) onClose() }, [open, isSignedIn, onClose])

  if (phase === 'closed') return null
  return (
    <div ref={slipRef} role="dialog" aria-label="Sign in" className={['sign-in-slip', `sign-in-slip--${phase}`, fill ? 'sign-in-slip--fill' : '', className].filter(Boolean).join(' ')} style={style}>
      <SignInCard onClose={onClose} />
    </div>
  )
}
