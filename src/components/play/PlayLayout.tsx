import { useEffect, useState, type ReactNode } from 'react'
import './play.css'

export function PlayLayout({ top, left, canvas, right, bottom }: {
  top: ReactNode
  left: ReactNode
  canvas: ReactNode
  right: ReactNode
  bottom: ReactNode
}) {
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768)
  const [scoreOpen, setScoreOpen] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const update = () => setWide(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return <div className="play-layout">
    <div className="play-layout__top">{top}</div>
    <div className="play-layout__left">{left}</div>
    <div className="play-layout__canvas">{canvas}</div>
    <details className="play-layout__right" open={wide || scoreOpen} onToggle={event => { if (!wide) setScoreOpen(event.currentTarget.open) }}><summary>Scores &amp; grading</summary>{right}</details>
    <div className="play-layout__bottom">{bottom}</div>
  </div>
}
