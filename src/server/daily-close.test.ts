import { describe, expect, it } from 'vitest'
import { closeDay } from './daily-close'
import { memoryTools } from './room-test-tools'

const day = '2026-11-17'
const nextDay = '2026-11-18'

function scoreRow(userId: string, rowDay: string, score: number, bestElapsedMs: number | null) {
  return {
    day: rowDay, userId, displayName: userId, avatarUrl: `${userId}.png`,
    score, fit: 0, recognition: 0, speed: 0, bestElapsedMs, ended: 0, medal: 0,
  }
}

function drawingRow(userId: string, rowDay: string, visibility: 'public' | 'private' = 'private') {
  return {
    day: rowDay, userId, displayName: userId, prompt: 'a lighthouse in a storm',
    cells: '….', guess: '', reason: '', score: 0, visibility,
  }
}

/** Five finished players on the day, plus one player on the next day who must stay untouched. */
function seedDay() {
  const records = memoryTools()
  const standings: [string, number, number][] = [
    ['alice', 900, 400_000],
    ['bob', 700, 200_000],
    ['carol', 700, 150_000],
    ['dave', 500, 100_000],
    ['erin', 0, 0],
  ]
  for (const [userId, score, bestElapsedMs] of standings) {
    records.rows('dailyScores').set(userId, scoreRow(userId, day, score, bestElapsedMs))
    records.rows('dailyDrawings').set(userId, drawingRow(userId, day))
  }
  records.rows('dailyScores').set('later', scoreRow('later', nextDay, 950, 10_000))
  records.rows('dailyDrawings').set('later', drawingRow('later', nextDay))
  return records
}

function snapshot(records: ReturnType<typeof memoryTools>) {
  return JSON.stringify(['dailyScores', 'dailyDrawings'].map(collection =>
    [...records.rows(collection)].sort(([left], [right]) => left.localeCompare(right))))
}

describe('daily close', () => {
  it('publishes the day\'s drawings, awards top-three medals, and marks the day ended', async () => {
    const records = seedDay()
    expect(await closeDay(records.tools, day)).toEqual({ published: 5, medals: 3 })

    expect(Object.fromEntries([...records.rows('dailyDrawings')].map(([recordId, row]) => [recordId, row.visibility])))
      .toEqual({ alice: 'public', bob: 'public', carol: 'public', dave: 'public', erin: 'public', later: 'private' })

    // Carol beat Bob on the 700-point tie with the lower elapsed time; Erin is ranked despite scoring 0.
    expect(Object.fromEntries([...records.rows('dailyScores')].map(([recordId, row]) => [recordId, row.medal])))
      .toEqual({ alice: 1, carol: 2, bob: 3, dave: 0, erin: 0, later: 0 })

    expect(Object.fromEntries([...records.rows('dailyScores')].map(([recordId, row]) => [recordId, row.ended])))
      .toEqual({ alice: 1, bob: 1, carol: 1, dave: 1, erin: 1, later: 0 })
  })

  it('ranks a row without a best elapsed time after timed rows on the same score', async () => {
    const records = memoryTools()
    records.rows('dailyScores').set('slow', scoreRow('slow', day, 800, null))
    records.rows('dailyScores').set('fast', scoreRow('fast', day, 800, 150_000))
    expect(await closeDay(records.tools, day)).toEqual({ published: 0, medals: 2 })
    expect(records.rows('dailyScores').get('fast')!.medal).toBe(1)
    expect(records.rows('dailyScores').get('slow')!.medal).toBe(2)
  })

  it('produces the same result when run twice', async () => {
    const records = seedDay()
    await closeDay(records.tools, day)
    const afterFirstRun = snapshot(records)
    expect(await closeDay(records.tools, day)).toEqual({ published: 5, medals: 3 })
    expect(snapshot(records)).toBe(afterFirstRun)
  })
})
