import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Haiku, HAIKU_HEIGHT, HAIKU_WIDTH, type HaikuState } from './Haiku'

describe('Haiku', () => {
  const states: HaikuState[] = [
    'idle',
    'thinking',
    'guess',
    'correct',
    'resting',
    'sleeping',
  ]

  it.each(states)('renders %s state with canvas and data attribute', (state) => {
    const html = renderToString(<Haiku state={state} />)
    expect(html).toContain(`data-haiku-state="${state}"`)
    expect(html).toContain(`width="${HAIKU_WIDTH}"`)
    expect(html).toContain(`height="${HAIKU_HEIGHT}"`)
  })

  it('shows default thinking ellipsis bubble and optional custom bubble without AI wording', () => {
    const thinkingHtml = renderToString(<Haiku state="thinking" />)
    expect(thinkingHtml).toContain('data-testid="haiku-bubble"')
    expect(thinkingHtml).toContain('…')

    const guessHtml = renderToString(<Haiku state="guess" bubble="lighthouse" />)
    expect(guessHtml).toContain('lighthouse')
    expect(guessHtml).toContain('haiku__bubble--pop')
    expect(guessHtml).not.toMatch(/\bAI\b|claude|llm|judge/i)

    const idleNoBubble = renderToString(<Haiku state="idle" />)
    expect(idleNoBubble).not.toContain('data-testid="haiku-bubble"')
  })
})
