import type { CSSProperties, ReactNode, Ref } from 'react'
import { PALETTE } from '../../game/config'
import type { Tool } from '../../game/tools'
import './PainterTray.css'

export function PainterTray({ tools, palette, trayRef, activeColor, tool, cool = 0 }: { tools: ReactNode; palette: ReactNode; trayRef?: Ref<HTMLDivElement>; activeColor: number; tool: Tool; cool?: number }) {
  return <div ref={trayRef} data-testid="painter-tray" className="painter-tray pp-panel">
    <div className="painter-tray__tools">
      <div data-testid="current-colour" className="painter-tray__current" role="img" aria-label={tool === 'erase' ? 'Current action: erase' : 'Current colour'} style={{ background: tool === 'erase' ? '#fff0cc' : PALETTE[activeColor], '--cool': cool } as CSSProperties}>
        {tool === 'erase' && <span data-testid="current-eraser" aria-hidden="true">◩</span>}
        <span className="painter-tray__caption" aria-hidden="true">Colour</span>
      </div>
      {tools}
    </div>
    {palette}
  </div>
}
