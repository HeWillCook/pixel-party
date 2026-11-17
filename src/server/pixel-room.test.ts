import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUDGET, JUDGE } from '../game/config'
import { newRoomState, serializeRoomState } from '../game/room-logic'
import type { RoomState } from '../game/room-logic'
import type { Env } from '../../worker.js'
import { PixelRoom, nextCommandRejection, restorePixelState } from './pixel-room'
import { BudgetRoom } from './budget-room'
import { BaseRoom } from 'deepspace/worker'

import { memoryTools } from './room-test-tools'
const { integration, recordTools } = vi.hoisted(() => ({ integration: vi.fn(), recordTools: vi.fn() }))
vi.mock('./server-tools', () => ({ createServerTools: () => ({ ...recordTools(), integration }) }))

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
  it('denies unknown-host custom rooms and always denies next on the default board', () => {
    expect(nextCommandRejection(state, 'owner')).toBe('not_host')
    expect(nextCommandRejection({ ...state, isDefaultBoard: true }, 'owner')).toBe('not_host')
    expect(nextCommandRejection({ ...state, isDefaultBoard: true }, 'owner', 'owner')).toBe('not_host')
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
  tick() { return this.onAlarm() }
  command(connection: WebSocket, command: Record<string, unknown>) { return this.onMessage(connection, connection.deserializeAttachment(), { type: 'test', ...command }) }
  override onRoundEnded = vi.fn(async () => {})
  override onRoomStatus = vi.fn(async () => {})
  writeRound(event: import('../game/room-logic').RoundEndedEvent) { return super.onRoundEnded(event) }
  writeStatus(event: import('../game/room-logic').RoomStatusEvent) { return super.onRoomStatus(event) }
}

function roomHarness(isDefaultBoard = false, configure: (state: RoomState) => RoomState = state => state) {
  const database = new DatabaseSync(':memory:')
  const sockets: WebSocket[] = []
  const durable = durableState(database, sockets)
  const env = { BUDGET_ROOMS: { idFromName: vi.fn(() => 'global'), get: () => ({ fetch: reserve }) } } as unknown as Env
  const initial = configure(newRoomState({ ...init, isDefaultBoard }, Date.now(), () => 0))
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

  it('persists the trusted host header and enforces it after wake', async () => {
    const database = new DatabaseSync(':memory:')
    const sockets: WebSocket[] = []
    const durable = durableState(database, sockets)
    const env = {} as Env
    vi.spyOn(BaseRoom.prototype, 'fetch').mockResolvedValue(new Response('upgraded'))
    const room = new TestPixelRoom(durable as unknown as DurableObjectState, env)
    expect((await room.fetch(new Request('https://room/ws', { headers: {
      Upgrade: 'websocket', 'X-Room-Id': 'test', 'X-Room-Mode': 'coop', 'X-Room-Default': 'false', 'X-Room-Host': 'host',
    } }))).status).toBe(200)
    expect(database.prepare('SELECT host_id FROM pixel_state').get()).toMatchObject({ host_id: 'host' })
    const restored = new TestPixelRoom(durable as unknown as DurableObjectState, env)
    const guest = socket('guest')
    const host = socket('host')
    sockets.push(guest.connection, host.connection)
    await restored.connect(guest.connection)
    await restored.command(guest.connection, { t: 'next' })
    expect(messages(guest).at(-1)).toEqual({ t: 'reject', reason: 'not_host' })
    await restored.command(host.connection, { t: 'next' })
    expect((JSON.parse((database.prepare('SELECT state FROM pixel_state').get() as { state: string }).state) as RoomState).roundCounter).toBe(1)
    database.close()
  })

  it('refreshes record player counts on joins/leaves and round ids on next', async () => {
    const harness = roomHarness()
    harness.database.prepare('UPDATE pixel_state SET host_id = ?').run('host')
    const restored = harness.makeRoom()
    const host = await harness.connect('host', restored)
    const guest = await harness.connect('guest', restored)
    expect(restored.onRoomStatus).toHaveBeenLastCalledWith(expect.objectContaining({ playerCount: 2, currentRoundId: harness.initial.round.id }))
    await restored.command(host.connection, { t: 'next' })
    expect(restored.onRoomStatus).toHaveBeenLastCalledWith(expect.objectContaining({ playerCount: 2, currentRoundId: harness.saved().round.id }))
    await restored.disconnect(guest.connection)
    expect(restored.onRoomStatus).toHaveBeenLastCalledWith(expect.objectContaining({ playerCount: 1, status: 'playing' }))
    harness.database.close()
  })

  it('writes complete private round history and awards only won contributors', async () => {
    const memory = memoryTools()
    recordTools.mockReturnValue(memory.tools)
    memory.rows('rooms').set('test', { hostId: 'host', visibility: 'private', memberIds: ['host', 'guest'] })
    memory.rows('scores').set('host', { userId: 'host', totalPoints: 10, roundsWon: 2 })
    const harness = roomHarness()
    const event = { roomId: 'test', roundId: 'round1', mode: 'coop' as const, word: 'cat', startedAt: 100, endedAt: 200, outcome: 'won' as const, score: 50, pixelsUsed: 12, durationMs: 100, contributorIds: ['host', 'guest'], finalGuesses: ['cat'] }
    await harness.room.writeRound(event)
    expect([...memory.rows('rounds').values()][0]).toMatchObject({ ...event, visibility: 'private', memberIds: ['host', 'guest'], snapshotFileIds: [] })
    expect(memory.rows('scores').get('host')).toMatchObject({ totalPoints: 60, roundsWon: 3 })
    expect(memory.rows('scores').get('guest')).toMatchObject({ totalPoints: 50, roundsWon: 1 })
    await harness.room.writeRound({ ...event, roundId: 'round2', outcome: 'timeout' })
    expect(memory.rows('scores').get('host')!.roundsWon).toBe(3)
    const status = { roomId: 'test', status: 'paused' as const, playerCount: 0, lastActiveAt: 300, currentRoundId: 'round2' }
    await harness.room.writeStatus(status)
    expect(memory.rows('rooms').get('test')).toMatchObject({ status: 'paused', playerCount: 0, lastActiveAt: 300, currentRoundId: 'round2' })
    expect(memory.update).toHaveBeenCalledWith('rooms', 'test', { status: 'paused', playerCount: 0, lastActiveAt: 300, currentRoundId: 'round2' })
    harness.database.close()
  })

  it('surfaces tool failure to the existing caught hook boundary, without resetting scores', async () => {
    const memory = memoryTools()
    recordTools.mockReturnValue(memory.tools)
    memory.update.mockResolvedValueOnce({ success: false, error: 'offline' } as never)
    const harness = roomHarness()
    await expect(harness.room.writeStatus({ roomId: 'test', status: 'closed', playerCount: 0, lastActiveAt: 300, currentRoundId: 'round' })).rejects.toThrow()
    harness.database.close()
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

  it.each(['judged', 'unmatched', 'failed', 'refused', 'reserve-error'])(
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
        return kind === 'failed' ? { success: false } : { success: true, data: { content: [{ type: 'text', text: JSON.stringify({ guesses: [kind === 'unmatched' ? 'sun' : 'house', 'home', 'cabin'], confidence: 0.9 }) }] } }
      })
      const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
      await harness.room.webSocketMessage(owner.connection, '{"t":"ask"}')
      expect(reserve).toHaveBeenCalledOnce()
      expect(harness.saved()).toMatchObject({ lastJudgedAt: Date.now(), judgeInFlight: false, round: { askAvailableAt: Date.now() + JUDGE.askMinMs } })
      expect(messages(owner).filter(message => message.t === 'round').at(-1)?.round.askAvailableAt).toBe(Date.now() + JUDGE.askMinMs)
      if (kind === 'refused' || kind === 'reserve-error') {
        expect(integration).not.toHaveBeenCalled()
        expect(harness.saved().judgeCalls).toEqual([])
        expect(messages(owner)).toContainEqual({ t: 'ai_resting' })
        const fresh = await harness.connect('anon-fresh', harness.makeRoom())
        expect(messages(fresh).find(message => message.t === 'snapshot').aiResting).toBe(true)
      } else {
        expect(integration).toHaveBeenCalledWith('anthropic/chat-completion', expect.objectContaining({ model: JUDGE.model }))
        expect(harness.saved().lastJudgedVersion).toBe(kind === 'failed' ? 0 : 1)
        expect(log).toHaveBeenCalledTimes(kind === 'failed' ? 1 : 0)
      }
      harness.database.close()
    },
  )

  it.each(['reserve', 'integration'])('bounds a never-resolving %s, persists the outcome and releases the live guard', async upstream => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(1_800_000_000_000)
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    await harness.room.command(owner.connection, { t: 'place', x: 2, y: 2, c: 6 })
    vi.setSystemTime(Date.now() + JUDGE.askMinMs)
    reserve.mockImplementation(async () => Response.json({ ok: true }))
    integration.mockResolvedValue({ success: true, data: { content: [{ type: 'text', text: '{"guesses":["sun"],"confidence":0.9}' }] } })
    let started!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    const never = () => { started(); return new Promise<never>(() => {}) }
    if (upstream === 'reserve') reserve.mockImplementation(never)
    else integration.mockImplementation(never)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let finished = false
    const pending = harness.room.command(owner.connection, { t: 'ask' }).then(() => { finished = true })
    await entered
    const deadline = upstream === 'reserve' ? 5000 : 20000
    await vi.advanceTimersByTimeAsync(deadline - 1)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(finished).toBe(true)
    if (!finished) return
    await pending
    expect(harness.saved()).toMatchObject({ judgeInFlight: false, lastJudgedVersion: 0 })
    if (upstream === 'reserve') {
      expect(harness.saved().judgeCalls).toHaveLength(0)
      expect(messages(owner)).toContainEqual({ t: 'ai_resting' })
      expect(integration).not.toHaveBeenCalled()
    } else expect(harness.saved().judgeCalls).toHaveLength(1)
    reserve.mockImplementation(async () => Response.json({ ok: true }))
    integration.mockResolvedValue({ success: true, data: { content: [{ type: 'text', text: '{"guesses":["sun"],"confidence":0.9}' }] } })
    await vi.advanceTimersByTimeAsync(JUDGE.askMinMs)
    await harness.room.command(owner.connection, { t: 'ask' })
    expect(messages(owner)).toContainEqual({ t: 'judgement', zone: 'all', guesses: ['sun'], confidence: 0.9, matched: false })
    expect(vi.getTimerCount()).toBe(0)
    harness.database.close()
  })

  it('does not write SQLite for rejected placements or no-op command spam', async () => {
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    const spectator = await harness.connect('anon-spectator')
    const sql = vi.spyOn(harness.durable.storage.sql, 'exec')
    for (let index = 0; index < 3; index++) {
      await harness.room.command(spectator.connection, { t: 'place', x: 1, y: 1, c: 6 })
      await harness.room.command(owner.connection, { t: 'place', x: -1, y: 1, c: 6 })
      await harness.room.command(owner.connection, { t: 'team', team: 'red' })
      await harness.room.command(owner.connection, { t: 'ask' })
    }
    expect(messages(spectator).at(-1)).toEqual({ t: 'reject', reason: 'not_signed_in' })
    expect(sql.mock.calls.filter(([query]) => query.startsWith('INSERT'))).toHaveLength(0)
    harness.database.close()
  })

  it('contains throwing seams, broadcasts later events and re-arms the alarm', async () => {
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    const spectator = await harness.connect('anon-spectator')
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    harness.room.onRoomStatus.mockRejectedValue(new Error('private upstream detail'))
    spectator.send.mockClear()
    harness.durable.storage.setAlarm.mockClear()
    await expect(harness.room.disconnect(owner.connection)).resolves.toBeUndefined()
    expect(messages(spectator)).toEqual([
      { t: 'round', round: expect.objectContaining({ state: 'paused' }) },
      { t: 'players', count: 0 },
    ])
    expect(harness.durable.storage.setAlarm).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith('[PixelRoom] Room-status hook failed')
    harness.room.onRoomStatus.mockReset()
    await harness.connect('owner-again')
    harness.room.onRoundEnded.mockRejectedValue(new Error('private upstream detail'))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(harness.saved().round.endsAt!)
    await expect(harness.room.tick()).resolves.toBeUndefined()
    expect(messages(spectator).filter(message => message.t === 'round').at(-1).round.state).toBe('intermission')
    expect(log).toHaveBeenCalledWith('[PixelRoom] Round-ended hook failed')
    harness.database.close()
  })

  it.each(['connect', 'message', 'disconnect', 'alarm'])('still arms an alarm after %s persistence fails', async handler => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_800_000_000_000)
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    if (handler === 'connect') await harness.room.disconnect(owner.connection)
    if (handler === 'alarm') vi.setSystemTime(harness.saved().round.endsAt!)
    vi.spyOn(harness.durable.storage.sql, 'exec').mockImplementation(() => { throw new Error('storage failed') })
    harness.durable.storage.setAlarm.mockClear()
    const pending = handler === 'connect' ? harness.connect('new-owner')
      : handler === 'message' ? harness.room.command(owner.connection, { t: 'place', x: 1, y: 1, c: 6 })
      : handler === 'disconnect' ? harness.room.disconnect(owner.connection)
      : harness.room.tick()
    await expect(pending).rejects.toThrow('storage failed')
    expect(harness.durable.storage.setAlarm).toHaveBeenCalledOnce()
    harness.database.close()
  })

  it('logs an alarm re-arm failure once rather than failing a successful handler', async () => {
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
    harness.durable.storage.setAlarm.mockRejectedValue(new Error('private upstream detail'))
    await expect(harness.room.command(owner.connection, { t: 'team', team: 'red' })).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledExactlyOnceWith('[PixelRoom] Alarm scheduling failed')
    harness.database.close()
  })

  it('returns 410 before upgrading a persisted closed room', async () => {
    const harness = roomHarness(false, state => ({ ...state, status: 'closed', round: { ...state.round, state: 'paused' } }))
    const response = await harness.room.fetch(new Request('https://room/ws', { headers: { Upgrade: 'websocket' } }))
    expect(response.status).toBe(410)
    harness.database.close()
  })

  it.each(['pause', 'resume'])('sends the connecting snapshot before %s round broadcasts', async transition => {
    const harness = roomHarness()
    if (transition === 'resume') {
      const owner = await harness.connect('owner')
      await harness.room.disconnect(owner.connection)
    }
    const client = await harness.connect(transition === 'pause' ? 'anon-spectator' : 'owner-again')
    expect(messages(client)[0].t).toBe('snapshot')
    expect(messages(client).some(message => message.t === 'round')).toBe(true)
    harness.database.close()
  })

  it.each(['unchanged', 'too_soon', 'rate_cap', 'not_playing'])('always replies to a skipped ask: %s', async reason => {
    const harness = roomHarness(false, state => ({
      ...state,
      version: reason === 'unchanged' ? 0 : 1,
      lastJudgedAt: reason === 'rate_cap' ? Date.now() - JUDGE.askMinMs : Date.now(),
      judgeCalls: reason === 'rate_cap' ? Array.from({ length: JUDGE.maxPerMinute }, () => Date.now()) : [],
      status: reason === 'not_playing' ? 'intermission' : 'playing',
      intermissionEndsAt: reason === 'not_playing' ? Date.now() + 8000 : null,
      round: { ...state.round, state: reason === 'not_playing' ? 'intermission' : 'playing' },
    }))
    const owner = await harness.connect('owner')
    owner.send.mockClear()
    await harness.room.command(owner.connection, { t: 'ask' })
    const rejection = messages(owner).at(-1)
    const expected = reason === 'unchanged' ? 'canvas_unchanged' : reason === 'not_playing' ? 'round_inactive' : 'ask_too_soon'
    expect(rejection).toMatchObject({ t: 'reject', reason: expected })
    if (expected === 'ask_too_soon') expect(rejection.retryAt).toBeGreaterThanOrEqual(harness.initial.round.askAvailableAt)
    expect(reserve).not.toHaveBeenCalled()
    harness.database.close()
  })

  it('pauses and re-arms even if closing an already closed socket throws', async () => {
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    const spectator = await harness.connect('anon-spectator')
    vi.spyOn(owner.connection, 'close').mockImplementation(() => { throw new Error('already closed') })
    harness.durable.storage.setAlarm.mockClear()
    await expect(harness.room.disconnect(owner.connection)).resolves.toBeUndefined()
    expect(harness.saved().status).toBe('paused')
    expect(messages(spectator).at(-1)).toEqual({ t: 'players', count: 0 })
    expect(harness.durable.storage.setAlarm).toHaveBeenCalledOnce()
    harness.database.close()
  })

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
