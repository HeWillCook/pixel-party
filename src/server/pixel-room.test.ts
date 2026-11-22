import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUDGET, JUDGE } from '../game/config'
import { decodeCells } from '../game/grid'
import { newRoomState, serializeRoomState } from '../game/room-logic'
import type { RoomState } from '../game/room-logic'
import type { Env } from '../../worker.js'
import { PixelRoom, nextCommandRejection, restorePixelState } from './pixel-room'
import { configuredJudgeMode } from './daily-judge'

vi.mock('./daily-judge', async importOriginal => {
  const original = await importOriginal<typeof import('./daily-judge')>()
  return { ...original, configuredJudgeMode: vi.fn(original.configuredJudgeMode) }
})
import { BudgetRoom } from './budget-room'
import { BaseRoom } from 'deepspace/worker'

import { memoryTools } from './room-test-tools'
const { integration, recordTools } = vi.hoisted(() => ({ integration: vi.fn(), recordTools: vi.fn() }))
vi.mock('./server-tools', () => ({ createServerTools: () => ({ ...recordTools(), integration }) }))

const init = { roomId: 'test', mode: 'coop' as const }
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

  it('defaults later fields while retaining the saved round, pixels and paint buckets', () => {
    const state = newRoomState(init, 100, () => 0)
    state.grid.cells[2] = 6
    state.grid.placedBy[2] = 'owner'
    state.paintBuckets.owner = { tokens: 12, updatedAt: 400 }
    state.round = { ...state.round, result: { outcome: 'won', contributorCount: 1 } }
    const saved = JSON.parse(serializeRoomState(state))
    delete saved.lastGuesses
    delete saved.paintBuckets
    delete saved.recentWords
    delete saved.roundCounter
    saved.judgeInFlight = true
    const restored = restorePixelState(JSON.stringify(saved), init, 900, () => 0.5)
    expect(restored.round).toEqual(state.round)
    expect(restored.grid.cells[2]).toBe(6)
    expect(restored.grid.placedBy[2]).toBe('owner')
    expect(restored.lastGuesses).toEqual([])
    expect(restored.paintBuckets).toEqual({})
    expect(restored.status).toBe('playing')
    expect(restored.recentWords).toEqual([state.wordEntry.word])
    expect(restored.roundCounter).toBe(0)
    expect(restored.judgeInFlight).toBe(false)
  })

  it('restores legacy intermissions without their auto-start deadline', () => {
    const state = newRoomState(init, 100, () => 0)
    state.status = 'intermission'
    state.round.state = 'intermission'
    state.intermissionEndsAt = 200
    expect(restorePixelState(serializeRoomState(state), init, 900, () => 0)).toMatchObject({
      status: 'intermission', intermissionEndsAt: null, round: state.round,
    })
  })

  it.each(['not json', '{}', '{"grid":{"cells":"!"}}', '{"round":null}'])(
    'replaces a corrupt row without crashing: %s', (saved) => {
      const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(restorePixelState(saved, init, 900, () => 0)).toEqual(newRoomState({ ...init, startsInLobby: true }, 900, () => 0))
      expect(log).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects structurally invalid state even when its grid can decode', () => {
    const saved = JSON.parse(serializeRoomState(newRoomState(init, 100, () => 0)))
    saved.round.startedAt = 'invalid'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(restorePixelState(JSON.stringify(saved), init, 900, () => 0).round.state).toBe('lobby')
  })
})

