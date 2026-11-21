import { asSchema, type ToolSet } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentToolContext, UserToolExecutor } from 'deepspace/worker'
import { DAILY } from '../game/config'
import { promptForDay } from '../game/daily/prompts'
import { memoryTools } from '../server/room-test-tools'
import type { Env } from '../../worker.js'
import { buildTools } from './tools'

type Query = ReturnType<typeof memoryTools>['tools']['query']

/** The SDK's record executor is one function; the fake forwards only reads. */
function executorFor(query: Query, onCall?: (name: string) => void): UserToolExecutor {
  return async (name, params) => {
    onCall?.(name)
    if (name !== 'records.query') throw new Error(`unexpected tool ${name}`)
    const { collection, ...options } = params as { collection: string } & Record<string, unknown>
    return query(collection, options as Parameters<Query>[1])
  }
}

function contextFor(userId = 'alice'): AgentToolContext<Env> {
  return {
    env: {} as Env,
    userId,
    request: new Request('https://pixel-party.test/_deepspace/agent/tools'),
  }
}

function setup(userId = 'alice') {
  const records = memoryTools()
  return { records, context: contextFor(userId), tools: buildTools(executorFor(records.tools.query), contextFor(userId)) }
}

async function run(tools: ToolSet, name: string, input: unknown): Promise<unknown> {
  const entry = tools[name] as unknown as { execute?: (input: unknown, options: unknown) => unknown }
  if (!entry?.execute) throw new Error(`tool ${name} has no implementation`)
  return entry.execute(input, {
    toolCallId: 'test-call',
    messages: [],
    abortSignal: new AbortController().signal,
  })
}

async function validate(tools: ToolSet, name: string, input: unknown) {
  const schema = asSchema(tools[name]!.inputSchema!)
  if (!schema.validate) throw new Error(`tool ${name} has no validator`)
  return schema.validate(input)
}

const day = '2026-11-17'
const nextDay = '2026-11-18'

function scoreRow(userId: string, rowDay: string, score: number, bestElapsedMs: number | null) {
  return {
    day: rowDay, userId, displayName: userId, avatarUrl: `${userId}.png`,
    score, fit: 0, recognition: 0, speed: 0, bestElapsedMs, ended: 0, medal: 0,
  }
}

