import { describe, expect, it, vi } from 'vitest'
import { DAILY } from '../game/config'
import { NO_SPELLING_REASON } from '../game/daily/judge'
import { promptForDay } from '../game/daily/prompts'
import { blankGradeParts, gradeScore } from '../game/daily/scoring'
import { encodeCells } from '../game/grid'
import { fakeDailyJudge } from './daily-judge'
import { memoryAttemptStore } from './daily-room'
import { dailyState, endDaily, gradeDaily, peekDaily, saveDailyCanvas, startDaily, todaysDrawings } from './daily-service'
import type { DailyDeps } from './daily-service'
import { memoryTools } from './room-test-tools'

const user = { userId: 'alice', name: 'Alice', image: 'alice.png' }
const day = '2026-11-17'
const startedAt = Date.UTC(2026, 10, 17, 12)
const cells = encodeCells(new Uint8Array(1024).fill(2))
const otherCells = encodeCells(new Uint8Array(1024).fill(3))
const HALFWAY = startedAt + 150_000
const FINAL = startedAt + 300_000

function setup(initialNow = startedAt) {
  let now = initialNow
  const records = memoryTools()
  const judge = fakeDailyJudge()
  const deps: DailyDeps = {
    now: () => now,
    store: memoryAttemptStore(records.tools),
    judge: { blind: vi.fn(judge.blind), score: vi.fn(judge.score), peek: vi.fn(judge.peek) },
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
  it('the halfway judgement uses both judge calls, the new scoring, and saves the snapshot', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(HALFWAY)
    const result = await gradeDaily(deps, user, 'auto', cells, day, 0)
    const prompt = promptForDay(day)
    const judge = fakeDailyJudge()
    const blind = (await judge.blind(cells))!
    const score = (await judge.score(cells, prompt.prompt, prompt.subject, blind.guess))!
    const expected = gradeScore(score)
    expect(result).toMatchObject({ ok: true, grade: { ...expected, guess: blind.guess, reason: score.reason, elapsedMs: HALFWAY - startedAt }, state: { lastCells: cells } })
    expect(onlyRow(records, 'dailyScores')).toMatchObject({
      score: expected.total, match: score.match, quality: score.quality, recognition: score.recognition,
      matchPoints: expected.matchPoints, qualityBonus: expected.qualityBonus, startedAt,
    })
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ cells, guess: blind.guess, reason: score.reason, score: expected.total })
    expect(deps.reserveBudget).toHaveBeenCalledTimes(2)
  })

  it('a spelled answer never counts as recognition and the verdict says why', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(HALFWAY)
    vi.mocked(deps.judge.blind).mockResolvedValueOnce({ guess: 'a lighthouse', text: true })
    vi.mocked(deps.judge.score).mockResolvedValueOnce({ match: 90, recognition: 100, quality: 80, reason: 'A tidy lighthouse.' })
    const result = await gradeDaily(deps, user, 'auto', cells, day, 0)
    expect(result).toMatchObject({ ok: true, grade: { guess: 'a lighthouse', recognition: 0, reason: NO_SPELLING_REASON } })
    if (!result.ok) throw new Error('grade refused')
    // Recognition 0 caps the prompt score at 30, so the whole grade stays at the unrecognised ceiling.
    expect(result.grade.matchPoints).toBeLessThanOrEqual(150)
    expect(result.grade.total).toBeLessThanOrEqual(300)
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ recognition: 0, score: result.grade.total })
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ guess: 'a lighthouse', reason: NO_SPELLING_REASON })
  })

  it('auto on blank cells skips without the judge', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(HALFWAY)
    expect(await gradeDaily(deps, user, 'auto', encodeCells(new Uint8Array(1024)))).toMatchObject({ skipped: 'skipped_blank', window: 0, state: { serverNow: HALFWAY } })
    expect(deps.judge.blind).not.toHaveBeenCalled()
    expect(deps.judge.score).not.toHaveBeenCalled()
    expect((await dailyState(deps, user.userId)).windows[0]).toMatchObject({ status: 'skipped_blank' })
  })

  it('me settles a missed halfway window and persists it', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(HALFWAY + 20_000)
    expect((await dailyState(deps, user.userId)).windows[0].status).toBe('pending')
    at(HALFWAY + 31_000)
    const state = await dailyState(deps, user.userId)
    expect(state.windows.map(window => window.status)).toEqual(['missed'])
    expect(state).toMatchObject({ nextAutoAt: null, serverNow: HALFWAY + 31_000 })
    expect((await deps.store.get(user.userId, day))?.windows.map(window => window.status)).toEqual(['missed'])
  })

  it('a second call for the same window is never graded twice', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(HALFWAY)
    const results = await Promise.all([gradeDaily(deps, user, 'auto', cells), gradeDaily(deps, user, 'auto', cells)])
    expect(results.filter(result => result.ok === true)).toHaveLength(1)
    expect(results.some(result => ('reason' in result && result.reason === 'busy') || ('skipped' in result && result.skipped === 'skipped_unchanged'))).toBe(true)
    expect(deps.judge.blind).toHaveBeenCalledTimes(1)
    expect(deps.judge.score).toHaveBeenCalledTimes(1)
  })

  it('does not reveal the prompt or another player\'s cells before starting', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(HALFWAY)
    await gradeDaily(deps, user, 'auto', cells, day, 0)
    const state = await dailyState(deps, 'bob')
    expect(state).toMatchObject({ day, status: 'not_started', autoUsed: 0, finalUsed: false, best: 0 })
    expect(state).not.toHaveProperty('prompt')
    expect(state).not.toHaveProperty('lastCells')
  })

  it('starts once, reveals the prompt, and initializes private records', async () => {
    const { deps, records, at } = setup()
    const state = await startDaily(deps, user)
    expect(state).toMatchObject({ day, status: 'playing', prompt: promptForDay(day).prompt, startedAt, endsAt: FINAL, nextAutoAt: HALFWAY })
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ day, userId: user.userId, displayName: 'Alice', avatarUrl: 'alice.png', score: 0, ended: 0 })
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ day, userId: user.userId, visibility: 'private' })
    at(startedAt + 5000)
    const saved = { ...onlyRow(records, 'dailyScores') }
    at(startedAt + 10_000)
    expect((await startDaily(deps, user)).startedAt).toBe(startedAt)
    expect(onlyRow(records, 'dailyScores')).toEqual(saved)
    onlyRow(records, 'dailyDrawings')
  })

  it('publishes the higher score with the latest canvas and the latest verdict caption', async () => {
    const { deps, records, at } = setup()
    vi.mocked(deps.judge.score)
      .mockResolvedValueOnce({ match: 100, recognition: 100, quality: 100, reason: 'halfway winner' })
      .mockResolvedValueOnce({ match: 5, recognition: 100, quality: 10, reason: 'final, quieter' })
    await startDaily(deps, user)
    at(HALFWAY)
    const first = await gradeDaily(deps, user, 'auto', cells, day, 0)
    expect(first).toMatchObject({ ok: true })
    at(FINAL)
    const final = await gradeDaily(deps, user, 'final', otherCells)
    expect(final).toMatchObject({ ok: true, state: { status: 'ended', best: 1000, lastCells: otherCells } })
    if (final.ok !== true) throw new Error('final failed')
    expect(final.grade.total).toBeLessThan(1000)
    expect(final.grade.reason).toBe('final, quieter')

    const score = onlyRow(records, 'dailyScores')
    expect(score).toMatchObject({ score: 1000, matchPoints: 500, qualityBonus: 500, ended: 1 })
    // Image = the latest canvas (the final one), caption = the most recent verdict, score = the best.
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ cells: otherCells, reason: 'final, quieter', score: 1000 })
    expect((await deps.store.get(user.userId, day))).toMatchObject({
      endedAt: FINAL,
      bestGrade: { cells },
      lastGrade: { cells: otherCells },
      lastCells: otherCells,
    })
  })

  it('an unchanged final reuses the halfway grade with no model call and still ends the attempt', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(HALFWAY)
    const halfway = await gradeDaily(deps, user, 'auto', cells, day, 0)
    if (halfway.ok !== true) throw new Error('halfway failed')
    vi.clearAllMocks()
    at(FINAL)
    const final = await gradeDaily(deps, user, 'final', cells)
    expect(final).toMatchObject({ ok: true, state: { status: 'ended' } })
    if (final.ok !== true) throw new Error('final failed')
    expect(final.grade).toMatchObject({ total: halfway.grade.total, reason: halfway.grade.reason, guess: halfway.grade.guess })
    expect(deps.reserveBudget).not.toHaveBeenCalled()
    expect(deps.judge.blind).not.toHaveBeenCalled()
    expect(deps.judge.score).not.toHaveBeenCalled()
  })

  it('the final still ends with a verdict when the judge is resting', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(HALFWAY)
    await gradeDaily(deps, user, 'auto', cells, day, 0)
    vi.mocked(deps.judge.blind).mockResolvedValue(null)
    at(FINAL)
    const final = await gradeDaily(deps, user, 'final', otherCells)
    expect(final).toMatchObject({ ok: true, state: { status: 'ended', lastCells: otherCells } })
    if (final.ok !== true) throw new Error('final failed')
    expect(final.grade.reason).toBeTruthy()
  })

  it('an early final before 2:30 ends the attempt with its single judgement', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 60_000)
    const final = await gradeDaily(deps, user, 'final', cells)
    if (final.ok !== true) throw new Error('final failed')
    expect(final.state).toMatchObject({ status: 'ended', finalUsed: true, best: final.grade.total, lastCells: cells })
    // The halfway window was never reached, so the final is the only judgement.
    expect((await deps.store.get(user.userId, day))?.windows.map(window => window.status)).toEqual(['not_reached'])
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ ended: 1, score: final.grade.total })
    expect(deps.judge.blind).toHaveBeenCalledTimes(1)
    expect(deps.judge.score).toHaveBeenCalledTimes(1)
  })

  it('an early final after 2:30 keeps the better of the two judgements', async () => {
    const { deps, at } = setup()
    vi.mocked(deps.judge.score)
      .mockResolvedValueOnce({ match: 100, recognition: 100, quality: 100, reason: 'halfway winner' })
      .mockResolvedValueOnce({ match: 5, recognition: 100, quality: 10, reason: 'final, quieter' })
    await startDaily(deps, user)
    at(HALFWAY)
    const halfway = await gradeDaily(deps, user, 'auto', cells, day, 0)
    if (halfway.ok !== true) throw new Error('halfway failed')
    at(HALFWAY + 30_000)
    const final = await gradeDaily(deps, user, 'final', otherCells)
    if (final.ok !== true) throw new Error('final failed')
    expect(halfway.grade.total).toBe(1000)
    expect(final.grade.total).toBeLessThan(1000)
    // Score = the better (halfway), image = the latest canvas (the final one).
    expect(final.state).toMatchObject({ status: 'ended', best: 1000, lastCells: otherCells })
    expect((await deps.store.get(user.userId, day))).toMatchObject({
      endedAt: HALFWAY + 30_000,
      bestGrade: { cells },
      lastGrade: { cells: otherCells },
    })
  })

  it('refuses a second final and a peek once the attempt has ended', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 60_000)
    expect(await gradeDaily(deps, user, 'final', cells)).toMatchObject({ ok: true, state: { status: 'ended' } })
    expect(await gradeDaily(deps, user, 'final', otherCells)).toMatchObject({ ok: false, reason: 'ended' })
    expect(await peekDaily(deps, user, cells)).toMatchObject({ ok: false, reason: 'ended' })
    expect(deps.judge.blind).toHaveBeenCalledTimes(1)
  })

  it('ends an ungraded attempt early with its canvas and a zero score', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 30_000)
    expect(await endDaily(deps, user, cells)).toMatchObject({ status: 'ended', lastCells: cells, best: 0 })
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ ended: 1, score: 0 })
    expect(deps.judge.blind).not.toHaveBeenCalled()
  })

  it('enforces the time limits and allows the final through the grace window', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(FINAL + 1)
    expect(await gradeDaily(deps, user, 'auto', cells, day, 0)).toMatchObject({ ok: false, reason: 'time_up' })
    expect((await gradeDaily(deps, user, 'final', cells)).ok).toBe(true)
    at(FINAL + DAILY.graceMs + 1)
    expect(await gradeDaily(deps, user, 'final', otherCells)).toMatchObject({ ok: false, reason: 'ended', state: { status: 'ended' } })
  })

  it.each(['!', encodeCells(new Uint8Array(1023)), encodeCells(new Uint8Array(1024).fill(17))])('rejects invalid encoded grids before reserving (including 17)', async invalid => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(HALFWAY)
    expect(await gradeDaily(deps, user, 'auto', invalid)).toMatchObject({ ok: false, reason: 'bad_cells' })
    expect(deps.reserveBudget).not.toHaveBeenCalled()
    expect(deps.render).not.toHaveBeenCalled()
  })

  it('white paint is accepted', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(HALFWAY)
    const whiteCells = encodeCells(new Uint8Array(1024).fill(16))
    expect(await gradeDaily(deps, user, 'auto', whiteCells, day, 0)).toMatchObject({ ok: true, state: { lastCells: whiteCells } })
  })

  it('ends an ungraded attempt with its final cells and never restarts it', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(FINAL)
    expect(await endDaily(deps, user, cells)).toMatchObject({ status: 'ended', lastCells: cells })
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ ended: 1, score: 0 })
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ cells, score: 0, visibility: 'private' })
    expect((await startDaily(deps, user)).status).toBe('ended')
    expect(await gradeDaily(deps, user, 'final', cells)).toMatchObject({ ok: false, reason: 'ended' })
  })

  it('resumes the original attempt after midnight until it ends', async () => {
    const late = Date.UTC(2026, 10, 17, 23, 57)
    const { deps, records, at } = setup(late)
    await startDaily(deps, user)
    at(late + 150_000)
    expect(await gradeDaily(deps, user, 'auto', cells, day, 0)).toMatchObject({ ok: true, state: { day, status: 'playing' } })
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ day })
    expect(await dailyState(deps, user.userId)).toMatchObject({ day, status: 'playing' })
    at(late + 300_000)
    expect(await endDaily(deps, user, cells, day)).toMatchObject({ day, status: 'ended' })
    expect(await todaysDrawings(deps, user.userId)).toEqual({ ok: false })
  })

  it('denies drawings before ending and returns only today after ending', async () => {
    const { deps, records, at } = setup()
    expect(await todaysDrawings(deps, user.userId)).toEqual({ ok: false })
    await startDaily(deps, user)
    expect(await todaysDrawings(deps, user.userId)).toEqual({ ok: false })
    at(FINAL)
    await endDaily(deps, user, cells)
    await records.tools.create('dailyDrawings', { day: '2026-11-16', userId: 'old', cells: otherCells })
    for (let index = 0; index < 51; index++) await records.tools.create('dailyDrawings', { day, userId: `player-${index}`, cells })
    const result = await todaysDrawings(deps, user.userId)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('drawings denied')
    expect(result.drawings).toHaveLength(52)
    expect(result.drawings).not.toContainEqual(expect.objectContaining({ data: expect.objectContaining({ userId: 'old' }) }))
  })

  it('narrows today\'s drawings to one player on request, still gated on the caller having ended', async () => {
    const { deps, records, at } = setup()
    await records.tools.create('dailyDrawings', { day, userId: 'bob', cells: otherCells, score: 700 })
    await records.tools.create('dailyDrawings', { day, userId: 'carol', cells: otherCells, score: 800 })
    expect(await todaysDrawings(deps, user.userId, 'bob')).toEqual({ ok: false })
    await startDaily(deps, user)
    expect(await todaysDrawings(deps, user.userId, 'bob')).toEqual({ ok: false })
    at(FINAL)
    await endDaily(deps, user, cells)
    const bob = await todaysDrawings(deps, user.userId, 'bob')
    expect(bob.ok).toBe(true)
    if (!bob.ok) throw new Error('drawings denied')
    expect(bob.drawings).toHaveLength(1)
    expect(bob.drawings[0]).toMatchObject({ data: { userId: 'bob', score: 700 } })
    // The unfiltered call the leaderboard makes is unchanged: everyone's today.
    const all = await todaysDrawings(deps, user.userId)
    expect(all.ok && all.drawings).toHaveLength(3)
  })

  it('does not start an attempt implicitly when grading or ending', async () => {
    const { deps, records } = setup()
    expect(await gradeDaily(deps, user, 'auto', cells, day, 0)).toMatchObject({ ok: false, reason: 'not_started' })
    expect((await endDaily(deps, user, null)).status).toBe('not_started')
    expect(records.rows('dailyScores').size).toBe(0)
  })

  it('ignores stale successful completions after a replacement reservation', async () => {
    const { deps, records, at } = setup()
    let resolveBlind!: (value: { guess: string; text: boolean }) => void
    vi.mocked(deps.judge.blind).mockImplementationOnce(() => new Promise(resolve => { resolveBlind = resolve }))
    await startDaily(deps, user)
    at(HALFWAY)
    const pending = gradeDaily(deps, user, 'auto', cells, day, 0)
    await vi.waitFor(() => expect(deps.judge.blind).toHaveBeenCalledTimes(1))
    at(FINAL)
    const replacement = await gradeDaily(deps, user, 'final', otherCells)
    expect(replacement.ok).toBe(true)
    const saved = { ...onlyRow(records, 'dailyScores') }
    resolveBlind({ guess: 'stale', text: false })
    expect(await pending).toMatchObject({ ok: false, reason: 'stale' })
    expect(onlyRow(records, 'dailyScores')).toEqual(saved)
    expect(onlyRow(records, 'dailyDrawings').cells).toBe(otherCells)
    expect((await dailyState(deps, user.userId)).lastCells).toBe(otherCells)
  })

  it('saves the latest canvas while the attempt is active only', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 10_000)
    expect(await saveDailyCanvas(deps, user, cells)).toEqual({ ok: true })
    expect((await dailyState(deps, user.userId)).lastCells).toBe(cells)
    at(startedAt + 20_000)
    expect(await saveDailyCanvas(deps, user, otherCells)).toEqual({ ok: true })
    expect((await dailyState(deps, user.userId)).lastCells).toBe(otherCells)
    // Each save publishes, so a closed tab's latest canvas reaches the day's drawing record.
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ cells: otherCells, visibility: 'private' })
    at(FINAL)
    await endDaily(deps, user, null)
    expect(await saveDailyCanvas(deps, user, cells)).toEqual({ ok: false, reason: 'ended' })
    expect(await saveDailyCanvas(deps, user, 'bad')).toEqual({ ok: false, reason: 'bad_cells' })
  })

  it('caps silent peeks at two per attempt and never touches the score or grade hash', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(startedAt + 75_000)
    const first = await peekDaily(deps, user, cells)
    expect(first).toMatchObject({ ok: true })
    if (!first.ok) throw new Error('peek failed')
    expect(first.line.length).toBeGreaterThan(0)
    expect(await deps.store.get(user.userId, day)).toMatchObject({ peeksUsed: 1, bestScore: 0, lastGradedHash: null, inFlightSince: null })
    at(startedAt + 225_000)
    expect((await peekDaily(deps, user, cells)).ok).toBe(true)
    at(startedAt + 226_000)
    expect(await peekDaily(deps, user, cells)).toEqual({ ok: false, reason: 'no_peeks_left' })
    expect((await dailyState(deps, user.userId)).best).toBe(0)
    expect(deps.judge.score).not.toHaveBeenCalled()
    expect(deps.judge.blind).not.toHaveBeenCalled()
  })

  it('a peek respects the global budget gate and falls back instead of scoring', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    vi.mocked(deps.reserveBudget).mockResolvedValueOnce(false)
    at(startedAt + 75_000)
    expect(await peekDaily(deps, user, cells)).toEqual({ ok: false, reason: 'judge_resting' })
    expect(deps.judge.peek).not.toHaveBeenCalled()
    // A look that never produced a line gives the peek back.
    expect(await deps.store.get(user.userId, day)).toMatchObject({ peeksUsed: 0 })
    vi.mocked(deps.judge.peek!).mockRejectedValueOnce(new Error('judge down'))
    expect(await peekDaily(deps, user, cells)).toEqual({ ok: false, reason: 'judge_resting' })
    expect(await deps.store.get(user.userId, day)).toMatchObject({ peeksUsed: 0 })
  })

  it('rejects a peek after the attempt ended and on invalid cells', async () => {
    const { deps, at } = setup()
    await startDaily(deps, user)
    at(FINAL)
    await endDaily(deps, user, cells)
    expect(await peekDaily(deps, user, cells)).toEqual({ ok: false, reason: 'ended' })
    expect(await peekDaily(deps, user, 'bad')).toEqual({ ok: false, reason: 'bad_cells' })
  })
})

