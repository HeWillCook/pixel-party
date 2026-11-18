import type { ReactNode, Ref } from 'react'
import './PainterTray.css'

export function PainterTray({ tools, palette, trayRef }: { tools: ReactNode; palette: ReactNode; trayRef?: Ref<HTMLDivElement> }) {
  return <div ref={trayRef} data-testid="painter-tray" className="painter-tray pp-panel">{tools}<div className="painter-tray__divider" aria-hidden="true" />{palette}</div>
}
