import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DETAIL } from '../../scene/detail'
import { P } from '../../scene/palette'
import { Haiku, HAIKU_HEIGHT, HAIKU_WIDTH, paintHaiku, type HaikuState } from './Haiku'

describe('Haiku', () => {
  const states: HaikuState[] = [
    'idle',
    'thinking',
    'guess',
    'correct',
    'resting',
    'sleeping',
    'sad',
  ]

  it.each(states)('renders %s state with canvas and data attribute', (state) => {
    const html = renderToString(<Haiku state={state} />)
    expect(html).toContain(`data-haiku-state="${state}"`)
    // The canvas is on the 2x detail grid; its footprint (the CSS size) stays HAIKU_WIDTH x HAIKU_HEIGHT units.
    expect(html).toContain(`width="${HAIKU_WIDTH * DETAIL}"`)
    expect(html).toContain(`height="${HAIKU_HEIGHT * DETAIL}"`)
  })

  const palette = new Set<string>(Object.values(P).flat())
  const cells = (state: HaikuState, frame: number, beret: boolean) => {
    const buf = paintHaiku(state, frame, beret)
    const out: string[] = []
    for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) out.push(buf.get(x, y) ?? '.')
    return out
  }

  it.each(states)('paints %s with palette colours only, in a coat shared across poses, within the footprint', (state) => {
    for (const frame of [0, 3, 11]) for (const beret of [true, false]) {
      const painted = cells(state, frame, beret)
      expect(painted.filter(c => c !== '.').length).toBeGreaterThan(300)
      for (const c of new Set(painted)) if (c !== '.') expect(palette.has(c)).toBe(true)
    }
    // Cream coat and plum outline are in every state; the beret adds red.
    const bare = new Set(cells(state, 0, false)), hat = new Set(cells(state, 0, true))
    expect(bare.has(P.fur[4])).toBe(true)
    expect(bare.has(P.fur[0])).toBe(true)
    expect(hat.has(P.flame[1])).toBe(true)
    expect(bare.has(P.flame[1])).toBe(state === 'guess' || state === 'correct' || state === 'sad') // the open mouth's tongue, confetti and the paint on his paws are the only warm reds without a beret
  })

  it('animates: idle blinks, a guess wags, sleeping breathes, and paused (frame 0) is still', () => {
    expect(cells('idle', 11, true)).not.toEqual(cells('idle', 0, true))
    expect(cells('guess', 2, true)).not.toEqual(cells('guess', 0, true))
    expect(cells('correct', 2, true)).not.toEqual(cells('correct', 0, true))
    expect(cells('sleeping', 12, false)).not.toEqual(cells('sleeping', 0, false))
    expect(cells('thinking', 0, true)).toEqual(cells('thinking', 0, true))
    expect(cells('resting', 0, true)).not.toEqual(cells('sleeping', 0, false)) // the beret makes the difference
  })

  it('is sad in his own way: drooping ears, tears on the cheeks, the beret askew, paint on his paws', () => {
    const sad = cells('sad', 0, true), idle = cells('idle', 0, true)
    expect(sad).not.toEqual(idle)
    const set = new Set(sad)
    expect(set.has(P.sea[4])).toBe(true) // tears
    expect(set.has(P.flame[1])).toBe(true) // beret and paint
    const column = (state: HaikuState, x: number) => cells(state, 0, true).filter((_, i) => i % (HAIKU_WIDTH * DETAIL) === x).filter(c => c !== '.').length
    // The ears stand up in every other pose, so the column over the left ear tip is filled there and bare when they droop.
    expect(column('idle', 11)).toBeGreaterThan(column('sad', 11))
    // The tears run: more of the cheek columns under the eyes are painted when sad.
    expect(cells('sad', 0, true).filter(c => c === P.sea[4]).length).toBeGreaterThan(cells('idle', 0, true).filter(c => c === P.sea[4]).length)
    // A tear falls: the drop is somewhere else a few frames later.
    expect(cells('sad', 4, true)).not.toEqual(cells('sad', 0, true))
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