function drawingRow(
  userId: string,
  rowDay: string,
  options: { score?: number; guess?: string; prompt?: string; visibility?: 'public' | 'private'; cells?: string } = {},
) {
  return {
    day: rowDay,
    userId,
    displayName: userId,
    prompt: options.prompt ?? 'a lighthouse in a storm',
    cells: options.cells ?? 'abc',
    guess: options.guess ?? '',
    reason: '',
    score: options.score ?? 0,
    visibility: options.visibility ?? 'public',
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('agent tools', () => {
  it('returns today\'s prompt and the player-visible DAILY timing', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T23:30:00Z'))
    const { tools } = setup()

    expect(await run(tools, 'today_prompt', {})).toEqual({
      day,
      prompt: promptForDay(day).prompt,
      attemptMinutes: 5,
      autoGradeMinutes: DAILY.autoWindowsMs.map(offset => offset / 60_000),
      manualGrades: DAILY.maxAsks,
    })
  })

  it('ranks the leaderboard like the Scores page: best row per player, score then fastest tie-break', async () => {
    const { records, tools } = setup()
    records.rows('dailyScores').set('alice-old', scoreRow('alice', day, 400, 50_000))
    records.rows('dailyScores').set('alice-best', scoreRow('alice', day, 900, 300_000))
    records.rows('dailyScores').set('bob', scoreRow('bob', day, 700, 200_000))
    records.rows('dailyScores').set('carol', scoreRow('carol', day, 700, 100_000))
    records.rows('dailyScores').set('dave', scoreRow('dave', day, 0, 10_000))
    records.rows('dailyScores').set('later', scoreRow('later', nextDay, 999, 1))
    // A zero score with a visible guess still appears, exactly as on the Scores page;
    // Dave has neither, so he is filtered out.
    records.rows('dailyDrawings').set('carol-drawing', drawingRow('carol', day, { guess: 'lighthouse' }))
    records.rows('dailyDrawings').set('later-drawing', drawingRow('later', nextDay, { guess: 'castle' }))

    expect(await run(tools, 'today_leaderboard', { day, limit: 10 })).toEqual({
      day,
      total: 3,
      returned: 3,
      entries: [
        { rank: 1, userId: 'alice', displayName: 'alice', score: 900 },
        { rank: 2, userId: 'carol', displayName: 'carol', score: 700 },
        { rank: 3, userId: 'bob', displayName: 'bob', score: 700 },
      ],
    })
  })

  it('defaults the leaderboard to today and clamps its limit to 1-50', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'))
    const { records, tools } = setup()
    for (let index = 0; index < 60; index++) {
      records.rows('dailyScores').set(`p${index}`, scoreRow(`p${index}`, day, 100 + index, index))
    }

    const today = await run(tools, 'today_leaderboard', {}) as { day: string; returned: number; entries: unknown[] }
    expect(today.day).toBe(day)
    expect(today.returned).toBe(10)

    const wide = await run(tools, 'today_leaderboard', { limit: 500 }) as { returned: number; entries: unknown[] }
    expect(wide.returned).toBe(50)
    expect(wide.entries).toHaveLength(50)

    const narrow = await run(tools, 'today_leaderboard', { limit: 0 }) as { returned: number; entries: unknown[] }
    expect(narrow.returned).toBe(1)
    expect(narrow.entries).toHaveLength(1)
  })

  it('rejects an impossible day and a non-numeric limit through the SDK schema', async () => {
    const { tools } = setup()
    await expect(validate(tools, 'today_leaderboard', { day: '2026-02-31' })).resolves.toMatchObject({ success: false })
    await expect(validate(tools, 'today_leaderboard', { day: '17-11-2026' })).resolves.toMatchObject({ success: false })
    await expect(validate(tools, 'today_leaderboard', { limit: 'ten' })).resolves.toMatchObject({ success: false })
    await expect(validate(tools, 'today_leaderboard', { day, limit: 10 })).resolves.toMatchObject({ success: true })
  })

  it('returns only a player\'s graded paintings, newest day first, without cells', async () => {
    const { records, tools } = setup('alice')
    records.rows('dailyDrawings').set('bob-private', drawingRow('bob', '2026-11-16', { visibility: 'private', score: 500 }))
    records.rows('dailyDrawings').set('bob-public', drawingRow('bob', '2026-11-15', { score: 400, guess: 'a fox' }))
    records.rows('dailyDrawings').set('bob-blank', drawingRow('bob', '2026-11-14', { cells: '' }))
    records.rows('dailyDrawings').set('bob-zero', drawingRow('bob', '2026-11-13', { score: 0 }))

    expect(await run(tools, 'player_gallery', { userId: 'bob' })).toEqual({
      userId: 'bob',
      total: 1,
      returned: 1,
      paintings: [{ day: '2026-11-15', prompt: 'a lighthouse in a storm', score: 400, guess: 'a fox' }],
    })

    // The caller may see their own private row, but not someone else's.
    records.rows('dailyDrawings').set('alice-private', drawingRow('alice', '2026-11-16', { visibility: 'private', score: 300 }))
    const own = await run(tools, 'player_gallery', { userId: 'alice' }) as { paintings: { day: string }[] }
    expect(own.paintings.map(painting => painting.day)).toEqual(['2026-11-16'])
  })

  it('keeps one painting per day and clamps the gallery to 1-50', async () => {
    const { records, tools } = setup('alice')
    for (let index = 0; index < 60; index++) {
      const paintingDay = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
      records.rows('dailyDrawings').set(`low-${index}`, drawingRow('alice', paintingDay, { score: 100 }))
      records.rows('dailyDrawings').set(`high-${index}`, drawingRow('alice', paintingDay, { score: 200 }))
    }

    const wide = await run(tools, 'player_gallery', { userId: 'alice', limit: 500 }) as { total: number; returned: number; paintings: { score: number }[] }
    expect(wide.total).toBe(60)
    expect(wide.returned).toBe(50)
    expect(wide.paintings.every(painting => painting.score === 200)).toBe(true)

    const narrow = await run(tools, 'player_gallery', { userId: 'alice', limit: 0 }) as { returned: number }
    expect(narrow.returned).toBe(1)
  })

  it('lists only live public lobby rooms, newest activity first', async () => {
    const { records, tools } = setup()
    records.rows('rooms').set('public', {
      name: 'Painting party', joinCode: 'ABCD', visibility: 'public', status: 'lobby',
      playerCount: 3, lastActiveAt: 100, isDefaultBoard: 0,
    })
    records.rows('rooms').set('busy', {
      name: 'Busy room', joinCode: 'EFGH', visibility: 'public', status: 'playing',
      playerCount: 5, lastActiveAt: 200, isDefaultBoard: 0,
    })
    records.rows('rooms').set('private', {
      name: 'Secret room', joinCode: 'IJKL', visibility: 'private', status: 'lobby',
      playerCount: 2, lastActiveAt: 300, isDefaultBoard: 0,
    })
    records.rows('rooms').set('closed', {
      name: 'Packed up', joinCode: 'MNOP', visibility: 'public', status: 'closed',
      playerCount: 0, lastActiveAt: 400, isDefaultBoard: 0,
    })
    records.rows('rooms').set('default', {
      name: 'Porch board', joinCode: 'PLAY', visibility: 'public', status: 'lobby',
      playerCount: 0, lastActiveAt: 500, isDefaultBoard: 1,
    })

    expect(await run(tools, 'live_rooms', {})).toEqual({
      returned: 2,
      rooms: [
        { code: 'EFGH', name: 'Busy room', playerCount: 5, status: 'playing' },
        { code: 'ABCD', name: 'Painting party', playerCount: 3, status: 'lobby' },
      ],
    })
  })

  it('never calls anything but records.query', async () => {
    const records = memoryTools()
    const calls: string[] = []
    const tools = buildTools(executorFor(records.tools.query, name => calls.push(name)), contextFor())
    await run(tools, 'today_prompt', {})
    await run(tools, 'live_rooms', {})
    expect(calls.every(name => name === 'records.query')).toBe(true)
  })
})
