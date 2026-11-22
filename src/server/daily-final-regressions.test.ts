import { describe, expect, it, vi } from 'vitest'
import { DAILY } from '../game/config'
import { dailyReducer, initialDailyClientState } from '../game/daily/client-schedule'
import { encodeCells } from '../game/grid'
import { fakeDailyJudge } from './daily-judge'
import { memoryAttemptStore } from './daily-room'
import { dailyState, endDaily, gradeDaily, InvalidAttemptDay, startDaily, todaysDrawings } from './daily-service'
import type { DailyDeps } from './daily-service'
import { memoryTools } from './room-test-tools'

const user = { userId: 'alice', name: 'Alice', image: 'alice.png' }
const day = '2026-11-17'
const startedAt = Date.UTC(2026, 10, 17, 12)
const HALFWAY = startedAt + 150_000
const FINAL = startedAt + 300_000
const cells = encodeCells(new Uint8Array(1024).fill(2))
const otherCells = encodeCells(new Uint8Array(1024).fill(3))

function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>(done => { resolve = done })
  return { promise, resolve }
}

function setup(start = startedAt) {
  let now = start
  const records = memoryTools()
  const fake = fakeDailyJudge()
  const deps: DailyDeps = {
    now: () => now, store: memoryAttemptStore(records.tools), tools: records.tools,
    judge: { blind: vi.fn(fake.blind), score: vi.fn(fake.score), peek: vi.fn(fake.peek) },
    reserveBudget: vi.fn(async () => true), render: vi.fn(async value => value),
  }
  const row = (collection: string) => [...records.rows(collection).values()].find(value => value.day === day)!
  return { deps, records, row, at: (value: number) => { now = value } }
}