describe('daily blank-canvas guard', () => {
  const blank = () => encodeCells(new Uint8Array(1024))

  it('a blank final earns zero and still ends the attempt without the judge', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(FINAL)
    const result = await gradeDaily(deps, user, 'final', blank())
    expect(result).toMatchObject({ ok: true, grade: { guess: '', reason: 'Nothing is drawn yet — paint something first.', ...blankGradeParts() } })
    expect(deps.judge.blind).not.toHaveBeenCalled()
    expect(deps.judge.score).not.toHaveBeenCalled()
    expect(deps.reserveBudget).not.toHaveBeenCalled()
    expect(result.ok && result.state.status).toBe('ended')
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ score: 0, qualityBonus: 0, ended: 1 })
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ score: 0 })
  })

  it('a blank final never overwrites a prior non-zero best, but the latest image is blank', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(HALFWAY)
    await gradeDaily(deps, user, 'auto', cells, day, 0)
    const prior = (await deps.store.get(user.userId, day))!.bestScore
    expect(prior).toBeGreaterThan(0)
    at(FINAL)
    const result = await gradeDaily(deps, user, 'final', blank())
    expect(result).toMatchObject({ ok: true, grade: { total: 0 } })
    expect(onlyRow(records, 'dailyScores')).toMatchObject({ score: prior })
    expect(onlyRow(records, 'dailyDrawings')).toMatchObject({ cells: blank(), score: prior })
  })

  it('blank grading before the attempt started reports not_started', async () => {
    const { deps } = setup()
    expect(await gradeDaily(deps, user, 'final', blank())).toMatchObject({ ok: false, reason: 'not_started' })
    expect(deps.judge.blind).not.toHaveBeenCalled()
    expect(deps.reserveBudget).not.toHaveBeenCalled()
  })

  it('a blank final after the attempt ended reports ended, not a grade', async () => {
    const { deps, records, at } = setup()
    await startDaily(deps, user)
    at(FINAL)
    expect((await endDaily(deps, user, null)).status).toBe('ended')
    const saved = { ...onlyRow(records, 'dailyScores') }
    expect(await gradeDaily(deps, user, 'final', blank())).toMatchObject({ ok: false, reason: 'ended', state: { status: 'ended' } })
    expect(deps.judge.blind).not.toHaveBeenCalled()
    expect(deps.judge.score).not.toHaveBeenCalled()
    expect(deps.reserveBudget).not.toHaveBeenCalled()
    expect(onlyRow(records, 'dailyScores')).toEqual(saved)
  })
})
