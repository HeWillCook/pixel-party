import { useEffect, useState, type ReactNode } from 'react'
import './play.css'

export function PlayLayout({ prompt, timeline, exit, canvas, score, actions, bottom }: {
  prompt: ReactNode
  timeline: ReactNode
  exit: ReactNode
  canvas: ReactNode
  score: ReactNode
  actions: ReactNode
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
    <div className="play-layout__left">{prompt}{wide && timeline}{exit}</div>
    <div className="play-layout__canvas">{canvas}</div>
    {!wide && <div className="play-layout__mobile-actions">{actions}</div>}
    <details className="play-layout__right" open={wide || scoreOpen} onToggle={event => { if (!wide) setScoreOpen(event.currentTarget.open) }}><summary>Scores &amp; grading</summary>{score}{!wide && timeline}{wide && actions}</details>
    <div className="play-layout__bottom">{bottom}</div>
  </div>
}
