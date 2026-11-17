import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { P } from './palette'

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

it('orders every palette ramp from dark to light', () => {
  for (const ramp of Object.values(P)) {
    for (let index = 1; index < ramp.length; index++) {
      expect(luminance(ramp[index])).toBeGreaterThan(luminance(ramp[index - 1]))
    }
  }
})

it('keeps button and logo text at AA contrast against their palette fills', () => {
  const css = readFileSync(new URL('../themes.css', import.meta.url), 'utf8')
  const button = css.match(/\.pp-btn\s*\{([^}]*)\}/)![1]
  const logo = css.match(/\.pp-logo\s*\{([^}]*)\}/)![1]
  const color = (rule: string, property: string) => rule.match(new RegExp(`(?:^|;)\\s*${property}:\\s*(#[0-9a-f]{6})`, 'i'))![1].toLowerCase()
  const palette = Object.values(P).flat() as readonly string[]
  const pairs = [[color(button, 'color'), color(button, 'background')], [color(logo, 'color'), P.paper[4]], [color(logo, 'color'), P.sky[5]]]
  for (const [foreground, background] of pairs) {
    expect(palette).toContain(foreground)
    expect(palette).toContain(background)
    const [light, dark] = [luminance(foreground), luminance(background)].sort((first, second) => second - first)
    expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5)
  }
})
