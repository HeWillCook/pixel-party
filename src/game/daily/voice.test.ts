import { describe, expect, it } from 'vitest'
import {
  cannedLine,
  FINAL_SUSPENSE_LINE,
  HAIKU_LINES,
  momentsCrossed,
  peekFallbackLine,
  PEEK_FALLBACK_LINES,
  TIMED_MOMENTS_MS,
  verdictBeatMs,
  verdictGuessMs,
} from './voice'

describe('Haiku voice', () => {
  it('has a warm line for every canned moment and cycles without index errors', () => {
    for (const moment of ['start', 'minute', 'halfway', 'thirty_left', 'ten_left'] as const) {
      expect(HAIKU_LINES[moment].length).toBeGreaterThan(0)
      expect(cannedLine(moment, 0)).toBe(HAIKU_LINES[moment][0])
      expect(cannedLine(moment, HAIKU_LINES[moment].length)).toBe(HAIKU_LINES[moment][0])
    }
    expect(cannedLine('minute', -1)).toBeTruthy()
  })

  it('fires each timed moment once, in order, across a throttled tick gap', () => {
    expect(momentsCrossed(0, 59_000)).toEqual([])
    expect(momentsCrossed(59_000, 60_000)).toEqual(['minute'])
    expect(momentsCrossed(60_000, 270_000)).toEqual(['thirty_left'])
    expect(momentsCrossed(260_000, 295_000)).toEqual(['thirty_left', 'ten_left'])
    expect(momentsCrossed(290_000, 291_000)).toEqual([])
    expect(momentsCrossed(295_000, 290_000)).toEqual([])
    expect(Object.values(TIMED_MOMENTS_MS).every(at => Number.isInteger(at))).toBe(true)
  })

  it('the verdict beat is skippable and the suspense line is suspenseful', () => {
    expect(verdictBeatMs(false)).toBeGreaterThanOrEqual(2_000)
    expect(verdictBeatMs(false)).toBeLessThanOrEqual(3_000)
    expect(verdictBeatMs(true)).toBe(0)
    expect(verdictGuessMs(true)).toBe(0)
    expect(verdictGuessMs(false)).toBeGreaterThan(0)
    expect(FINAL_SUSPENSE_LINE).toContain('verdict')
  })

  it('has a canned fallback for any failed peek, with no numbers in it', () => {
    expect(PEEK_FALLBACK_LINES.length).toBeGreaterThan(0)
    for (let index = 0; index < PEEK_FALLBACK_LINES.length + 2; index++) {
      expect(peekFallbackLine(index)).not.toMatch(/\d/)
    }
  })
})
