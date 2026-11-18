import type { ReactNode } from 'react'
import './play.css'

export function PlayLayout({ top, left, canvas, right, bottom }: {
  top: ReactNode
  left: ReactNode
  canvas: ReactNode
  right: ReactNode
  bottom: ReactNode
}) {
  return <div className="play-layout">
    <div className="play-layout__top">{top}</div>
    <div className="play-layout__left">{left}</div>
    <div className="play-layout__canvas">{canvas}</div>
    <div className="play-layout__right">{right}</div>
    <div className="play-layout__bottom">{bottom}</div>
  </div>
}
