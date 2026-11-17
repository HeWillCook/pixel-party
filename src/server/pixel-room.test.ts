import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUDGET, JUDGE } from '../game/config'
import { newRoomState, serializeRoomState } from '../game/room-logic'
import type { RoomState } from '../game/room-logic'
import type { Env } from '../../worker.js'
import { PixelRoom, nextCommandRejection, restorePixelState } from './pixel-room'
import { BudgetRoom } from './budget-room'

const { integration } = vi.hoisted(() => ({ integration: vi.fn() }))
vi.mock('./server-tools', () => ({ createServerTools: () => ({ integration }) }))

const init = { roomId: 'test', mode: 'coop' as const, isDefaultBoard: false }
type TestDatabase = {
  exec(query: string): void
  prepare(query: string): {
    all(...values: (string | number | null)[]): unknown[]
    get(): unknown
    run(...values: (string | number | null)[]): void
  }
  close(): void
}
const sqliteModule = 'node:sqlite'
const { DatabaseSync } = await import(sqliteModule) as { DatabaseSync: new (filename: string) => TestDatabase }

describe('PixelRoom persistence recovery', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('defaults later fields while retaining the saved round, pixels and cooldowns', () => {
    const state = newRoomState(init, 100, () => 0)
    state.grid.cells[2] = 6
    state.grid.placedBy[2] = 'owner'
    state.lastPlacedAt.owner = 400
    const saved = JSON.parse(serializeRoomState(state))
    delete saved.lastGuesses
    delete saved.recentWords
    delete saved.roundCounter
    saved.judgeInFlight = true
    const restored = restorePixelState(JSON.stringify(saved), init, 900, () => 0.5)
    expect(restored.round).toEqual(state.round)
    expect(restored.grid.cells[2]).toBe(6)
    expect(restored.grid.placedBy[2]).toBe('owner')
    expect(restored.lastPlacedAt.owner).toBe(400)
    expect(restored.lastGuesses).toEqual([])
    expect(restored.recentWords).toEqual([state.wordEntry.word])
    expect(restored.roundCounter).toBe(0)
    expect(restored.judgeInFlight).toBe(false)
  })

  it.each(['not json', '{}', '{"grid":{"cells":"!"}}', '{"round":null}'])(
    'replaces a corrupt row without crashing: %s', (saved) => {
      const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(restorePixelState(saved, init, 900, () => 0)).toEqual(newRoomState(init, 900, () => 0))
      expect(log).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects structurally invalid state even when its grid can decode', () => {
    const saved = JSON.parse(serializeRoomState(newRoomState(init, 100, () => 0)))
    saved.round.startedAt = 'invalid'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(restorePixelState(JSON.stringify(saved), init, 900, () => 0).round.startedAt).toBe(900)
  })
})

describe('temporary next authorization seam', () => {
  const state = newRoomState(init, 100, () => 0)
  it('normalizes SDK anonymous identities before authorizing', () => {
    expect(nextCommandRejection(state, null)).toBe('not_signed_in')
    expect(nextCommandRejection(state, 'anon-socket')).toBe('not_signed_in')
  })
  it('allows unknown-host custom rooms, but never the default board', () => {
    expect(nextCommandRejection(state, 'owner')).toBeNull()
    expect(nextCommandRejection({ ...state, isDefaultBoard: true }, 'owner')).toBe('not_host')
    expect(nextCommandRejection(state, 'other', 'owner')).toBe('not_host')
    expect(nextCommandRejection(state, 'owner', 'owner')).toBeNull()
  })
})

function durableState(database: TestDatabase, sockets: WebSocket[] = []) {
  vi.stubGlobal('WebSocketRequestResponsePair', class {})
  return {
    storage: {
      sql: { exec: (query: string, ...values: (string | number | null)[]) => {
        const rows = database.prepare(query).all(...values)
        return { toArray: () => rows }
      } },
      setAlarm: vi.fn(async () => {}), deleteAlarm: vi.fn(async () => {}),
      transactionSync: <Value>(callback: () => Value): Value => {
        database.exec('BEGIN')
        try {
          const result = callback()
          database.exec('COMMIT')
          return result
        } catch (error) {
          database.exec('ROLLBACK')
          throw error
        }
      },
    },
    getWebSockets: () => sockets,
    setWebSocketAutoResponse: vi.fn(),
    blockConcurrencyWhile: async (callback: () => Promise<unknown>) => callback(),
  }
}

