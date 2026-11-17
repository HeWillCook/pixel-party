import { expect, it } from 'vitest'
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
