import { describe, expect, it, vi } from 'vitest'
import { DAILY } from '../game/config'
import { promptForDay } from '../game/daily/prompts'
import { gradeScore } from '../game/daily/scoring'
import { encodeCells } from '../game/grid'
import { fakeDailyJudge } from './daily-judge'
import { memoryAttemptStore } from './daily-room'
import { dailyState, endDaily, gradeDaily, startDaily, todaysDrawings } from './daily-service'
import type { DailyDeps } from './daily-service'
import { memoryTools } from './room-test-tools'

const user = { userId: 'alice', name: 'Alice', image: 'alice.png' }
const day = '2026-11-17'
const startedAt = Date.UTC(2026, 10, 17, 12)
const cells = encodeCells(new Uint8Array(1024).fill(2))
const otherCells = encodeCells(new Uint8Array(1024).fill(3))

function setup(initialNow = startedAt) {
  let now = initialNow
  const records = memoryTools()
  const judge = fakeDailyJudge()
  const deps: DailyDeps = {
    now: () => now,
    store: memoryAttemptStore(records.tools),
    judge: { blind: vi.fn(judge.blind), score: vi.fn(judge.score) },
    tools: records.tools,
    reserveBudget: vi.fn(async () => true),
    render: vi.fn(async (value: string) => value),
  }
  return { deps, records, at: (value: number) => { now = value } }
}

function onlyRow(records: ReturnType<typeof memoryTools>, collection: string) {
  expect(records.rows(collection).size).toBe(1)
  return [...records.rows(collection).values()][0]
}

