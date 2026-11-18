import { describe, expect, it } from 'vitest'
import { consumeSoloToken, cooldownMs, validatePlacement } from './rules'

const base = {
  width: 32,
  height: 32,
  x: 10,
  y: 12,
  color: 4,
  userId: 'user-1',
  roundPlaying: true,
  lastPlacedAt: undefined as number | undefined,
  now: 5000,
  playersConnected: 1,
}

describe('cooldownMs', () => {
  it('returns zero when 0 or 1 players are connected', () => {
    expect(cooldownMs(1)).toBe(0)
    expect(cooldownMs(0)).toBe(0)
  })

  it('scales linearly by 1000ms per player up to 10_000ms', () => {
    expect(cooldownMs(2)).toBe(2000)
    expect(cooldownMs(3)).toBe(3000)
    expect(cooldownMs(10)).toBe(10_000)
    expect(cooldownMs(25)).toBe(10_000)
  })
})

describe('validatePlacement', () => {
  it('accepts valid placement', () => {
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

  it('rejects when round is inactive before bounds/color/cooldown', () => {
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

  it('rejects placements within cooldown and includes retryAt', () => {
    expect(
      validatePlacement({ ...base, playersConnected: 3, lastPlacedAt: 1000, now: 2000 }),
    ).toEqual({ ok: false, reason: 'cooldown', retryAt: 4000 })
  })

  it('allows placement exactly when cooldown expires', () => {
    expect(
      validatePlacement({ ...base, playersConnected: 3, lastPlacedAt: 1000, now: 4000 }),
    ).toEqual({ ok: true })
  })
})

it('refills the solo bucket at 60/s, bounds bursts and handles backwards time', () => {
  expect(consumeSoloToken({ tokens: 0, updatedAt: 1000 }, 1000)).toEqual({ ok: false, retryAt: 1017 })
  expect(consumeSoloToken({ tokens: 0, updatedAt: 1000 }, 1017)).toMatchObject({ ok: true })
  expect(consumeSoloToken({ tokens: 0, updatedAt: 1000 }, 2000)).toEqual({ ok: true, bucket: { tokens: 59, updatedAt: 2000 } })
  expect(consumeSoloToken({ tokens: 0, updatedAt: 1000 }, 900).ok).toBe(false)
})