describe('next authorization seam', () => {
  const state = newRoomState(init, 100, () => 0)
  it('normalizes SDK anonymous identities before authorizing', () => {
    expect(nextCommandRejection(state, null)).toBe('not_signed_in')
    expect(nextCommandRejection(state, 'anon-socket')).toBe('not_signed_in')
  })
  it('denies unknown hosts and recovers when the host leaves', () => {
    const state = { ...newRoomState(init, 100, () => 0), status: 'intermission' as const }
    expect(nextCommandRejection(state, 'owner', null, ['owner'])).toBe('not_host')
    expect(nextCommandRejection(state, 'owner', 'owner', ['owner'])).toBeNull()
    expect(nextCommandRejection(state, 'other', 'owner', ['owner', 'other'])).toBe('not_host')
    expect(nextCommandRejection(state, 'owner', 'owner', ['owner'])).toBeNull()
    expect(nextCommandRejection(state, 'other', 'owner', ['other'])).toBeNull()
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

function socket(userId: string, spectate = false) {
  let attachment = spectate ? { userId, userName: 'Test', userEmail: '', spectate: true } : { userId, userName: 'Test', userEmail: '' }
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
  reserveForTest() { return (this as unknown as { reserveBudget(): Promise<{ ok: boolean }> }).reserveBudget() }
  flushForTest() { (this as unknown as { flushPaint(): void }).flushPaint() }
  connect(connection: WebSocket) { return this.onConnect(connection, connection.deserializeAttachment()) }
  disconnect(connection: WebSocket) { return this.onDisconnect(connection) }
  tick() { return this.onAlarm() }
  command(connection: WebSocket, command: Record<string, unknown>) { return this.onMessage(connection, connection.deserializeAttachment(), { type: 'test', ...command }) }
  override onRoundEnded = vi.fn(async () => {})
  override onRoomStatus = vi.fn(async () => {})
  writeRound(event: import('../game/room-logic').RoundEndedEvent) { return super.onRoundEnded(event) }
  writeStatus(event: import('../game/room-logic').RoomStatusEvent) { return super.onRoomStatus(event) }
}

function roomHarness(configure: (state: RoomState) => RoomState = state => state) {
  const database = new DatabaseSync(':memory:')
  const sockets: WebSocket[] = []
  const durable = durableState(database, sockets)
  const env = { BUDGET_ROOMS: { idFromName: vi.fn(() => 'global'), get: () => ({ fetch: reserve }) } } as unknown as Env
  const initial = configure(newRoomState(init, Date.now(), () => 0))
  database.exec('CREATE TABLE pixel_state (id INTEGER PRIMARY KEY, room_id TEXT, mode TEXT, is_default INTEGER, state TEXT, resting_day TEXT)')
  database.prepare('INSERT INTO pixel_state VALUES (1, ?, ?, 0, ?, NULL)').run(init.roomId, init.mode, serializeRoomState(initial))
  const makeRoom = () => new TestPixelRoom(durable as unknown as DurableObjectState, env)
  const room = makeRoom()
  const saved = () => {
    // Paint writes are coalesced; read what the room would persist, not a frame mid-window.
    room.flushForTest()
    return JSON.parse((database.prepare('SELECT state FROM pixel_state').get() as { state: string }).state) as RoomState
  }
  const connect = async (userId: string, target = room, spectate = false) => {
    const client = socket(userId, spectate)
    sockets.push(client.connection)
    await target.connect(client.connection)
    return client
  }
  return { database, durable, env, initial, makeRoom, room, saved, connect }
}

const reserve = vi.fn()
const messages = (client: ReturnType<typeof socket>) => client.send.mock.calls.map(([message]) => JSON.parse(message))

describe('durable room boundaries', () => {
  beforeEach(() => { vi.mocked(configuredJudgeMode).mockReturnValue('real') })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    integration.mockReset()
    reserve.mockReset()
  })

  it('I4 never calls a paid integration for party judging in normal dev fake mode', async () => {
    vi.mocked(configuredJudgeMode).mockReturnValue('fake')
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    vi.stubGlobal('__PIXLE_TEST__', false)
    const harness = roomHarness()
    try {
      const owner = await harness.connect('owner')
      await harness.room.webSocketMessage(owner.connection, '{"t":"place","x":2,"y":2,"c":6}')
      vi.setSystemTime(Date.now() + JUDGE.askMinMs)
      reserve.mockResolvedValue(Response.json({ ok: true }))
      integration.mockResolvedValue({ success: false })
      await harness.room.webSocketMessage(owner.connection, '{"t":"ask"}')
      expect(integration).not.toHaveBeenCalled()
    } finally {
      harness.database.close()
    }
  })

  it('never calls the judge for a paint-then-erase blank canvas and rejects the ask', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const harness = roomHarness()
    try {
      const owner = await harness.connect('owner')
      await harness.room.command(owner.connection, { t: 'place', cells: [{ x: 1, y: 1, c: 4 }] })
      await harness.room.command(owner.connection, { t: 'place', cells: [{ x: 1, y: 1, c: 0 }] })
      expect(decodeCells(harness.saved().grid.cells as unknown as string, 1024).every(cell => cell === 0)).toBe(true)
      vi.setSystemTime(Date.now() + JUDGE.askMinMs)
      owner.send.mockClear()
      await harness.room.command(owner.connection, { t: 'ask' })
      expect(messages(owner).at(-1)).toEqual({ t: 'reject', reason: 'canvas_blank' })
      expect(integration).not.toHaveBeenCalled()
      expect(reserve).not.toHaveBeenCalled()
    } finally {
      harness.database.close()
    }
  })

  it('persists the trusted host header and enforces it after wake', async () => {
    const database = new DatabaseSync(':memory:')
    const sockets: WebSocket[] = []
    const durable = durableState(database, sockets)
    const env = {} as Env
    vi.spyOn(BaseRoom.prototype, 'fetch').mockResolvedValue(new Response('upgraded'))
    const room = new TestPixelRoom(durable as unknown as DurableObjectState, env)
    expect((await room.fetch(new Request('https://room/ws', { headers: {
      Upgrade: 'websocket', 'X-Room-Id': 'test', 'X-Room-Mode': 'coop', 'X-Room-Default': 'false', 'X-Room-Host': 'host', 'X-Room-Lobby': 'true',
    } }))).status).toBe(200)
    expect((JSON.parse((database.prepare('SELECT state FROM pixel_state').get() as { state: string }).state) as RoomState).status).toBe('lobby')
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

  it('closes live sockets, persists a tombstone, deletes alarms and stops judge calls on host deletion', async () => {
    const harness = roomHarness()
    harness.database.prepare('UPDATE pixel_state SET host_id = ?').run('host')
    const room = harness.makeRoom()
    const host = await harness.connect('host', room)
    const guest = await harness.connect('guest', room)
    const request = (hostId: string) => new Request('https://pixel/close', { method: 'POST', headers: { 'X-Room-Id': 'test', 'X-Room-Host': hostId } })
    expect((await room.fetch(request('guest'))).status).toBe(403)
    expect(harness.saved().status).toBe('playing')
    expect((await room.fetch(request('host'))).status).toBe(204)
    expect(harness.saved().status).toBe('closed')
    for (const client of [host, guest]) {
      expect(messages(client).at(-1)).toEqual({ t: 'closed' })
      expect(client.connection.readyState).toBe(WebSocket.CLOSED)
    }
    expect(harness.durable.storage.deleteAlarm).toHaveBeenCalled()
    await room.tick()
    await room.command(host.connection, { t: 'next' })
    await room.command(host.connection, { t: 'ask' })
    expect(integration).not.toHaveBeenCalled()
    expect(reserve).not.toHaveBeenCalled()
    expect(harness.saved().status).toBe('closed')
    const restored = harness.makeRoom()
    expect((await restored.fetch(new Request('https://pixel/ws', { headers: { Upgrade: 'websocket' } }))).status).toBe(410)
    harness.database.close()
  })

  it('closes a room that has never opened a socket and remains closed after wake', async () => {
    const database = new DatabaseSync(':memory:')
    const durable = durableState(database)
    const room = new TestPixelRoom(durable as unknown as DurableObjectState, {} as Env)
    expect((await room.fetch(new Request('https://pixel/close', { method: 'POST', headers: {
      'X-Room-Id': 'test', 'X-Room-Mode': 'coop', 'X-Room-Default': 'false', 'X-Room-Host': 'host',
    } }))).status).toBe(204)
    const restored = new TestPixelRoom(durable as unknown as DurableObjectState, {} as Env)
    expect((await restored.fetch(new Request('https://pixel/ws', { headers: { Upgrade: 'websocket' } }))).status).toBe(410)
    database.close()
  })

  it('waits for earlier status writes before writing closed and ignores an in-flight judge result', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const harness = roomHarness()
    harness.database.prepare('UPDATE pixel_state SET host_id = ?').run('host')
    const room = harness.makeRoom()
    const host = await harness.connect('host', room)
    await room.command(host.connection, { t: 'place', x: 0, y: 0, c: 4 })
    vi.setSystemTime(Date.now() + JUDGE.askMinMs)
    reserve.mockResolvedValue(Response.json({ ok: true }))
    let releaseJudge!: (result: unknown) => void
    let called!: () => void
    const began = new Promise<void>(resolve => { called = resolve })
    integration.mockImplementation(() => { called(); return new Promise(resolve => { releaseJudge = resolve }) })
    const judging = room.command(host.connection, { t: 'ask' })
    await began
    let releaseStatus!: () => void
    let statusBegan!: () => void
    const writing = new Promise<void>(resolve => { statusBegan = resolve })
    room.onRoomStatus.mockImplementationOnce(async () => {
      statusBegan()
      await new Promise<void>(resolve => { releaseStatus = resolve })
    })
    const joining = harness.connect('guest', room)
    await writing
    const closing = room.fetch(new Request('https://pixel/close', { method: 'POST', headers: { 'X-Room-Id': 'test', 'X-Room-Host': 'host' } }))
    releaseStatus()
    await joining
    expect((await closing).status).toBe(204)
    releaseJudge({ success: true, data: { content: [{ type: 'text', text: '{"guesses":["house"],"confidence":0.9}' }] } })
    await judging
    expect(harness.saved().status).toBe('closed')
    expect(messages(host).at(-1)).toEqual({ t: 'closed' })
    expect(room.onRoundEnded).not.toHaveBeenCalled()
    expect(room.onRoomStatus).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'closed' }))
    expect(harness.durable.storage.deleteAlarm).toHaveBeenCalled()
    harness.database.close()
  })

  it('lets a connected guest start when the host is absent', async () => {
    const harness = roomHarness(state => ({ ...state, status: 'intermission', intermissionEndsAt: 1, round: { ...state.round, state: 'intermission' } }))
    harness.database.prepare('UPDATE pixel_state SET host_id = ?').run('host')
    const room = harness.makeRoom()
    const guest = await harness.connect('guest', room)
    await room.tick()
    expect(harness.saved().status).toBe('intermission')
    expect(harness.durable.storage.deleteAlarm).toHaveBeenCalled()
    await room.command(guest.connection, { t: 'next' })
    expect(harness.saved().status).toBe('playing')
    expect(harness.saved().roundCounter).toBe(1)
    harness.database.close()
  })

  it('batches solo cells into one durable write and keeps the abuse cap after wake', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    const tab = await harness.connect('owner')
    const sql = vi.spyOn(harness.durable.storage.sql, 'exec')
    const cells = Array.from({ length: 64 }, (_, i) => ({ x: i % 32, y: Math.floor(i / 32), c: 4 }))
    await harness.room.webSocketMessage(owner.connection, JSON.stringify({ t: 'place', cells }))
    expect(harness.saved().version).toBe(60)
    expect(sql.mock.calls.filter(([query]) => query.startsWith('INSERT'))).toHaveLength(1)
    expect(messages(owner).filter(message => message.reason === 'rate_limited')).toHaveLength(4)
    expect(messages(tab).filter(message => message.t === 'pixel')).toHaveLength(60)
    const restored = harness.makeRoom()
    await restored.command(tab.connection, { t: 'place', x: 5, y: 5, c: 6 })
    expect(messages(tab).at(-1)).toMatchObject({ t: 'reject', reason: 'rate_limited', x: 5, y: 5 })
    expect(harness.saved().version).toBe(60)
    harness.database.close()
  })

  it.each([1, 2])('keeps a private lobby inert and lets only its host start with %s players', async count => {
    const harness = roomHarness(() => newRoomState({ ...init, startsInLobby: true }, Date.now(), () => 0))
    harness.database.prepare('UPDATE pixel_state SET host_id = ?').run('host')
    const restored = harness.makeRoom()
    const host = await harness.connect('host', restored)
    const guest = count === 2 ? await harness.connect('guest', restored) : host
    const snapshot = messages(host).find(message => message.t === 'snapshot')
    expect(snapshot.round).toMatchObject({ state: 'lobby', word: '', endsAt: null })
    expect(snapshot.roster).toEqual([{ userId: 'host', name: 'Test' }])
    expect(harness.saved().status).toBe('lobby')
    if (count === 2) {
      await restored.command(guest.connection, { t: 'next' })
      expect(messages(guest).at(-1)).toEqual({ t: 'reject', reason: 'not_host' })
    }
    await restored.command(host.connection, { t: 'place', cells: [{ x: 0, y: 0, c: 4 }] })
    expect(messages(host).at(-1)).toMatchObject({ t: 'reject', reason: 'round_inactive' })
    await restored.command(host.connection, { t: 'ask' })
    await restored.tick()
    expect(integration).not.toHaveBeenCalled()
    expect(reserve).not.toHaveBeenCalled()
    expect(restored.onRoomStatus).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'lobby', playerCount: count }))
    await restored.command(host.connection, { t: 'next' })
    expect(harness.saved().status).toBe('playing')
    expect(restored.onRoomStatus).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'playing', playerCount: count }))
    const late = await harness.connect('late', restored)
    expect(messages(late).find(message => message.t === 'snapshot').round.state).toBe('playing')
    harness.database.close()
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

  it('writes complete private round history without touching a score collection', async () => {
    const memory = memoryTools()
    recordTools.mockReturnValue(memory.tools)
    memory.rows('rooms').set('test', { hostId: 'host', visibility: 'private', memberIds: ['host', 'guest'] })
    const harness = roomHarness()
    const event = { roomId: 'test', roundId: 'round1', mode: 'coop' as const, word: 'cat', startedAt: 100, endedAt: 200, outcome: 'won' as const, pixelsUsed: 12, durationMs: 100, contributorIds: ['host', 'guest'], finalGuesses: ['cat'] }
    await harness.room.writeRound(event)
    expect([...memory.rows('rounds').values()][0]).toMatchObject({ ...event, visibility: 'private', memberIds: ['host', 'guest'], snapshotFileIds: [] })
    await harness.room.writeRound({ ...event, roundId: 'round2', outcome: 'timeout' })
    expect([...memory.rows('rounds').values()]).toHaveLength(2)
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

  it('counts signed-out sockets as watchers in snapshot and players messages', async () => {
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    await harness.connect('owner')
    const spectator = await harness.connect('anon-spectator')
    expect(messages(owner).at(-1)).toMatchObject({ t: 'players', count: 1, watching: 1 })
    expect(messages(spectator).find(message => message.t === 'snapshot')).toMatchObject({ players: 1, watching: 1 })
    harness.database.close()
  })

  it('re-broadcasts players when a watcher leaves', async () => {
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    const tab = await harness.connect('owner')
    const spectator = await harness.connect('anon-spectator')
    await harness.room.disconnect(spectator.connection)
    for (const client of [owner, tab]) {
      expect(messages(client).at(-1)).toEqual({ t: 'players', count: 1, roster: [{ userId: 'owner', name: 'Test' }], watching: 0 })
    }
    harness.database.close()
  })

  it('broadcasts instant solo placements, rejects spectators, and recovers live identities after wake', async () => {
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    const tab = await harness.connect('owner')
    const spectator = await harness.connect('anon-spectator')
    expect(messages(spectator).find(message => message.t === 'snapshot')).toMatchObject({ players: 1, you: { userId: null } })
    await harness.room.webSocketMessage(owner.connection, JSON.stringify({ t: 'place', x: 3, y: 2, c: 6 }))
    for (const client of [owner, tab, spectator]) expect(messages(client)).toContainEqual({ t: 'pixel', x: 3, y: 2, c: 6, by: 'owner' })
    await harness.room.webSocketMessage(owner.connection, JSON.stringify({ t: 'place', x: 4, y: 2, c: 6 }))
    expect(messages(owner).at(-1)).toMatchObject({ t: 'pixel', x: 4, y: 2 })
    for (const command of [{ t: 'place', x: 0, y: 0, c: 1 }, { t: 'ask' }, { t: 'next' }, { t: 'team', team: 'red' }]) {
      await harness.room.webSocketMessage(spectator.connection, JSON.stringify(command))
      expect(messages(spectator).at(-1)).toMatchObject({ t: 'reject', reason: 'not_signed_in' })
    }
    await harness.room.webSocketMessage(owner.connection, `${' '.repeat(4097)}{"t":"next"}`)
    expect(harness.saved().version).toBe(2)
    const restarted = harness.makeRoom()
    const fresh = await harness.connect('anon-fresh', restarted)
    expect(messages(fresh).find(message => message.t === 'snapshot')).toMatchObject({ players: 1, cells: expect.any(String), round: { id: harness.initial.round.id } })
    expect(harness.saved().grid.placedBy[67]).toBe('owner')
    harness.database.close()
  })

  it('pauses when its last signed-in socket closes even with spectators', async () => {
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    await harness.connect('anon-spectator')
    await harness.room.disconnect(owner.connection)
    expect(harness.saved()).toMatchObject({ status: 'paused', round: { state: 'paused' }, judgeInFlight: false })
    expect(harness.durable.storage.setAlarm).toHaveBeenCalled()
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

  it('persists a cleared resting day immediately after a successful reserve', async () => {
    const harness = roomHarness()
    harness.database.prepare('UPDATE pixel_state SET resting_day = ?').run('2027-01-15')
    const wakingRoom = harness.makeRoom()
    reserve.mockResolvedValue(Response.json({ ok: true }))
    expect(await wakingRoom.reserveForTest()).toEqual({ ok: true })
    expect(harness.database.prepare('SELECT resting_day FROM pixel_state').get()).toMatchObject({ resting_day: null })
    harness.database.close()
  })

  it('catches persist errors during reserveBudget and yields resting instead of failed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_800_000_000_000)
    const harness = roomHarness()
    harness.database.prepare('UPDATE pixel_state SET resting_day = ?').run('2027-01-15')
    const wakingRoom = harness.makeRoom()
    const owner = await harness.connect('owner', wakingRoom)
    await wakingRoom.command(owner.connection, { t: 'place', x: 2, y: 2, c: 6 })
    vi.setSystemTime(Date.now() + JUDGE.askMinMs)

    reserve.mockResolvedValue(Response.json({ ok: true }))
    const originalExec = harness.durable.storage.sql.exec
    let failNextInsert = true
    vi.spyOn(harness.durable.storage.sql, 'exec').mockImplementation((query: string, ...values: (string | number | null)[]) => {
      if (failNextInsert && query.startsWith('INSERT')) {
        failNextInsert = false
        throw new Error('sqlite write failed')
      }
      return originalExec(query, ...values)
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await wakingRoom.command(owner.connection, { t: 'ask' })
    expect(integration).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(messages(owner)).toContainEqual({ t: 'ai_resting' })
    harness.database.close()
  })

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
    expect(messages(owner)).toContainEqual({ t: 'judgement', zone: 'all', guesses: ['sun'], confidence: 0.9, matched: false, text: false })
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
    expect(messages(spectator).at(-1)).toMatchObject({ t: 'reject', reason: 'not_signed_in' })
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
      { t: 'players', count: 0, roster: [], watching: 1 },
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

  it.each(['connect', 'disconnect', 'alarm'])('maintains the correct alarm after %s persistence fails', async handler => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_800_000_000_000)
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    if (handler === 'connect') await harness.room.disconnect(owner.connection)
    if (handler === 'alarm') vi.setSystemTime(harness.saved().round.endsAt!)
    vi.spyOn(harness.durable.storage.sql, 'exec').mockImplementation(() => { throw new Error('storage failed') })
    harness.durable.storage.setAlarm.mockClear()
    const pending = handler === 'connect' ? harness.connect('new-owner')
      : handler === 'disconnect' ? harness.room.disconnect(owner.connection)
      : harness.room.tick()
    await expect(pending).rejects.toThrow('storage failed')
    if (handler === 'alarm') {
      expect(harness.durable.storage.deleteAlarm).toHaveBeenCalled()
      expect(harness.durable.storage.setAlarm).not.toHaveBeenCalled()
    } else expect(harness.durable.storage.setAlarm).toHaveBeenCalledOnce()
    harness.database.close()
  })

  it('coalesces a painter’s drag into one durable write per window', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(1_800_000_000_000)
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    const sql = vi.spyOn(harness.durable.storage.sql, 'exec')
    const inserts = () => sql.mock.calls.filter(([query]) => query.startsWith('INSERT')).length
    const before = inserts()
    const stroke = Array.from({ length: 20 }, (_, x) => ({ x, y: 4, c: 6 }))
    // Three animation-frame-sized batches of one stroke: one durable write, not three.
    for (let frame = 0; frame < 3; frame++) {
      await harness.room.webSocketMessage(owner.connection, JSON.stringify({ t: 'place', cells: stroke.slice(frame * 7, frame * 7 + 7) }))
    }
    expect(inserts()).toBe(before)
    await vi.advanceTimersByTimeAsync(250)
    expect(inserts()).toBe(before + 1)
    expect(harness.saved().version).toBe(20)

    // Leaving (a structural change) writes at once and folds in any paint still pending.
    await harness.room.webSocketMessage(owner.connection, JSON.stringify({ t: 'place', cells: [{ x: 2, y: 8, c: 6 }] }))
    expect(inserts()).toBe(before + 1)
    await harness.room.disconnect(owner.connection)
    expect(inserts()).toBe(before + 2)
    expect(decodeCells(harness.saved().grid.cells as unknown as string, 1024)[8 * 32 + 2]).toBe(6)
    harness.database.close()
  })

  it('logs a failed coalesced paint write and rewrites it on the next transition', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(1_800_000_000_000)
    const harness = roomHarness()
    const owner = await harness.connect('owner')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sql = vi.spyOn(harness.durable.storage.sql, 'exec').mockImplementation(() => { throw new Error('storage failed') })
    await harness.room.webSocketMessage(owner.connection, JSON.stringify({ t: 'place', cells: [{ x: 3, y: 3, c: 6 }] }))
    await vi.advanceTimersByTimeAsync(250)
    expect(warn).toHaveBeenCalledWith('[PixelRoom] Coalesced paint write failed; the next transition rewrites it')
    sql.mockRestore()
    expect(decodeCells(harness.saved().grid.cells as unknown as string, 1024)[3 * 32 + 3]).toBe(6)
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
    const harness = roomHarness(state => ({ ...state, status: 'closed', round: { ...state.round, state: 'paused' } }))
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
    const harness = roomHarness(state => ({
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
    expect(messages(spectator).at(-1)).toEqual({ t: 'players', count: 0, roster: [], watching: 1 })
    expect(harness.durable.storage.setAlarm).toHaveBeenCalledOnce()
    harness.database.close()
  })

  it('excludes lobby spectate previews from player/watcher counts, unpausing, and room commands', async () => {
    const harness = roomHarness(state => ({
      ...state,
      status: 'paused',
      pausedAt: Date.now() - 5000,
      pausedFrom: 'playing',
      emptySince: Date.now() - 5000,
      round: { ...state.round, state: 'paused' },
    }))
    const preview = await harness.connect('signed-in-viewer', harness.room, true)
    expect(harness.saved().status).toBe('paused')
    expect(harness.room.onRoomStatus).not.toHaveBeenCalled()
    expect(messages(preview)).toHaveLength(1)
    expect(messages(preview)[0]).toMatchObject({ t: 'snapshot', players: 0, watching: 0, roster: [], you: { userId: null } })

    for (const command of [{ t: 'place', x: 0, y: 0, c: 1 }, { t: 'ask' }, { t: 'next' }, { t: 'team', team: 'red' }]) {
      await harness.room.webSocketMessage(preview.connection, JSON.stringify(command))
      expect(messages(preview).at(-1)).toMatchObject({ t: 'reject', reason: 'not_signed_in' })
    }

    const owner = await harness.connect('owner')
    expect(harness.saved().status).toBe('playing')
    expect(messages(owner).find(message => message.t === 'snapshot')).toMatchObject({ players: 1, watching: 0 })
    owner.send.mockClear()
    await harness.room.disconnect(preview.connection)
    expect(messages(owner)).toEqual([])

    const fetchSpy = vi.spyOn(BaseRoom.prototype, 'fetch').mockImplementationOnce(async () => {
      const upgraded = {
        send: vi.fn(),
        close: vi.fn(),
        serializeAttachment: vi.fn(),
        deserializeAttachment: () => ({ id: 'signed-in-viewer', name: 'signed-in-viewer' }),
      } as unknown as WebSocket
      const attachment = await (harness.room as unknown as {
        onConnect(ws: WebSocket, user: { userId: string; userName: string; userEmail: string | null }): Promise<Record<string, unknown>>
      }).onConnect(upgraded, { userId: 'signed-in-viewer', userName: 'Viewer', userEmail: null })
      expect(attachment).toMatchObject({ userId: 'signed-in-viewer', spectate: true })
      return new Response('ok')
    })
    await harness.room.fetch(new Request('https://room/ws', { headers: { Upgrade: 'websocket', 'X-Room-Spectate': 'true' } }))
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(harness.saved().status).toBe('playing')
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

  it('handles party erase, free empty erase, white 16/17 bounds and per-painter pacing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_800_000_000_000)
    const harness = roomHarness()
    const alice = await harness.connect('alice')
    const bob = await harness.connect('bob')

    await harness.room.command(bob.connection, { t: 'place', x: 2, y: 2, c: 5 })
    await harness.room.command(alice.connection, { t: 'place', x: 1, y: 1, c: 16 })
    const savedCells = () => decodeCells(harness.saved().grid.cells as unknown as string, 1024)
    expect(savedCells()[33]).toBe(16)
    await harness.room.command(alice.connection, { t: 'place', x: 3, y: 3, c: 17 })
    expect(messages(alice).at(-1)).toMatchObject({ t: 'reject', reason: 'bad_color', x: 3, y: 3 })

    // Erasing an already-empty cell sends a sender-only noop echoing the placement id: nothing is persisted or broadcast.
    harness.saved()
    const sql = vi.spyOn(harness.durable.storage.sql, 'exec')
    alice.send.mockClear()
    bob.send.mockClear()
    await harness.room.command(alice.connection, { t: 'place', cells: [{ x: 9, y: 9, c: 0, id: 7 }] })
    await harness.room.command(alice.connection, { t: 'place', x: 8, y: 8, c: 0, id: 8 } as never)
    expect(messages(alice)).toEqual([
      { t: 'noop', x: 9, y: 9, id: 7 },
      { t: 'noop', x: 8, y: 8, id: 8 },
    ])
    expect(messages(bob)).toEqual([])
    expect(sql.mock.calls.filter(([query]) => query.startsWith('INSERT'))).toHaveLength(0)

    // Erasing a painted cell is an ordinary placement: no wait behind a cooldown.
    alice.send.mockClear()
    await harness.room.command(alice.connection, { t: 'place', x: 2, y: 2, c: 0, id: 9 })
    expect(savedCells()[2 * 32 + 2]).toBe(0)
    expect(harness.saved().grid.placedBy[2 * 32 + 2]).toBe('')
    expect(messages(bob).at(-1)).toEqual({ t: 'pixel', x: 2, y: 2, c: 0, by: 'alice' })

    // A flood is paced by the sender's own bucket; the other painter is unaffected.
    const flood = Array.from({ length: 48 }, (_, i) => ({ x: i % 32, y: 20 + Math.floor(i / 32), c: 4 }))
    await harness.room.command(alice.connection, { t: 'place', cells: flood })
    const paced = messages(alice).filter(message => message.reason === 'rate_limited')
    expect(paced.length).toBeGreaterThan(0)
    bob.send.mockClear()
    await harness.room.command(bob.connection, { t: 'place', x: 4, y: 4, c: 6 })
    expect(messages(bob).at(-1)).toMatchObject({ t: 'pixel', x: 4, y: 4, c: 6, by: 'bob' })
    harness.database.close()
  })
})
