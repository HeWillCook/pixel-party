import { describe, expect, it } from 'vitest'
import { gradeScore } from './scoring'

describe('daily scoring', () => {
  it('weights and clamps scores and time', () => {
    expect(gradeScore({ fit: 100, recognition: 100, elapsedMs: 0 }).total).toBe(1000)
    expect(gradeScore({ fit: 80, recognition: 50, elapsedMs: 120_000 })).toEqual({ fit: 400, recognition: 200, speed: 80, total: 680 })
    expect(gradeScore({ fit: 0, recognition: 0, elapsedMs: 590_000 }).speed).toBe(2)
    expect(gradeScore({ fit: 150, recognition: -5, elapsedMs: 700_000 })).toEqual({ fit: 500, recognition: 0, speed: 0, total: 500 })
  })
})
