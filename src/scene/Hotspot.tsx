import { useContext, type ReactNode } from 'react'
import { rectToPercent, type Rect } from './camera'
import { SceneComposition } from './PixelScene'

export function Hotspot({ rect, label, href, onClick, testId, children, pressed, disabled }: { rect: Rect; label: string; href?: string; onClick?: () => void; testId?: string; children?: ReactNode; pressed?: boolean; disabled?: boolean }) {
  const composition = useContext(SceneComposition)
  const content = <>{children}<span className="pixel-hotspot__label">{label}</span></>
  const common = { className: 'pixel-hotspot', style: rectToPercent(rect, composition), 'aria-label': label, 'data-testid': testId, onClick }
  return href ? <a {...common} href={href}>{content}</a> : <button {...common} type="button" aria-pressed={pressed} disabled={disabled}>{content}</button>
}
