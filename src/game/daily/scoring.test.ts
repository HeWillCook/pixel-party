import { describe, expect, it } from 'vitest'
import { gradeScore } from './scoring'

describe('daily scoring', () => {
  it('awards the full 1000 for a perfect, instant drawing', () => {
    expect(gradeScore({ fit: 100, recognition: 100, elapsedMs: 0 })).toEqual({
      fit: 500,
      recognition: 400,
      speed: 100,
      total: 1000,
    })
  })

  it('weights mid-range scores and scales speed by drawing quality', () => {
    expect(gradeScore({ fit: 80, recognition: 50, elapsedMs: 60_000 })).toEqual({
      fit: 400,
      recognition: 200,
      // raw speed 80 x quality (80 + 50) / 200 = 52
      speed: 52,
      total: 652,
    })
  })

  it('never pays speed for a blank canvas', () => {
    expect(gradeScore({ fit: 0, recognition: 0, elapsedMs: 0 })).toEqual({
      fit: 0,
      recognition: 0,
      speed: 0,
      total: 0,
    })
    expect(gradeScore({ fit: 0, recognition: 0, elapsedMs: 295_000 }).speed).toBe(0)
  })

  it('caps fit at 55 and scales speed down when the guess missed the subject entirely', () => {
    // recognition 0 with a generous fit of 90: fit caps at 55 (275 pts).
    expect(gradeScore({ fit: 90, recognition: 0, elapsedMs: 0 })).toEqual({
      fit: 275,
      recognition: 0,
      // raw speed 100 x quality 55 / 200 = 27.5 -> 28
      speed: 28,
      total: 303,
    })

    const fast = gradeScore({ fit: 90, recognition: 0, elapsedMs: 60_000 })
    const slow = gradeScore({ fit: 90, recognition: 0, elapsedMs: 150_000 })
    // raw speed 80 -> 22, raw speed 50 -> 14 (both x 0.275)
    expect(fast.speed).toBe(22)
    expect(slow.speed).toBe(14)
    expect(fast.speed).toBeLessThan(80)

    // An unrecognized drawing can never reach 400, let alone 700.
    expect(gradeScore({ fit: 100, recognition: 0, elapsedMs: 0 }).total).toBeLessThan(400)
  })

  it('clamps out-of-range judges and time', () => {
    expect(gradeScore({ fit: 150, recognition: -5, elapsedMs: 700_000 })).toEqual({
      fit: 275,
      recognition: 0,
      speed: 0,
      total: 275,
    })
    expect(gradeScore({ fit: 150, recognition: 100, elapsedMs: 700_000 })).toEqual({
      fit: 500,
      recognition: 400,
      speed: 0,
      total: 900,
    })
    expect(gradeScore({ fit: -20, recognition: 100, elapsedMs: -5_000 })).toEqual({
      fit: 0,
      recognition: 400,
      speed: Math.round(100 * (100 / 200)),
      total: 450,
    })
  })
})
