import { describe, expect, it } from 'vitest'
import { buildShareText } from './shareText'

const base = { day: '2026-11-21', prompt: 'a lighthouse in a storm', score: 612 }

describe('buildShareText', () => {
  it('produces the full share text', () => {
    expect(buildShareText({ ...base, guess: 'a candle on a rock' })).toBe(
      'Pixle 2026-11-21 · "a lighthouse in a storm"\nHaiku guessed: "a candle on a rock"\nScore 612/1000\nhttps://pixle.app.space',
    )
  })

  it('omits the guess line when there is no guess', () => {
    expect(buildShareText({ ...base, guess: '  ' })).toBe(
      'Pixle 2026-11-21 · "a lighthouse in a storm"\nScore 612/1000\nhttps://pixle.app.space',
    )
    expect(buildShareText(base)).not.toContain('Haiku guessed')
  })

  it('adds a streak line only for a positive streak', () => {
    expect(buildShareText({ ...base, streak: 3 })).toContain('🔥 3-day streak\nhttps://pixle.app.space')
    expect(buildShareText({ ...base, streak: 0 })).not.toContain('streak')
  })
})
