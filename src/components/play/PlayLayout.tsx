import { useEffect, useState, type ReactNode } from 'react'
import './play.css'

export function PlayLayout({
  top,
  prompt,
  timeline,
  exit,
  canvas,
  score,
  actions,
  bottom,
  rightSummary = 'Scores & grading',
  variant = 'room',
  mobileTop,
  mobileFooter,
  mobileHaiku,
}: {
  top?: ReactNode
  prompt: ReactNode
  timeline: ReactNode
  exit: ReactNode
  canvas: ReactNode
  score: ReactNode
  actions: ReactNode
  bottom: ReactNode
  rightSummary?: string
  variant?: 'daily' | 'room'
  mobileTop?: ReactNode
  mobileFooter?: ReactNode
  /** Phones only: Haiku's latest guess, kept in view above the board. */
  mobileHaiku?: ReactNode
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

  const dailyMobile = variant === 'daily' && !wide
  const rootClass = dailyMobile
    ? 'play-layout play-layout--daily-mobile'
    : top
      ? 'play-layout play-layout--with-top'
      : 'play-layout'

  return (
    <div className={rootClass}>
      {top && <div className="play-layout__top">{top}</div>}
      {dailyMobile ? (
        mobileTop && <div className="play-layout__mobile-top">{mobileTop}</div>
      ) : (
        <div className="play-layout__left">
          {variant === 'daily' ? (
            <>
              <div className="daily-post-clipboard">
                <div className="daily-post-clipboard__nail" aria-hidden="true" />
                <div className="daily-post-clipboard__clip" aria-hidden="true" />
                <div className="daily-post-clipboard__sheet">
                  {prompt}
                  {timeline}
                </div>
              </div>
              {exit}
            </>
          ) : (
            <>
              {prompt}
              {wide && timeline}
              {exit}
            </>
          )}
        </div>
      )}
      {!wide && variant !== 'daily' && mobileHaiku && <div className="play-layout__haiku">{mobileHaiku}</div>}
      <div className="play-layout__canvas">{canvas}</div>
      {!wide && variant !== 'daily' && <div className="play-layout__mobile-actions">{actions}</div>}
      {!dailyMobile &&
        (wide ? (
          <div className="play-layout__right">
            {score}
            {actions}
          </div>
        ) : (
          <details
            className="play-layout__right"
            open={scoreOpen}
            onToggle={event => setScoreOpen(event.currentTarget.open)}
          >
            <summary>{rightSummary}</summary>
            {score}
            {timeline}
          </details>
        ))}
      <div className="play-layout__bottom">{bottom}</div>
      {dailyMobile && mobileFooter && <div className="play-layout__mobile-footer">{mobileFooter}</div>}
    </div>
  )
}