function socket(userId: string) {
  let attachment = { userId, userName: 'Test', userEmail: '' }
  const connection = {
    readyState: WebSocket.OPEN as number,
    send: vi.fn(),
    close: vi.fn(() => { connection.readyState = WebSocket.CLOSED }),
    serializeAttachment: vi.fn(value => { attachment = value }),
    deserializeAttachment: () => attachment,
  }
  return { connection: connection as unknown as WebSocket, send: connection.send, user: attachment }
}

class TestPixelRoom extends PixelRoom {
  connect(connection: WebSocket) { return this.onConnect(connection, connection.deserializeAttachment()) }
  disconnect(connection: WebSocket) { return this.onDisconnect(connection) }
}

function roomHarness(isDefaultBoard = false) {
  const database = new DatabaseSync(':memory:')
  const sockets: WebSocket[] = []
  const durable = durableState(database, sockets)
  const env = { BUDGET_ROOMS: { idFromName: vi.fn(() => 'global'), get: () => ({ fetch: reserve }) } } as unknown as Env
  const initial = newRoomState({ ...init, isDefaultBoard }, Date.now(), () => 0)
  database.exec('CREATE TABLE pixel_state (id INTEGER PRIMARY KEY, room_id TEXT, mode TEXT, is_default INTEGER, state TEXT, resting_day TEXT)')
  database.prepare('INSERT INTO pixel_state VALUES (1, ?, ?, ?, ?, NULL)').run(init.roomId, init.mode, Number(isDefaultBoard), serializeRoomState(initial))
  const makeRoom = () => new TestPixelRoom(durable as unknown as DurableObjectState, env)
  const room = makeRoom()
  const saved = () => JSON.parse((database.prepare('SELECT state FROM pixel_state').get() as { state: string }).state) as RoomState
  const connect = async (userId: string, target = room) => {
    const client = socket(userId)
    sockets.push(client.connection)
    await target.connect(client.connection)
    return client
  }
  return { database, durable, env, initial, makeRoom, room, saved, connect }
}

const reserve = vi.fn()
const messages = (client: ReturnType<typeof socket>) => client.send.mock.calls.map(([message]) => JSON.parse(message))

