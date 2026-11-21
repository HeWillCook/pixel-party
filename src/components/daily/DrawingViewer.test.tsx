import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DrawingViewerPanel, type ViewerDrawing } from './DrawingViewer'

const cells = Buffer.from(new Uint8Array(1024)).toString('base64')
const noop = () => {}

function render(drawing: Partial<ViewerDrawing> = {}, position = 0, total = 1) {
  const html = renderToString(
    <DrawingViewerPanel
      drawing={{ userId: 'u1', name: 'Alice', rank: 1, score: 912, cells, ...drawing }}
      position={position}
      total={total}
      onPrev={noop}
      onNext={noop}
      onClose={noop}
    />,
  )
  // React separates adjacent text nodes with a comment; the words are what matters here.
  return { html, text: html.replaceAll('<!-- -->', '') }
}

describe('DrawingViewerPanel', () => {
  it('shows the painting large and crisp with the painter, rank and score', () => {
    const { html, text } = render()
    expect(html).toContain('data-testid="drawing-viewer-panel"')
    expect(html).toContain('id="drawing-viewer-title"')
    expect(text).toContain('Alice')
    expect(text).toContain('Rank 1 · 912 / 1000')
    expect(text).toContain('1 / 1')
    expect(html).toContain('aria-label="Gold medal"')
    // The art is a 32x32 canvas upscaled with nearest-neighbour sampling, sized by the viewer's CSS.
    expect(html).toContain('class="pixelated shrink-0 border-2 border-border bg-[#fff0cc] drawing-viewer__art"')
    expect(html).toContain('width="32"')
    expect(html).toContain('height="32"')
    expect(html).toContain('width:420px')
    expect(html).toContain('image-rendering:pixelated')
  })

  it('carries the stepping and closing controls with their test hooks', () => {
    const { html, text } = render({ rank: 2, score: 740 }, 1, 3)
    expect(html).toContain('data-testid="drawing-viewer-prev"')
    expect(html).toContain('data-testid="drawing-viewer-next"')
    expect(html).toContain('data-testid="drawing-viewer-close"')
    expect(html).toContain('aria-label="Previous drawing"')
    expect(html).toContain('aria-label="Next drawing"')
    expect(html).toContain('aria-label="Close drawing"')
    expect(text).toContain('2 / 3')
    expect(text).toContain('Rank 2 · 740 / 1000')
    expect(html).toContain('aria-label="Silver medal"')
    expect(html).not.toContain('disabled=""')
  })

  it("shows Haiku's guess and reason when the drawing record has them, and nothing when not", () => {
    const withAi = render({ guess: 'lighthouse', reason: 'A bright beacon above the waves.' })
    expect(withAi.text).toContain('Haiku guessed')
    expect(withAi.text).toContain('lighthouse')
    expect(withAi.text).toContain('A bright beacon above the waves.')

    const plain = render({ guess: '   ', reason: '' })
    expect(plain.text).not.toContain('Haiku guessed')
    expect(plain.html).not.toContain('drawing-viewer__ai')
  })

  it('disables stepping when there is a single painting to look at', () => {
    const { html } = render({}, 0, 1)
    expect(html.match(/disabled=""/g)?.length).toBe(2)
  })
})
