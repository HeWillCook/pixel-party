import { describe, expect, it } from 'vitest'
import { initialDailyClientState } from './client-schedule'
import { createDailySoundGate } from './sound-events'

const playing = {
  ...initialDailyClientState('2026-11-17'),
  status: 'playing' as const,
  startedAt: 1_000,
  endsAt: 601_000,
}

describe('daily sound events', () => {
  it('stays silent on initial load, repeated grades, and a refreshed day', () => {
    const gate = createDailySoundGate()
    expect(gate({ ...playing, lastGradeAt: 100_000 }, 100_000)).toEqual([])
    expect(gate({ ...playing, lastGradeAt: 100_000 }, 100_001)).toEqual([])
    expect(gate({ ...playing, day: '2026-11-18', lastGradeAt: 200_000 }, 200_000)).toEqual([])
  })

  it('blips once when a new live grade arrives, never for painting', () => {
    const gate = createDailySoundGate()
    gate(playing, 10_000)
    expect(gate(playing, 10_001)).toEqual([])
    const graded = { ...playing, lastGradeAt: 20_000 }
    expect(gate(graded, 20_000)).toEqual(['guess'])
    expect(gate(graded, 20_001)).toEqual([])
  })

  it('ticks once per last-five second without a tick on initial load', () => {
    const gate = createDailySoundGate()
    expect(gate(playing, 596_000)).toEqual([])
    expect(gate(playing, 597_000)).toEqual(['tick'])
    expect(gate(playing, 597_250)).toEqual([])
    expect(gate(playing, 598_000)).toEqual(['tick'])
  })

  it('plays one end jingle instead of a grade blip, and no jingle on reload', () => {
    const gate = createDailySoundGate()
    gate(playing, 10_000)
    const ended = { ...playing, status: 'ended' as const, best: 840, lastGradeAt: 20_000 }
    expect(gate(ended, 20_000)).toEqual(['win'])
    expect(gate(ended, 20_001)).toEqual([])
    expect(createDailySoundGate()(ended, 20_001)).toEqual([])
    const timeout = createDailySoundGate()
    timeout(playing, 10_000)
    expect(timeout({ ...playing, status: 'ended' }, 601_000)).toEqual(['timeout'])
  })
})