describe('daily service', () => {
  it('does not reveal the prompt or another player\'s cells before starting', async () => {
    const { deps } = setup()
    await startDaily(deps, user)
    await gradeDaily(deps, user, 'ask', cells)
    const state = await dailyState(deps, 'bob')
    expect(state).toEqual({ day, status: 'not_started', autoUsed: 0, asksUsed: 0, finalUsed: false, best: 0 })
    expect(state).not.toHaveProperty('prompt')
    expect(state).not.toHaveProperty('lastCells')
  })

  it('starts once, reveals the prompt, and initializes private records without resetting them', async () => {
    const { deps, records, at } = setup()
    const state = await startDaily(deps, user)
    expect(state).toMatchObject({ day, status: 'playing', prompt: promptForDay(day).prompt, startedAt, endsAt: startedAt + 600_000, nextAutoAt: startedAt + 120_000 })
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ day, userId: user.userId, displayName: 'Alice', avatarUrl: 'alice.png', score: 0, ended: 0 })
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ day, userId: user.userId, visibility: 'private' })
    at(startedAt + 5000)
    await gradeDaily(deps, user, 'ask', cells)
    const saved = { ...onlyRow(records, 'dailyScores') }
    at(startedAt + 10_000)
    expect((await startDaily(deps, user)).startedAt).toBe(startedAt)
    expect(onlyRow(records, 'dailyScores')).toEqual(saved)
    onlyRow(records, 'dailyDrawings')
  })

  it('grades with both judge calls, weighted scoring, and saves the best snapshot', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 5000)
    const result = await gradeDaily(deps, user, 'ask', cells)
    const prompt = promptForDay(day)
    const judge = fakeDailyJudge()
    const blind = (await judge.blind(cells))!
    const score = (await judge.score(cells, prompt.prompt, prompt.subject, blind.guess))!
    expect(result).toMatchObject({ ok: true, grade: { ...gradeScore({ ...score, elapsedMs: 5000 }), guess: blind.guess, reason: score.reason, elapsedMs: 5000 }, state: { asksUsed: 1, lastCells: cells } })
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ score: gradeScore({ ...score, elapsedMs: 5000 }).total, bestElapsedMs: 5000 })
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ cells, guess: blind.guess, reason: score.reason })
    expect(deps.reserveBudget).toHaveBeenCalledTimes(2)
  })

  it('reserves atomically so parallel asks produce one success and one busy', async () => {
    const { deps } = setup()
    await startDaily(deps, user)
    const results = await Promise.all([gradeDaily(deps, user, 'ask', cells), gradeDaily(deps, user, 'ask', otherCells)])
    expect(results.filter(result => result.ok)).toHaveLength(1)
    expect(results.find(result => !result.ok)).toMatchObject({ ok: false, reason: 'busy' })
    expect(deps.reserveBudget).toHaveBeenCalledTimes(2)
  })

  it.each([1, 2])('refunds the ask when budget reservation %i is refused', async refused => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    const budget = vi.mocked(deps.reserveBudget)
    if (refused === 2) budget.mockResolvedValueOnce(true)
    budget.mockResolvedValueOnce(false)
    expect(await gradeDaily(deps, user, 'ask', cells)).toMatchObject({ ok: false, reason: 'judge_resting', state: { asksUsed: 0 } })
    expect(deps.judge.score).not.toHaveBeenCalled()
    at(startedAt + DAILY.askMinGapMs)
    expect((await gradeDaily(deps, user, 'ask', cells)).ok).toBe(true)
  })

  it.each(['blind', 'score'] as const)('retries a null %s once and reserves budget for every actual call', async method => {
    const { deps } = setup()
    await startDaily(deps, user)
    vi.mocked(deps.judge[method]).mockResolvedValueOnce(null)
    expect((await gradeDaily(deps, user, 'ask', cells)).ok).toBe(true)
    expect(deps.reserveBudget).toHaveBeenCalledTimes(3)
    expect(deps.judge[method]).toHaveBeenCalledTimes(2)
  })

  it.each(['blind', 'score'] as const)('refunds after two null %s results and permits another ask', async method => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    vi.mocked(deps.judge[method]).mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    expect(await gradeDaily(deps, user, 'ask', cells)).toMatchObject({ ok: false, reason: 'judge_resting', state: { asksUsed: 0 } })
    at(startedAt + DAILY.askMinGapMs)
    expect((await gradeDaily(deps, user, 'ask', cells)).ok).toBe(true)
  })

  it('stops before retrying if the retry budget is refused', async () => {
    const { deps } = setup()
    await startDaily(deps, user)
    vi.mocked(deps.judge.blind).mockResolvedValueOnce(null)
    vi.mocked(deps.reserveBudget).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await gradeDaily(deps, user, 'ask', cells)).toMatchObject({ ok: false, reason: 'judge_resting', state: { asksUsed: 0 } })
    expect(deps.judge.blind).toHaveBeenCalledTimes(1)
    expect(deps.judge.score).not.toHaveBeenCalled()
  })

  it.each(['render', 'blind', 'score', 'reserveBudget'] as const)('releases the slot on a thrown %s error', async method => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    const operation = method === 'blind' || method === 'score' ? deps.judge[method] : deps[method]
    vi.mocked(operation).mockRejectedValueOnce(new Error('offline'))
    expect(await gradeDaily(deps, user, 'ask', cells)).toMatchObject({ ok: false, reason: 'judge_resting', state: { asksUsed: 0 } })
    at(startedAt + DAILY.askMinGapMs)
    expect((await gradeDaily(deps, user, 'ask', cells)).ok).toBe(true)
  })

  it('rejects unchanged auto grades without spending budget or invoking the judge', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    await gradeDaily(deps, user, 'ask', cells)
    vi.clearAllMocks()
    at(startedAt + 120_000)
    expect(await gradeDaily(deps, user, 'auto', cells)).toMatchObject({ ok: false, reason: 'unchanged' })
    expect(deps.reserveBudget).not.toHaveBeenCalled()
    expect(deps.judge.blind).not.toHaveBeenCalled()
    expect(deps.judge.score).not.toHaveBeenCalled()
    expect(records.update).not.toHaveBeenCalled()
  })

  it('keeps the best drawing and score after a lower grade and end', async () => {
    const { deps, records, at } = setup()
    vi.mocked(deps.judge.score).mockResolvedValueOnce({ fit: 100, recognition: 100, reason: 'great' }).mockResolvedValueOnce({ fit: 1, recognition: 1, reason: 'worse' })
    await startDaily(deps, user)
    await gradeDaily(deps, user, 'ask', cells)
    at(startedAt + 20_000)
    expect(await gradeDaily(deps, user, 'ask', otherCells)).toMatchObject({ ok: true, state: { best: 1000, lastCells: otherCells } })
    await endDaily(deps, user, otherCells)
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ score: 1000, ended: 1 })
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ cells, score: 1000 })
  })

  it.each(['!', encodeCells(new Uint8Array(1023)), encodeCells(new Uint8Array(1024).fill(16))])('rejects invalid encoded grids before reserving', async invalid => {
    const { deps } = setup()
    await startDaily(deps, user)
    expect(await gradeDaily(deps, user, 'ask', invalid)).toMatchObject({ ok: false, reason: 'bad_cells', state: { asksUsed: 0 } })
    expect(deps.reserveBudget).not.toHaveBeenCalled()
    expect(deps.render).not.toHaveBeenCalled()
  })

  it('enforces time limits including the final-only grace window', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 600_001)
    expect(await gradeDaily(deps, user, 'ask', cells)).toMatchObject({ ok: false, reason: 'time_up' })
    expect((await gradeDaily(deps, user, 'final', cells)).ok).toBe(true)
    at(startedAt + 616_000)
    expect(await gradeDaily(deps, user, 'final', otherCells)).toMatchObject({ ok: false, reason: 'time_up', state: { status: 'ended' } })
  })

  it('ends an ungraded attempt with its final cells and never restarts it', async () => {
    const { deps, records } = setup()
    await startDaily(deps, user)
    expect(await endDaily(deps, user, cells)).toMatchObject({ status: 'ended', lastCells: cells })
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ ended: 1, score: 0 })
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ cells, score: 0, visibility: 'private' })
    expect((await startDaily(deps, user)).status).toBe('ended')
    expect(await gradeDaily(deps, user, 'ask', cells)).toMatchObject({ ok: false, reason: 'ended' })
  })

  it('resumes the original attempt after midnight until it ends', async () => {
    const late = Date.UTC(2026, 10, 17, 23, 55)
    const { deps, records, at } = setup(late)
    await startDaily(deps, user)
    at(late + 360_000)
    expect(await gradeDaily(deps, user, 'ask', cells, day)).toMatchObject({ ok: true, state: { day, status: 'playing' } })
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ day })
    expect(await dailyState(deps, user.userId)).toMatchObject({ day, status: 'playing' })
    expect(await endDaily(deps, user, cells, day)).toMatchObject({ day, status: 'ended' })
    expect(await todaysDrawings(deps, user.userId)).toEqual({ ok: false })
  })

  it('denies drawings before ending and returns only today after ending, including paginated rows', async () => {
    const { deps, records } = setup()
    expect(await todaysDrawings(deps, user.userId)).toEqual({ ok: false })
    await startDaily(deps, user)
    expect(await todaysDrawings(deps, user.userId)).toEqual({ ok: false })
    await endDaily(deps, user, cells)
    await records.tools.create('dailyDrawings', { day: '2026-11-16', userId: 'old', cells: otherCells })
    for (let index = 0; index < 51; index++) await records.tools.create('dailyDrawings', { day, userId: `player-${index}`, cells })
    const result = await todaysDrawings(deps, user.userId)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('drawings denied')
    expect(result.drawings).toHaveLength(52)
    expect(result.drawings).not.toContainEqual(expect.objectContaining({ data: expect.objectContaining({ userId: 'old' }) }))
  })

  it('does not start an attempt implicitly when grading or ending', async () => {
    const { deps, records } = setup()
    expect(await gradeDaily(deps, user, 'ask', cells)).toMatchObject({ ok: false, reason: 'not_started' })
    expect((await endDaily(deps, user, null)).status).toBe('not_started')
    expect(records.rows('dailyScores').size).toBe(0)
  })

  it('ignores stale successful completions after a replacement reservation', async () => {
    const { deps, records, at } = setup()
    let resolveBlind!: (value: { guess: string }) => void
    vi.mocked(deps.judge.blind).mockImplementationOnce(() => new Promise(resolve => { resolveBlind = resolve }))
    await startDaily(deps, user)
    const pending = gradeDaily(deps, user, 'ask', cells)
    await vi.waitFor(() => expect(deps.judge.blind).toHaveBeenCalledTimes(1))
    at(startedAt + DAILY.inFlightStaleMs)
    expect((await gradeDaily(deps, user, 'ask', otherCells)).ok).toBe(true)
    const saved = { ...onlyRow(records, 'dailyScores') }
    resolveBlind({ guess: 'stale' })
    expect(await pending).toMatchObject({ ok: false, reason: 'stale' })
    expect(deps.judge.score).toHaveBeenCalledTimes(1)
    expect(onlyRow(records, 'dailyScores')).toEqual(saved)
    expect(onlyRow(records, 'dailyDrawings').cells).toBe(otherCells)
    expect((await dailyState(deps, user.userId)).lastCells).toBe(otherCells)
  })

  it('does not let a stale failure refund or clear a replacement in-flight ask', async () => {
    const { deps, at } = setup()
    let rejectOld!: (error: Error) => void
    let resolveNew!: (value: { guess: string }) => void
    vi.mocked(deps.judge.blind)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve }))
    await startDaily(deps, user)
    const oldGrade = gradeDaily(deps, user, 'ask', cells)
    await vi.waitFor(() => expect(deps.judge.blind).toHaveBeenCalledTimes(1))
    at(startedAt + DAILY.inFlightStaleMs)
    const newGrade = gradeDaily(deps, user, 'ask', otherCells)
    await vi.waitFor(() => expect(deps.judge.blind).toHaveBeenCalledTimes(2))
    rejectOld(new Error('old request timed out'))
    expect(await oldGrade).toMatchObject({ ok: false, reason: 'stale', state: { asksUsed: 1 } })
    expect(await deps.store.get(user.userId, day)).toMatchObject({ inFlightSince: startedAt + DAILY.inFlightStaleMs, inFlightKind: 'ask', asksUsed: 1 })
    resolveNew({ guess: 'new' })
    expect(await newGrade).toMatchObject({ ok: true, state: { asksUsed: 1, lastCells: otherCells } })
  })
})
