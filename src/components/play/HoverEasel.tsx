import type { ReactNode } from 'react'
import { BoosterSprite } from './BoosterSprite'
import './play.css'

export function HoverEasel({ children, boosterScale = 3 }: { children: ReactNode; boosterScale?: number }) {
  return <div data-testid="hover-easel" className="hover-easel">
    <div className="hover-easel__clamp" aria-hidden="true" />
    <div data-testid="hover-easel-frame" className="hover-easel__frame">{children}</div>
    <div className="hover-easel__tray" aria-hidden="true"><span className="hover-easel__brush" /><span className="hover-easel__tube" /><span className="hover-easel__tube hover-easel__tube--light" /></div>
    <div className="hover-easel__base" aria-hidden="true">
      <span className="hover-easel__leg hover-easel__leg--left" />
      <span className="hover-easel__leg hover-easel__leg--right" />
      <BoosterSprite scale={boosterScale} phaseOffset={0} className="hover-easel__booster" />
      <BoosterSprite scale={boosterScale} phaseOffset={2} className="hover-easel__booster" />
      <BoosterSprite scale={boosterScale} phaseOffset={4} className="hover-easel__booster" />
    </div>
    <div className="hover-easel__shadow" aria-hidden="true" />
  </div>
}
