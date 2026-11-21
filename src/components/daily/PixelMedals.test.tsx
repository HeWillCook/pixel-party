import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PixelMedal, PixelTrophy } from './PixelMedals'
import { PixelThumb } from './PixelThumb'

describe('PixelMedals and PixelThumb', () => {
  it('renders 11x11 medals and an 11x10 trophy on the --px scene grid, authored at 2x detail', () => {
    const trophy = renderToString(<PixelTrophy />)
    expect(trophy).toContain('width="22"')
    expect(trophy).toContain('height="20"')
    expect(trophy).toContain('calc(var(--px, 3px) * 11)')

    for (const [rank, label] of [
      [1, 'Gold medal'],
      [2, 'Silver medal'],
      [3, 'Bronze medal'],
    ] as const) {
      const html = renderToString(<PixelMedal medal={rank} label={label} />)
      expect(html).toContain('width="22"')
      expect(html).toContain('height="22"')
      expect(html).toContain(`aria-label="${label}"`)
      expect(html).toContain('calc(var(--px, 3px) * 11)')
    }
  })

  it('renders PixelThumb on a 32x32 canvas and exposes accessible text on corrupt cells', () => {
    const emptyBase64 = Buffer.from(new Uint8Array(1024)).toString('base64')
    const valid = renderToString(<PixelThumb cells={emptyBase64} scale="scene" multiplier={2} />)
    expect(valid).toContain('<canvas')
    expect(valid).toContain('width="32"')
    expect(valid).toContain('height="32"')
    expect(valid).toContain('calc(var(--px, 3px) * 64)')
    expect(valid).toContain('box-sizing:content-box')

    const broken = renderToString(<PixelThumb cells="not-valid-base64!!!" scale="scene" multiplier={1} />)
    expect(broken).toContain('role="img"')
    expect(broken).toContain('aria-label="Drawing unavailable"')
    expect(broken).toContain('Unavailable')
  })
})
