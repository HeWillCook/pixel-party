import { describe, expect, it } from 'vitest'
import {
  PARTY_PAINT_RATE,
  SOLO_PAINT_RATE,
  consumePaintToken,
  paintRate,
  validatePlacement,
} from './rules'

const base = {
  width: 32,
  height: 32,
  x: 10,
  y: 12,
  color: 4,
  userId: 'user-1',
  roundPlaying: true,
}

describe('validatePlacement', () => {
  it('accepts a valid placement', () => {
    expect(validatePlacement(base)).toEqual({ ok: true })
  })

  it('rejects unauthenticated users', () => {
    expect(validatePlacement({ ...base, userId: null })).toEqual({ ok: false, reason: 'not_signed_in' })
  })

  it('rejects unauthenticated users before round, bounds, and color checks', () => {
    expect(
      validatePlacement({ ...base, userId: null, roundPlaying: false, x: -1, color: 0 }),
    ).toEqual({ ok: false, reason: 'not_signed_in' })
  })

  it('rejects when the round is inactive before bounds/color', () => {
    expect(
      validatePlacement({ ...base, roundPlaying: false, x: -1, color: 0 }),
    ).toEqual({ ok: false, reason: 'round_inactive' })
  })

  it('rejects out-of-bounds and non-integer coordinates', () => {
    expect(validatePlacement({ ...base, x: 32 })).toMatchObject({ ok: false, reason: 'out_of_bounds' })
    expect(validatePlacement({ ...base, y: 32 })).toMatchObject({ ok: false, reason: 'out_of_bounds' })
    expect(validatePlacement({ ...base, x: -1 })).toMatchObject({ ok: false, reason: 'out_of_bounds' })
    expect(validatePlacement({ ...base, x: 1.5 })).toMatchObject({ ok: false, reason: 'out_of_bounds' })
    expect(validatePlacement({ ...base, y: Number.NaN })).toMatchObject({
      ok: false,
      reason: 'out_of_bounds',
    })
  })

  it('accepts 0 and 16, and rejects >16, negative, or non-integer', () => {
    expect(validatePlacement({ ...base, color: 0 })).toEqual({ ok: true })
    expect(validatePlacement({ ...base, color: 16 })).toEqual({ ok: true })
    expect(validatePlacement({ ...base, color: 17 })).toMatchObject({ ok: false, reason: 'bad_color' })
    expect(validatePlacement({ ...base, color: -1 })).toMatchObject({ ok: false, reason: 'bad_color' })
    expect(validatePlacement({ ...base, color: 2.5 })).toMatchObject({ ok: false, reason: 'bad_color' })
  })
})

describe('paint pace', () => {
  it('uses a 60/s solo bucket and a 40/s per-painter party bucket', () => {
    expect(SOLO_PAINT_RATE).toEqual({ cellsPerSecond: 60, burst: 60 })
    expect(PARTY_PAINT_RATE).toEqual({ cellsPerSecond: 40, burst: 40 })
    expect(paintRate(0)).toBe(SOLO_PAINT_RATE)
    expect(paintRate(1)).toBe(SOLO_PAINT_RATE)
    expect(paintRate(2)).toBe(PARTY_PAINT_RATE)
    expect(paintRate(12)).toBe(PARTY_PAINT_RATE)
  })

  it('refills the solo bucket at 60/s, bounds bursts and handles backwards time', () => {
    expect(consumePaintToken({ tokens: 0, updatedAt: 1000 }, 1000, SOLO_PAINT_RATE)).toEqual({ ok: false, retryAt: 1017 })
    expect(consumePaintToken({ tokens: 0, updatedAt: 1000 }, 1017, SOLO_PAINT_RATE)).toMatchObject({ ok: true })
    expect(consumePaintToken({ tokens: 0, updatedAt: 1000 }, 2000, SOLO_PAINT_RATE)).toEqual({ ok: true, bucket: { tokens: 59, updatedAt: 2000 } })
    expect(consumePaintToken({ tokens: 0, updatedAt: 1000 }, 900, SOLO_PAINT_RATE).ok).toBe(false)
  })

  it('gives a fresh party painter a one-second burst and refills at 40/s', () => {
    const first = consumePaintToken(undefined, 5000, PARTY_PAINT_RATE)
    expect(first).toEqual({ ok: true, bucket: { tokens: 39, updatedAt: 5000 } })
    expect(consumePaintToken({ tokens: 0, updatedAt: 5000 }, 5024, PARTY_PAINT_RATE)).toMatchObject({ ok: false })
    expect(consumePaintToken({ tokens: 0, updatedAt: 5000 }, 5025, PARTY_PAINT_RATE)).toMatchObject({ ok: true })
    expect(consumePaintToken({ tokens: 0, updatedAt: 5000 }, 5100, PARTY_PAINT_RATE)).toMatchObject({ ok: true })
  })
})
