import { describe, expect, it } from 'vitest'
import { BOOSTER_HEIGHT, BOOSTER_WIDTH, boosterFrames } from './booster'
import { P } from '../palette'

describe('shared booster sprite', () => {
  it('has three pixel-aligned rocket thruster frames with steel, trim band, and flame tones', () => {
    expect(boosterFrames).toHaveLength(3)
    expect(new Set(boosterFrames.map(sprite => sprite.rows.join(''))).size).toBe(3)
    for (const sprite of boosterFrames) {
      expect(sprite.w).toBe(BOOSTER_WIDTH)
      expect(sprite.h).toBe(BOOSTER_HEIGHT)
      expect(BOOSTER_WIDTH).toBe(9)
      expect(BOOSTER_HEIGHT).toBe(15)
      expect(Object.values(sprite.palette)).toEqual(
        expect.arrayContaining([P.stone[0], P.stone[2], P.stone[4], P.sea[2], P.flame[1], P.flame[3], P.flame[4]]),
      )
    }
  })
})