describe('final review regressions', () => {
  it('rejects an expired yesterday without fabricating today or ending today\'s real attempt', async () => {
    const late = Date.UTC(2026, 10, 17, 23, 55)
    const { deps, at } = setup(late)
    await startDaily(deps, user)
    at(Date.UTC(2026, 10, 18, 0, 20))
    await startDaily(deps, user)
    const today = await deps.store.get(user.userId, '2026-11-18')
    const end = vi.spyOn(deps.store, 'end')
    const rejection = await gradeDaily(deps, user, 'final', cells, day)
    expect(rejection).toMatchObject({ ok: false, reason: 'invalid_day', state: { day, status: 'ended', startedAt: late } })
    await expect(endDaily(deps, user, cells, day)).rejects.toBeInstanceOf(InvalidAttemptDay)
    expect(end).not.toHaveBeenCalled()
    expect(await deps.store.get(user.userId, '2026-11-18')).toEqual(today)
    expect(await dailyState(deps, user.userId)).toMatchObject({ day: '2026-11-18', status: 'playing', best: 0 })
    expect(deps.judge.blind).not.toHaveBeenCalled()
  })

  it('I1 serializes delayed projection writes using the current authoritative best', async () => {
    const { deps, records, row, at } = setup()
    await startDaily(deps, user)
    vi.mocked(deps.judge.score)
      .mockResolvedValueOnce({ match: 50, recognition: 50, quality: 50, reason: 'old' })
      .mockResolvedValueOnce({ match: 100, recognition: 100, quality: 100, reason: 'best' })
    const held = deferred<void>()
    const update = records.update.getMockImplementation()!
    records.update.mockImplementationOnce(async (...args) => { await held.promise; return update(...args) })
    at(HALFWAY)
    const first = gradeDaily(deps, user, 'auto', cells, day, 0)
    await vi.waitFor(() => expect(records.update).toHaveBeenCalled())
    at(FINAL)
    const second = gradeDaily(deps, user, 'final', otherCells)
    await vi.waitFor(async () => expect((await deps.store.get(user.userId, day))?.bestScore).toBe(1000))
    held.resolve()
    await Promise.all([first, second])
    expect(row('dailyScores')).toMatchObject({ score: 1000, matchPoints: 500, qualityBonus: 500, match: 100, quality: 100 })
    // Score = the higher judgement; image = the latest canvas; caption = the most recent verdict.
    expect(row('dailyDrawings')).toMatchObject({ score: 1000, cells: otherCells, reason: 'best' })
  })

  it.each(['dailyScores', 'dailyDrawings'])('I2 repairs a failed %s projection on a later lower grade', async failedCollection => {
    const { deps, records, row, at } = setup()
    await startDaily(deps, user)
    vi.mocked(deps.judge.score)
      .mockResolvedValueOnce({ match: 100, recognition: 100, quality: 100, reason: 'winner' })
      .mockResolvedValueOnce({ match: 1, recognition: 1, quality: 1, reason: 'lower' })
    const update = records.update.getMockImplementation()!
    records.update.mockImplementation(async (...args) => {
      if (args[0] === failedCollection) throw new Error('temporary record outage')
      return update(...args)
    })
    at(HALFWAY)
    await expect(gradeDaily(deps, user, 'auto', cells, day, 0)).rejects.toThrow()
    records.update.mockImplementation(update)
    at(FINAL)
    await gradeDaily(deps, user, 'final', otherCells)
    expect(row('dailyScores')).toMatchObject({ score: 1000, startedAt })
    expect(row('dailyDrawings')).toMatchObject({ score: 1000, cells: otherCells, reason: 'lower' })
  })

  it.each(['state', 'end', 'start'])('I2 repairs the durable winner on %s without regrading', async repair => {
    const { deps, records, row, at } = setup()
    await startDaily(deps, user)
    vi.mocked(deps.judge.score).mockResolvedValueOnce({ match: 100, recognition: 100, quality: 100, reason: 'winner' })
    records.update.mockRejectedValueOnce(new Error('outage'))
    at(HALFWAY)
    await expect(gradeDaily(deps, user, 'auto', cells, day, 0)).rejects.toThrow()
    at(FINAL)
    if (repair === 'state') await dailyState(deps, user.userId)
    if (repair === 'end') await endDaily(deps, user, cells)
    if (repair === 'start') await startDaily(deps, user)
    expect(row('dailyScores')).toMatchObject({ score: 1000 })
    expect(row('dailyDrawings')).toMatchObject({ cells, score: 1000, reason: 'winner' })
    expect(deps.judge.score).toHaveBeenCalledTimes(1)
  })

  it('I3 resumes yesterday after midnight and binds old tabs when both days exist', async () => {
    const late = Date.UTC(2026, 10, 17, 23, 57)
    const { deps, at } = setup(late)
    await startDaily(deps, user)
    at(late + 180_000)
    expect(await dailyState(deps, user.userId)).toMatchObject({ day, status: 'playing', startedAt: late })
    expect(await startDaily(deps, user)).toMatchObject({ day: '2026-11-18' })
    expect(await dailyState(deps, user.userId)).toMatchObject({ day, status: 'playing' })
    expect(await gradeDaily(deps, user, 'auto', cells, day, 0)).toMatchObject({ ok: true, grade: { elapsedMs: 180_000 }, state: { day } })
    at(late + 300_000)
    expect(await endDaily(deps, user, cells, day)).toMatchObject({ day, status: 'ended' })
    expect(await deps.store.get(user.userId, '2026-11-18')).toMatchObject({ endedAt: null, finalUsed: false })
    expect(await dailyState(deps, user.userId)).toMatchObject({ day: '2026-11-18', status: 'playing', best: 0 })
    expect(await todaysDrawings(deps, user.userId)).toEqual({ ok: false })
  })

  it('M3 freezes an ended ungraded snapshot, including after public publication', async () => {
    const { deps, records, row, at } = setup()
    await startDaily(deps, user)
    at(FINAL)
    await endDaily(deps, user, cells)
    await endDaily(deps, user, otherCells)
    expect(row('dailyDrawings').cells).toBe(cells)
    row('dailyDrawings').visibility = 'public'
    row('dailyScores').medal = 2
    at(Date.UTC(2026, 10, 18, 0, 15))
    await endDaily(deps, user, otherCells)
    await expect(endDaily(deps, user, otherCells, day)).rejects.toBeInstanceOf(InvalidAttemptDay)
    await dailyState(deps, user.userId)
    expect(row('dailyDrawings')).toMatchObject({ cells, visibility: 'public' })
    expect(row('dailyScores').medal).toBe(2)
    expect(records.rows('dailyScores').size).toBe(1)
    expect((await deps.store.get(user.userId, day))?.lastCells).toBe(cells)
  })

  it('M13 retains the first valid zero-point final and its full snapshot', async () => {
    const { deps, row, at } = setup()
    await startDaily(deps, user)
    at(FINAL)
    vi.mocked(deps.judge.blind).mockResolvedValueOnce({ guess: 'zero guess', writing: '' })
    vi.mocked(deps.judge.score).mockResolvedValueOnce({ match: 0, recognition: 0, quality: 0, reason: 'zero reason' })
    expect(await gradeDaily(deps, user, 'final', cells)).toMatchObject({ ok: true, grade: { total: 0 } })
    expect(row('dailyScores')).toMatchObject({ score: 0, startedAt })
    expect(row('dailyDrawings')).toMatchObject({ score: 0, cells, guess: 'zero guess', reason: 'zero reason' })
  })

  it('I3 resumes only through yesterday\'s grace window, not an expired row', async () => {
    const late = Date.UTC(2026, 10, 17, 23, 55)
    const { deps, at } = setup(late)
    await startDaily(deps, user)
    at(late + DAILY.attemptMs + DAILY.graceMs)
    expect(await dailyState(deps, user.userId)).toMatchObject({ day, status: 'playing' })
    at(late + DAILY.attemptMs + DAILY.graceMs + 1)
    expect(await dailyState(deps, user.userId)).toMatchObject({ day: '2026-11-18', status: 'not_started' })
    expect(await gradeDaily(deps, user, 'final', cells, day)).toMatchObject({ ok: false, reason: 'invalid_day' })
    await expect(endDaily(deps, user, cells, day)).rejects.toBeInstanceOf(InvalidAttemptDay)
    expect(deps.judge.blind).not.toHaveBeenCalled()
  })

  it('I5 returns stale, not success, for a computed high grade whose lease was replaced', async () => {
    const { deps, row, at } = setup()
    await startDaily(deps, user)
    const held = deferred<{ match: number; recognition: number; quality: number; reason: string }>()
    vi.mocked(deps.judge.blind).mockResolvedValueOnce({ guess: 'old', writing: '' })
    vi.mocked(deps.judge.score).mockImplementationOnce(() => held.promise)
      .mockResolvedValueOnce({ match: 100, recognition: 100, quality: 100, reason: 'accepted' })
    at(HALFWAY)
    const old = gradeDaily(deps, user, 'auto', cells, day, 0)
    await vi.waitFor(() => expect(deps.judge.score).toHaveBeenCalledTimes(1))
    at(FINAL)
    const replacement = await gradeDaily(deps, user, 'final', otherCells)
    expect(replacement.ok).toBe(true)
    held.resolve({ match: 100, recognition: 100, quality: 100, reason: 'stale winner' })
    const stale = await old
    expect(stale).toMatchObject({ ok: false, reason: 'stale' })
    expect(stale).not.toHaveProperty('grade')
    expect(stale.state.best).toBe(row('dailyScores').score)
    if (stale.ok !== false) throw new Error('stale grade accepted')
    const client = dailyReducer(initialDailyClientState(day), { type: 'grade_rejected', reason: stale.reason, state: stale.state })
    expect(client.best).toBe(stale.state.best)
  })

  it('keeps the bounded four-call production retry sequence inside the 90-second lease', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(HALFWAY)
    let elapsed = 0
    const wait = () => { elapsed += 20_000; at(HALFWAY + elapsed) }
    vi.mocked(deps.judge.blind)
      .mockImplementationOnce(async () => { wait(); return null })
      .mockImplementationOnce(async () => { wait(); return { guess: 'cat', writing: '' } })
    vi.mocked(deps.judge.score)
      .mockImplementationOnce(async () => { wait(); return null })
      .mockImplementationOnce(async () => { wait(); return { match: 100, recognition: 100, quality: 100, reason: 'accepted' } })
    expect(DAILY.inFlightStaleMs).toBeGreaterThan(4 * 20_000)
    expect(await gradeDaily(deps, user, 'auto', cells, day, 0)).toMatchObject({ ok: true })
    expect(deps.reserveBudget).toHaveBeenCalledTimes(4)
  })
})
