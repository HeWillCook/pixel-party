import type { GuessLogEntry } from '../../game/client-state'
import { Haiku, type HaikuState } from '../haiku/Haiku'
import './haiku-strip.css'

export interface HaikuStripProps {
  guessLog: GuessLogEntry[]
  aiResting: boolean
  asking: boolean
  hasPixels: boolean
  roundState?: 'lobby' | 'playing' | 'intermission' | 'paused'
  outcome?: 'won' | 'timeout' | 'teamWin'
}

/**
 * Phones: Haiku's latest guesses, always in view above the board (the full feed is in the disclosure below). The cat
 * sits beside a speech bubble that pulses when a new guess lands; a win turns it gold.
 */
export function HaikuStrip({ guessLog, aiResting, asking, hasPixels, roundState, outcome }: HaikuStripProps) {
  const latest = guessLog[0]
  const previous = guessLog[1]
  const won = roundState === 'intermission' && outcome === 'won'
  const over = roundState === 'intermission'
  let state: HaikuState = 'idle'
  let text: string
  let hint = ''
  if (aiResting) {
    state = 'resting'
    text = 'Napping, back tomorrow'
  } else if (won) {
    state = 'correct'
    text = `Got it! ${(guessLog.find(e => e.matched) ?? latest)?.guesses[0] ?? ''}`.trim()
  } else if (asking) {
    state = 'thinking'
    text = 'Hmm, let me look…'
  } else if (latest) {
    state = 'guess'
    text = latest.guesses.join(', ')
    if (previous) hint = `before: ${previous.guesses[0]}`
  } else if (over) {
    text = 'No guesses this round'
  } else if (hasPixels) {
    text = 'Looking at your canvas…'
  } else {
    text = 'Paint something and I will guess!'
  }
  return (
    <div data-testid="haiku-strip" className={`haiku-strip${won ? ' haiku-strip--won' : ''}`} aria-live="polite">
      <Haiku state={state} bubble={false} scale={2} beret className="haiku-strip__cat" data-testid="haiku-strip-cat" />
      <div key={latest?.id ?? 'none'} data-testid="haiku-strip-bubble" className={`haiku-strip__bubble${latest ? ' haiku-strip__bubble--new' : ''}`}>
        <span className="haiku-strip__text">{text}</span>
        {hint && <span className="haiku-strip__hint">{hint}</span>}
      </div>
    </div>
  )
}
