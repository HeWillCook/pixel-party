import { useEffect, useRef, useState } from 'react'
import { studioSprites } from '../../scene/studio/sprites'
import { GuessFeed, type GuessFeedProps } from '../game/GuessFeed'
import { Haiku, type HaikuState } from '../haiku/Haiku'
import { StudioSprite } from './StudioSprite'

export interface CriticBubbleProps extends GuessFeedProps {
  roundState?: 'lobby' | 'playing' | 'intermission' | 'paused'
  outcome?: 'won' | 'timeout' | 'teamWin'
  asking?: boolean
  paused?: boolean
}

export function CriticBubble({
  roundState,
  outcome,
  asking = false,
  paused = false,
  ...guessProps
}: CriticBubbleProps) {
  const { guessLog, aiResting, roundId } = guessProps
  const latestEntry = guessLog[0]
  const latestGuessId = latestEntry?.id ?? null
  const [guessPoseActive, setGuessPoseActive] = useState(false)
  const lastSeenGuessIdRef = useRef<number | null>(null)
  const guessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [wide, setWide] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 768,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(min-width: 768px)')
    const update = () => setWide(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const scale = wide ? 5 : 4

  useEffect(() => {
    lastSeenGuessIdRef.current = null
    setGuessPoseActive(false)
    if (guessTimerRef.current) {
      clearTimeout(guessTimerRef.current)
      guessTimerRef.current = null
    }
  }, [roundId])

  useEffect(() => {
    if (latestGuessId === null || latestGuessId === lastSeenGuessIdRef.current) return
    lastSeenGuessIdRef.current = latestGuessId
    setGuessPoseActive(true)
    if (guessTimerRef.current) clearTimeout(guessTimerRef.current)
    guessTimerRef.current = setTimeout(() => {
      setGuessPoseActive(false)
      guessTimerRef.current = null
    }, 4000)
  }, [latestGuessId])

  useEffect(() => {
    return () => {
      if (guessTimerRef.current) clearTimeout(guessTimerRef.current)
    }
  }, [])

  const latestWord = latestEntry?.guesses[0]
  let haikuState: HaikuState = 'idle'
  let haikuBubble: string | false | undefined = false

  if (aiResting) {
    haikuState = 'resting'
    haikuBubble = false
  } else if (roundState === 'intermission' && outcome === 'won') {
    haikuState = 'correct'
    haikuBubble = latestWord ? `${latestWord}!` : 'Got it!'
  } else if (asking) {
    haikuState = 'thinking'
    haikuBubble = '…'
  } else if (guessPoseActive && latestWord) {
    haikuState = 'guess'
    haikuBubble = `"${latestWord}"`
  } else {
    haikuState = 'idle'
    haikuBubble = false
  }

  return (
    <div data-testid="critic-bubble" className="critic-bubble">
      <div className="critic-bubble__stage">
        <div className="critic-bubble__perch">
          <div className="critic-bubble__stool" aria-hidden="true">
            <StudioSprite sprite={studioSprites.criticStool} scale={scale} />
          </div>
          <Haiku
            state={haikuState}
            bubble={haikuBubble}
            scale={scale}
            beret
            paused={paused}
            className="critic-bubble__haiku"
          />
          {!haikuBubble && (
            <div className="critic-bubble__caption">
              <span className="critic-bubble__role">Haiku</span>
              <span className="critic-bubble__hint">
                {aiResting ? 'Napping till tomorrow' : 'Watches the canvas'}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="critic-bubble__speech">
        <GuessFeed {...guessProps} roundOver={roundState === 'intermission'} />
      </div>
    </div>
  )
}