describe('durable room boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    integration.mockReset()
    reserve.mockReset()
  })

  it('broadcasts placements, rejects spectators and cooldowns, and recovers live identities after wake', async () => {
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    const tab = await harness.connect('owner')
    const spectator = await harness.connect('anon-spectator')
    expect(messages(spectator).find(message => message.t === 'snapshot')).toMatchObject({ players: 1, you: { userId: null } })
    await harness.room.webSocketMessage(owner.connection, JSON.stringify({ t: 'place', x: 3, y: 2, c: 6 }))
    for (const client of [owner, tab, spectator]) expect(messages(client)).toContainEqual({ t: 'pixel', x: 3, y: 2, c: 6, by: 'owner' })
    await harness.room.webSocketMessage(owner.connection, JSON.stringify({ t: 'place', x: 4, y: 2, c: 6 }))
    expect(messages(owner).at(-1)).toMatchObject({ t: 'reject', reason: 'cooldown' })
    for (const command of [{ t: 'place', x: 0, y: 0, c: 1 }, { t: 'ask' }, { t: 'next' }, { t: 'team', team: 'red' }]) {
      await harness.room.webSocketMessage(spectator.connection, JSON.stringify(command))
      expect(messages(spectator).at(-1)).toEqual({ t: 'reject', reason: 'not_signed_in' })
    }
    await harness.room.webSocketMessage(owner.connection, `${' '.repeat(257)}{"t":"next"}`)
    expect(harness.saved().version).toBe(1)
    const restarted = harness.makeRoom()
    const fresh = await harness.connect('anon-fresh', restarted)
    expect(messages(fresh).find(message => message.t === 'snapshot')).toMatchObject({ players: 1, cells: expect.any(String), round: { id: harness.initial.round.id } })
    expect(harness.saved().grid.placedBy[67]).toBe('owner')
    harness.database.close()
  })

  it('pauses the default board when its last signed-in socket closes even with spectators', async () => {
    const harness = roomHarness(true)
    const owner = await harness.connect('owner')
    await harness.connect('anon-spectator')
    await harness.room.disconnect(owner.connection)
    expect(harness.saved()).toMatchObject({ status: 'paused', round: { state: 'paused' }, judgeInFlight: false })
    expect(harness.durable.storage.deleteAlarm).toHaveBeenCalled()
    const fresh = await harness.connect('anon-fresh', harness.makeRoom())
    expect(messages(fresh).find(message => message.t === 'snapshot')).toMatchObject({ players: 0, round: { state: 'paused' } })
    harness.database.close()
  })

  it.each(['judged', 'failed', 'refused', 'reserve-error'])(
    'persists every judge outcome and reserves through the global stub: %s', async kind => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(1_800_000_000_000)
      const harness = roomHarness()
      const owner = await harness.connect('owner')
      await harness.room.webSocketMessage(owner.connection, '{"t":"place","x":2,"y":2,"c":6}')
      vi.setSystemTime(Date.now() + JUDGE.askMinMs)
      if (kind === 'reserve-error') reserve.mockRejectedValue(new Error('offline'))
      else reserve.mockImplementation(async () => Response.json({ ok: kind !== 'refused' }))
      integration.mockImplementation(async () => {
        expect(harness.saved()).toMatchObject({ judgeCalls: [Date.now()], lastJudgedAt: Date.now(), judgeInFlight: false })
        return kind === 'failed' ? { success: false } : { success: true, data: { content: [{ type: 'text', text: '{"guesses":["house","home","cabin"],"confidence":0.9}' }] } }
      })
      const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
      await harness.room.webSocketMessage(owner.connection, '{"t":"ask"}')
      expect(reserve).toHaveBeenCalledOnce()
      expect(harness.saved()).toMatchObject({ lastJudgedAt: Date.now(), judgeInFlight: false, round: { askAvailableAt: Date.now() + JUDGE.askMinMs } })
      if (kind === 'refused' || kind === 'reserve-error') {
        expect(integration).not.toHaveBeenCalled()
        expect(harness.saved().judgeCalls).toEqual([])
        expect(messages(owner)).toContainEqual({ t: 'ai_resting' })
        const fresh = await harness.connect('anon-fresh', harness.makeRoom())
        expect(messages(fresh).find(message => message.t === 'snapshot').aiResting).toBe(true)
      } else {
        expect(integration).toHaveBeenCalledWith('anthropic/chat-completion', expect.objectContaining({ model: JUDGE.model }))
        expect(harness.saved().lastJudgedVersion).toBe(kind === 'judged' ? 1 : 0)
        expect(log).toHaveBeenCalledTimes(kind === 'failed' ? 1 : 0)
      }
      harness.database.close()
    },
  )

  it('enforces the atomic budget cap, survives restarts and rolls over at UTC midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-16T23:59:59Z'))
    const database = new DatabaseSync(':memory:')
    const durable = durableState(database)
    const makeRoom = () => new BudgetRoom(durable as unknown as DurableObjectState, {} as Env)
    let room = makeRoom()
    const request = () => room.fetch(new Request('https://budget/reserve', { method: 'POST' })).then(response => response.json())
    database.prepare('INSERT INTO budget VALUES (?, ?)').run('2026-11-16', BUDGET.dailyCalls - 1)
    expect(await Promise.all([request(), request()])).toEqual([
      { ok: true, used: BUDGET.dailyCalls, cap: BUDGET.dailyCalls },
      { ok: false, used: BUDGET.dailyCalls, cap: BUDGET.dailyCalls },
    ])
    room = makeRoom()
    expect(await request()).toEqual({ ok: false, used: BUDGET.dailyCalls, cap: BUDGET.dailyCalls })
    vi.setSystemTime(new Date('2026-11-17T00:00:00Z'))
    expect(await request()).toEqual({ ok: true, used: 1, cap: BUDGET.dailyCalls })
    expect((await room.fetch(new Request('https://budget/reserve'))).status).toBe(404)
    database.close()
  })
})
