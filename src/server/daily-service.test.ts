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
  it('keeps submitted score and cells when another tab finishes an in-flight auto', async () => {
    const { deps, at } = setup()
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const judging = new Promise<void>(resolve => { entered = resolve })
    const blind = deps.judge.blind
    deps.judge.blind = vi.fn(async png => { entered(); await gate; return blind(png) })
    await startDaily(deps, user)
    at(startedAt + 60_000)
    const auto = gradeDaily(deps, user, 'auto', cells, day, 0)
    await judging
    expect(await gradeDaily(deps, user, 'final', otherCells, day)).toMatchObject({ ok: false, reason: 'busy' })
    const submitted = await endDaily(deps, user, otherCells, day)
    release()
    await auto
    const row = await deps.store.get(user.userId, day)
    expect(row).toMatchObject({ endedAt: startedAt + 60_000, bestScore: submitted.best, lastCells: otherCells })
    expect(row?.bestGrade).toBeUndefined()
    expect(row?.windows[0].status).toBe('graded')
  })
  it('auto on blank cells skips without judge', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 60_000)
    expect(await gradeDaily(deps, user, 'auto', encodeCells(new Uint8Array(1024)))).toMatchObject({ skipped: 'skipped_blank', window: 0, state: { serverNow: startedAt + 60_000 } })
    expect(deps.judge.blind).not.toHaveBeenCalled()
    expect(deps.judge.score).not.toHaveBeenCalled()
    expect((await dailyState(deps, user.userId)).windows[0]).toMatchObject({ status: 'skipped_blank' })
  })
  it('me settles missed windows and persists them', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 210_000)
    expect((await dailyState(deps, user.userId)).windows[2].status).toBe('pending')
    at(startedAt + 211_000)
    const state = await dailyState(deps, user.userId)
    expect(state.windows.map(window => window.status)).toEqual(['missed', 'missed', 'missed', 'pending'])
    expect(state).toMatchObject({ nextAutoAt: startedAt + 240_000, serverNow: startedAt + 211_000, asksLeft: 3 })
    expect((await deps.store.get(user.userId, day))?.windows.map(window => window.status)).toEqual(['missed', 'missed', 'missed', 'pending'])
  })
  it('second auto for same window is not graded twice', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 60_000)
    const results = await Promise.all([gradeDaily(deps, user, 'auto', cells), gradeDaily(deps, user, 'auto', cells)])
    expect(results.filter(result => result.ok === true)).toHaveLength(1)
    expect(results.some(result => ('reason' in result && result.reason === 'busy') || ('skipped' in result && result.skipped === 'skipped_unchanged'))).toBe(true)
    expect(deps.judge.blind).toHaveBeenCalledTimes(1)
    expect(deps.judge.score).toHaveBeenCalledTimes(1)
  })
  it('ask does not move nextAutoAt', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 30_000)
    expect(await gradeDaily(deps, user, 'ask', cells)).toMatchObject({ ok: true, state: { nextAutoAt: startedAt + 60_000, serverNow: startedAt + 30_000, asksLeft: 2 } })
  })
  it('does not reveal the prompt or another player\'s cells before starting', async () => {
    const { deps } = setup()
    await startDaily(deps, user)
    await gradeDaily(deps, user, 'ask', cells)
    const state = await dailyState(deps, 'bob')
    expect(state).toMatchObject({ day, status: 'not_started', autoUsed: 0, asksUsed: 0, finalUsed: false, best: 0 })
    expect(state).not.toHaveProperty('prompt')
    expect(state).not.toHaveProperty('lastCells')
  })

  it('starts once, reveals the prompt, and initializes private records without resetting them', async () => {
    const { deps, records, at } = setup()
    const state = await startDaily(deps, user)
    expect(state).toMatchObject({ day, status: 'playing', prompt: promptForDay(day).prompt, startedAt, endsAt: startedAt + 300_000, nextAutoAt: startedAt + 60_000 })
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
    at(startedAt + 60_000)
    expect(await gradeDaily(deps, user, 'auto', cells)).toMatchObject({ skipped: 'skipped_unchanged', window: 0 })
    expect(deps.reserveBudget).not.toHaveBeenCalled()
    expect(deps.judge.blind).not.toHaveBeenCalled()
    expect(deps.judge.score).not.toHaveBeenCalled()
    expect(records.update).not.toHaveBeenCalled()
  })

  it('keeps the best drawing and score after a lower grade and end, and exposes bestCells only once ended', async () => {
    const { deps, records, at } = setup()
    vi.mocked(deps.judge.score).mockResolvedValueOnce({ fit: 100, recognition: 100, reason: 'great' }).mockResolvedValueOnce({ fit: 1, recognition: 1, reason: 'worse' })
    await startDaily(deps, user)
    const first = await gradeDaily(deps, user, 'ask', cells)
    expect(first).toMatchObject({ ok: true })
    if ('ok' in first && first.ok) expect(first.state.bestCells).toBeUndefined()
    at(startedAt + 20_000)
    const second = await gradeDaily(deps, user, 'ask', otherCells)
    expect(second).toMatchObject({ ok: true, state: { best: 1000, lastCells: otherCells } })
    if ('ok' in second && second.ok) expect(second.state.bestCells).toBeUndefined()
    expect((await dailyState(deps, user.userId)).bestCells).toBeUndefined()
    const ended = await endDaily(deps, user, otherCells)
    expect(ended.bestCells).toBe(cells)
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ score: 1000, ended: 1 })
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ cells, score: 1000 })
  })

  it.each(['!', encodeCells(new Uint8Array(1023)), encodeCells(new Uint8Array(1024).fill(17))])('rejects invalid encoded grids before reserving (including 17)', async invalid => {
    const { deps } = setup()
    await startDaily(deps, user)
    expect(await gradeDaily(deps, user, 'ask', invalid)).toMatchObject({ ok: false, reason: 'bad_cells', state: { asksUsed: 0 } })
    expect(deps.reserveBudget).not.toHaveBeenCalled()
    expect(deps.render).not.toHaveBeenCalled()
  })

  it('white paint is accepted by daily validation', async () => {
    const { deps } = setup()
    await startDaily(deps, user)
    const whiteCells = encodeCells(new Uint8Array(1024).fill(16))
    expect(await gradeDaily(deps, user, 'ask', whiteCells)).toMatchObject({ ok: true, state: { lastCells: whiteCells } })
  })

  it('legacy cells still valid', async () => {
    const { deps } = setup()
    await startDaily(deps, user)
    const raw = new Uint8Array(1024)
    for (let i = 0; i < raw.length; i++) raw[i] = i % 16
    const legacy = encodeCells(raw)
    expect(await gradeDaily(deps, user, 'ask', legacy)).toMatchObject({ ok: true, state: { lastCells: legacy } })
  })

  it('enforces time limits including the final-only grace window', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 300_001)
    expect(await gradeDaily(deps, user, 'ask', cells)).toMatchObject({ ok: false, reason: 'time_up' })
    expect((await gradeDaily(deps, user, 'final', cells)).ok).toBe(true)
    at(startedAt + 316_000)
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
    const late = Date.UTC(2026, 10, 17, 23, 57)
    const { deps, records, at } = setup(late)
    await startDaily(deps, user)
    at(late + 200_000)
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

