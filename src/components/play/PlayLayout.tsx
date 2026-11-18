import { useEffect, useState, type ReactNode } from 'react'
import './play.css'

export function PlayLayout({ top, prompt, timeline, exit, canvas, score, actions, bottom, rightSummary = 'Scores & grading' }: {
  top?: ReactNode
  prompt: ReactNode
  timeline: ReactNode
  exit: ReactNode
  canvas: ReactNode
  score: ReactNode
  actions: ReactNode
  bottom: ReactNode
  rightSummary?: string
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
  return <div className={top ? 'play-layout play-layout--with-top' : 'play-layout'}>
    {top && <div className="play-layout__top">{top}</div>}
    <div className="play-layout__left">{prompt}{wide && timeline}{exit}</div>
    <div className="play-layout__canvas">{canvas}</div>
    {!wide && <div className="play-layout__mobile-actions">{actions}</div>}
    {wide ? <div className="play-layout__right">{score}{actions}</div> : <details className="play-layout__right" open={scoreOpen} onToggle={event => setScoreOpen(event.currentTarget.open)}><summary>{rightSummary}</summary>{score}{timeline}</details>}
    <div className="play-layout__bottom">{bottom}</div>
  </div>
}
