import { describe, expect, it } from 'vitest'
import { boosterFrames } from './booster'
import { P } from '../palette'

describe('shared booster sprite', () => {
  it('has three pixel-aligned flicker frames with metal and three flame tones', () => {
    expect(boosterFrames).toHaveLength(3)
    expect(new Set(boosterFrames.map(sprite => sprite.rows.join(''))).size).toBe(3)
    for (const sprite of boosterFrames) {
      expect(sprite.w).toBe(7)
      expect(sprite.h).toBe(13)
      expect(Object.values(sprite.palette)).toEqual(expect.arrayContaining([P.stone[0], P.stone[2], P.flame[1], P.flame[3], P.flame[4]]))
    }
  })
})
