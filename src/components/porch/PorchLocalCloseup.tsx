import { useCallback, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Composition, Rect } from '../../scene/camera'
import { localCloseup, type LocalKind } from '../../scene/porch/localPoses'
import { useSceneRegistration } from '../../scene/registration'

export type LocalPhase = 'in' | 'open' | 'out'

const PANEL_SELECTOR = '.porch-local__panel'

/**
 * A porch close-up with no route of its own (the rules note, the mailbox's account menu): the camera pushes onto the
 * object and its HTML is glued to it while it moves, so the paper grows out of the note and the menu card slides
 * out of the mailbox. Anywhere else on the scene, or Escape, zooms back out.
 */
export function PorchLocalCloseup({
  kind,
  phase,
  hostRef,
  viewport,
  composition,
  navHeight,
  label,
  onClose,
  children,
}: {
  kind: LocalKind
  phase: LocalPhase
  hostRef: RefObject<HTMLElement | null>
  viewport: { w: number; h: number }
  composition: Composition
  navHeight: number
  label: string
  onClose: () => void
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const layout = localCloseup(kind, viewport, composition, navHeight)
  const focusRef = useRef<Rect>(layout.focus)
  focusRef.current = layout.focus
  const focus = useCallback(() => focusRef.current, [])
  useSceneRegistration({ host: hostRef, root: rootRef, anchor: anchorRef, focus, active: phase !== 'open', panelSelector: kind === 'mailbox' ? PANEL_SELECTOR : undefined })

  // Registered with the layout effects of the commit that shows the close-up, so Escape works from its first frame.
  useLayoutEffect(() => {
    if (phase === 'out') return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onClose])

  const box = (rect: Rect): CSSProperties => ({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })
  // Portalled to the body: the close-up, and the click-away layer under it, sit above the nav bar like any overlay.
  return createPortal(
    <>
      <div className={phase !== 'out' ? 'porch-local__dismiss porch-local__dismiss--open' : 'porch-local__dismiss'} data-testid="scene-dismiss" onClick={onClose} />
      <div ref={rootRef} className="porch-local" data-registered="" data-local-phase={phase}>
        {kind === 'rules' ? (
          <div ref={anchorRef} role="dialog" aria-label={label} className="porch-local__paper" style={box(layout.anchor)}>{children}</div>
        ) : (
          <>
            <div ref={anchorRef} className="porch-local__anchor" style={box(layout.anchor)} aria-hidden="true" />
            <div
              role="dialog"
              aria-label={label}
              className="porch-local__panel"
              style={{ left: layout.panel.x, top: layout.panel.y, width: layout.panel.w }}
            >
              {children}
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  )
}
