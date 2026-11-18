import type { ReactNode } from 'react'
import './play.css'

export function HoverEasel({ children }: { children: ReactNode }) {
  return <div data-testid="hover-easel" className="hover-easel">
    <div className="hover-easel__clamp" aria-hidden="true" />
    <div data-testid="hover-easel-frame" className="hover-easel__frame">{children}</div>
    <div className="hover-easel__tray" aria-hidden="true" />
    <div className="hover-easel__base" aria-hidden="true">
      <span className="hover-easel__leg hover-easel__leg--left" />
      <span className="hover-easel__leg hover-easel__leg--right" />
      <span className="hover-easel__booster" />
      <span className="hover-easel__booster" />
      <span className="hover-easel__booster" />
    </div>
  </div>
}
