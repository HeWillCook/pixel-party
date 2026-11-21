import { describe, expect, it } from 'vitest'
import { blankGradeParts, gradeScore } from './scoring'

const parts = (match: number, recognition: number, quality: number) => gradeScore({ match, recognition, quality })

describe('daily scoring', () => {
  it('awards the full 1000 for a perfect drawing: matching prompt, recognized, polished', () => {
    expect(parts(100, 100, 100)).toEqual({
      match: 100,
      recognition: 100,
      quality: 100,
      promptScore: 100,
      matchPoints: 500,
      qualityBonus: 500,
      total: 1000,
    })
  })

  it('weights the prompt 60/40 between match and recognition, then scales the bonus by craft', () => {
    // round(0.6*80 + 0.4*50) = round(48 + 20) = 68 -> 340 points; bonus round(340 * 0.6) = 204
    expect(parts(80, 50, 60)).toMatchObject({ promptScore: 68, matchPoints: 340, qualityBonus: 204, total: 544 })
  })

  it('caps an unrecognized drawing at 300, however beautiful', () => {
    // recognition 0: weighted round(0.6*90) = 54 caps to 30 -> 150 points; a 100 craft bonus is 150.
    expect(parts(90, 0, 100)).toMatchObject({ promptScore: 30, matchPoints: 150, qualityBonus: 150, total: 300 })
    // Even a perfect prompt match cannot escape the cap while the guess missed the subject.
    expect(parts(100, 0, 100).total).toBe(300)
    expect(parts(100, 0, 100).total).toBeLessThan(400)
  })

  it('a beautiful off-prompt drawing earns less than a crude on-prompt one', () => {
    const polishedOnPrompt = parts(95, 95, 95)
    const crudeOnPrompt = parts(55, 60, 25)
    const polishedOffPrompt = parts(20, 0, 100)
    const blank = blankGradeParts()
    expect(polishedOnPrompt.total).toBeGreaterThan(crudeOnPrompt.total)
    expect(crudeOnPrompt.total).toBeGreaterThan(polishedOffPrompt.total)
    expect(polishedOffPrompt.total).toBeGreaterThanOrEqual(blank.total)
    expect(blank.total).toBe(0)
  })

  it('pays no quality bonus when nothing matches the prompt', () => {
    expect(parts(0, 0, 100).total).toBe(0)
  })

  it('clamps out-of-range judge values', () => {
    expect(parts(150, 100, 150)).toMatchObject({ match: 100, recognition: 100, quality: 100, total: 1000 })
    expect(parts(-20, -5, -5)).toMatchObject({ match: 0, recognition: 0, quality: 0, total: 0 })
  })

  it('a blank canvas is all zeroes, with no parts to show', () => {
    expect(blankGradeParts()).toEqual({ match: 0, recognition: 0, quality: 0, promptScore: 0, matchPoints: 0, qualityBonus: 0, total: 0 })
  })
})