describe('daily blank-canvas guard', () => {
  const blank = () => encodeCells(new Uint8Array(1024))

  it('ask on a blank canvas returns a zero grade without AI, budget, render, or burning an ask', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 5000)
    const result = await gradeDaily(deps, user, 'ask', blank())
    expect(result).toMatchObject({
      ok: true,
      grade: { guess: '', reason: 'Nothing is drawn yet — paint something first.', fit: 0, recognition: 0, speed: 0, total: 0, elapsedMs: 5000 },
      state: { asksUsed: 0, best: 0 },
    })
    expect(deps.judge.blind).not.toHaveBeenCalled()
    expect(deps.judge.score).not.toHaveBeenCalled()
    expect(deps.reserveBudget).not.toHaveBeenCalled()
    expect(deps.render).not.toHaveBeenCalled()
    expect(await deps.store.get(user.userId, day)).toMatchObject({ asksUsed: 0, bestScore: 0, inFlightSince: null })
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ score: 0 })
  })

  it('final on a blank canvas earns zero points and never calls the judge', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 5000)
    const result = await gradeDaily(deps, user, 'final', blank())
    expect(result).toMatchObject({ ok: true, grade: { guess: '', reason: 'Nothing is drawn yet — paint something first.', fit: 0, recognition: 0, speed: 0, total: 0 } })
    expect(deps.judge.blind).not.toHaveBeenCalled()
    expect(deps.judge.score).not.toHaveBeenCalled()
    expect(deps.reserveBudget).not.toHaveBeenCalled()
    const ended = await endDaily(deps, user, blank())
    expect(ended).toMatchObject({ status: 'ended', best: 0 })
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ score: 0, speed: 0 })
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ score: 0 })
  })

  it('a blank final never overwrites a prior non-zero best', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 5000)
    await gradeDaily(deps, user, 'ask', cells)
    const prior = (await deps.store.get(user.userId, day))!.bestScore
    expect(prior).toBeGreaterThan(0)
    const result = await gradeDaily(deps, user, 'final', blank())
    expect(result).toMatchObject({ ok: true, grade: { total: 0, speed: 0 } })
    await endDaily(deps, user, blank())
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ score: prior })
  })

  it('blank ask and final before the attempt started report not_started', async () => {
    const { deps } = setup()
    for (const kind of ['ask', 'final'] as const) {
      expect(await gradeDaily(deps, user, kind, blank())).toMatchObject({ ok: false, reason: 'not_started' })
    }
    expect(deps.judge.blind).not.toHaveBeenCalled()
    expect(deps.reserveBudget).not.toHaveBeenCalled()
  })

  it.each(['ask', 'final'] as const)('a blank %s after the attempt ended reports ended, not a grade', async kind => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 5000)
    const ended = await endDaily(deps, user, null)
    expect(ended.status).toBe('ended')
    const saved = { ...onlyRow(records, 'dailyScores') }
    expect(await gradeDaily(deps, user, kind, blank())).toMatchObject({ ok: false, reason: 'ended', state: { status: 'ended' } })
    expect(deps.judge.blind).not.toHaveBeenCalled()
    expect(deps.judge.score).not.toHaveBeenCalled()
    expect(deps.reserveBudget).not.toHaveBeenCalled()
    expect(onlyRow(records, 'dailyScores')).toEqual(saved)
  })

  it('a blank ask past the attempt clock reports time_up instead of a grade', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 300_001)
    expect(await gradeDaily(deps, user, 'ask', blank())).toMatchObject({ ok: false, reason: 'time_up' })
    expect(deps.judge.blind).not.toHaveBeenCalled()
  })
})
