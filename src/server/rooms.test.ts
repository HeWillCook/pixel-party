import { canCreate, canDelete, canRead, canUpdate } from 'deepspace/worker'
import { describe, expect, it, vi } from 'vitest'
import { schemas } from '../schemas'
import { createRoom, deleteRoom, joinRoom } from '../actions/rooms'
import { openRooms } from './rooms'
import { memoryTools } from './room-test-tools'

describe('game collection permissions', () => {
  it.each(['rooms', 'rounds', 'teamMembers'])('denies every client write to %s, including admins', name => {
    const schema = schemas.find(schema => schema.name === name)!
    expect(schema).toBeDefined()
    for (const role of ['*', 'viewer', 'member', 'admin']) {
      expect(canCreate(schema, role)).toBe(false)
      expect(canUpdate(schema, role, { createdBy: 'server', data: { hostId: 'host', userId: 'host', memberIds: ['host'] } }, 'host')).toBe(false)
      expect(canDelete(schema, role, { createdBy: 'server', data: { hostId: 'host', userId: 'host', memberIds: ['host'] } }, 'host')).toBe(false)
    }
  })

  it.each(['rooms', 'rounds', 'teamMembers'])('%s restricts private reads to members, not app admins', name => {
    const schema = schemas.find(schema => schema.name === name)!
    for (const role of ['*', 'viewer', 'member', 'admin']) {
      expect(canRead(schema, role, { createdBy: 'server', data: { visibility: 'public', hostId: 'host', memberIds: ['host'] } }, 'other')).toBe(true)
      expect(canRead(schema, role, { createdBy: 'server', data: { visibility: 'private', hostId: 'host', memberIds: ['host'] } }, 'other')).toBe(false)
    }
    expect(canRead(schema, 'member', { createdBy: 'server', data: { visibility: 'private', hostId: 'host', memberIds: ['host', 'guest'] } }, 'guest')).toBe(true)
  })
})

describe('room actions', () => {
  it('creates validated public/private rooms with four-character codes', async () => {
    const { tools, rows } = memoryTools()
    for (const visibility of ['public', 'private']) {
      const result = await createRoom(tools, 'host', { name: 'Drawing party', mode: 'coop', visibility })
      expect(result.success).toBe(true)
      if (!result.success) throw new Error(result.error)
      expect(result.data.joinCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/)
      expect(rows('rooms').get(result.data.roomId)!.status).toBe('lobby')
      expect(rows('rooms').get(result.data.roomId)).toMatchObject({ visibility, hostId: 'host', memberIds: ['host'], playerCount: 0, currentRoundId: '' })
    }
    expect(new Set([...rows('rooms').values()].map(room => room.joinCode)).size).toBe(2)
  })

  it('limits only the caller’s non-closed rooms, including beyond the first query page', async () => {
    const { tools, rows } = memoryTools()
    for (let index = 0; index < 60; index++) rows('rooms').set(`old-${index}`, { hostId: 'host', status: 'closed' })
    rows('rooms').set('other', { hostId: 'other', status: 'playing' })
    for (let index = 0; index < 5; index++) expect((await createRoom(tools, 'host', { name: 'Test', mode: 'coop', visibility: 'private' })).success).toBe(true)
    expect(await createRoom(tools, 'host', { name: 'Sixth', mode: 'coop', visibility: 'public' })).toMatchObject({ success: false, code: 'room_limit' })
  })

  it.each([{ name: '', mode: 'coop', visibility: 'public' }, { name: 'x'.repeat(41), mode: 'coop', visibility: 'public' }, { name: 'test', mode: 'bad', visibility: 'public' }, { name: 'test', mode: 'coop', visibility: 'bad' }])('rejects invalid input %j', async params => {
    const { tools, create } = memoryTools()
    expect(await createRoom(tools, 'host', params)).toMatchObject({ success: false, code: 'invalid_params' })
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses team mode until Task 9', async () => {
    expect(await createRoom(memoryTools().tools, 'host', { name: 'Team', mode: 'team', visibility: 'public' })).toMatchObject({ success: false, code: 'mode_unavailable' })
  })

  it('joins idempotently and grants private history reads to a later member', async () => {
    const { tools, rows, update } = memoryTools()
    rows('rooms').set('room', { joinCode: 'CODE', visibility: 'private', status: 'playing', memberIds: ['host'] })
    rows('rounds').set('round', { roomId: 'room', visibility: 'private', memberIds: ['host'] })
    rows('teamMembers').set('team', { roomId: 'room', visibility: 'private', memberIds: ['host'] })
    expect(await joinRoom(tools, 'guest', { joinCode: 'CODE' })).toEqual({ success: true, data: { roomId: 'room' } })
    expect(await joinRoom(tools, 'guest', { joinCode: 'CODE' })).toMatchObject({ success: true })
    expect(rows('rooms').get('room')!.memberIds).toEqual(['host', 'guest'])
    for (const name of ['rounds', 'teamMembers']) {
      const schema = schemas.find(schema => schema.name === name)!
      expect(canRead(schema, 'member', { createdBy: 'server', data: [...rows(name).values()][0] }, 'guest')).toBe(true)
    }
    expect(update.mock.calls.filter(([collection]) => collection === 'rooms')).toHaveLength(1)
  })

  it('returns immediately for an existing member without scanning history', async () => {
    const { tools, rows, query, update } = memoryTools()
    rows('rooms').set('room', { joinCode: 'CODE', visibility: 'private', status: 'playing', memberIds: ['host', 'guest'] })
    expect(await joinRoom(tools, 'guest', { joinCode: 'CODE' })).toEqual({ success: true, data: { roomId: 'room' } })
    expect(query.mock.calls.map(([collection]) => collection)).toEqual(['rooms'])
    expect(update).not.toHaveBeenCalled()
  })

  it('updates room membership before querying or updating historical ACLs', async () => {
    const { tools, rows, query, update } = memoryTools()
    rows('rooms').set('room', { joinCode: 'CODE', visibility: 'private', status: 'playing', memberIds: ['host'] })
    rows('rounds').set('round', { roomId: 'room', memberIds: ['host'] })
    rows('teamMembers').set('team', { roomId: 'room', memberIds: ['host'] })
    expect(await joinRoom(tools, 'guest', { joinCode: 'CODE' })).toMatchObject({ success: true })
    expect(update.mock.calls.map(([collection]) => collection)).toEqual(['rooms', 'rounds', 'teamMembers'])
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(query.mock.invocationCallOrder[1])
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[1])
  })

  it('does not scan history if the initial room membership write fails', async () => {
    const { tools, rows, query, update } = memoryTools()
    rows('rooms').set('room', { joinCode: 'CODE', visibility: 'private', status: 'playing', memberIds: ['host'] })
    update.mockResolvedValueOnce({ success: false, error: 'offline' } as never)
    expect(await joinRoom(tools, 'guest', { joinCode: 'CODE' })).toMatchObject({ success: false, error: 'offline' })
    expect(query.mock.calls.map(([collection]) => collection)).toEqual(['rooms'])
    expect(rows('rooms').get('room')!.memberIds).toEqual(['host'])
  })

  it('hides missing/closed rooms and rejects malformed codes', async () => {
    const { tools, rows } = memoryTools()
    rows('rooms').set('closed', { joinCode: 'CLOSED', status: 'closed' })
    for (const joinCode of ['MISSING', 'CLOSED']) expect(await joinRoom(tools, 'guest', { joinCode })).toMatchObject({ success: false, code: 'not_found' })
    expect(await joinRoom(tools, 'guest', { joinCode: '../bad' })).toMatchObject({ success: false, code: 'invalid_params' })
  })

  it('lists every open game, but only hands a private code to its host or members', async () => {
    const { tools, rows } = memoryTools()
    rows('rooms').set('open', { name: 'Open house', joinCode: 'PUB4', visibility: 'public', status: 'playing', hostId: 'someone', memberIds: ['someone'], playerCount: 2, lastActiveAt: 3000 })
    rows('rooms').set('locked', { name: 'Secret club', joinCode: 'PRV8', visibility: 'private', status: 'lobby', hostId: 'other', memberIds: ['other'], playerCount: 0, lastActiveAt: 4000 })
    rows('rooms').set('mine', { name: 'My club', joinCode: 'MINE', visibility: 'private', status: 'lobby', hostId: 'host', memberIds: ['host'], playerCount: 1, lastActiveAt: 2000 })
    rows('rooms').set('joined', { name: 'Friend club', joinCode: 'FRND', visibility: 'private', status: 'playing', hostId: 'other', memberIds: ['other', 'host'], playerCount: 1, lastActiveAt: 1000 })
    rows('rooms').set('closed', { name: 'Gone', joinCode: 'GONE', visibility: 'public', status: 'closed', hostId: 'someone', memberIds: ['someone'], playerCount: 0, lastActiveAt: 9000 })
    rows('rooms').set('orphan', { name: 'Old board', joinCode: 'PLAY', visibility: 'public', status: 'playing', hostId: '', memberIds: [], playerCount: 0, lastActiveAt: 10000 })

    const anonymous = await openRooms(tools, null)
    expect(anonymous).toMatchObject({ success: true })
    if (!anonymous.success) throw new Error(anonymous.error)
    expect(anonymous.data.map(room => room.id)).toEqual(['locked', 'open', 'mine', 'joined'])
    expect(anonymous.data.find(room => room.id === 'open')).toMatchObject({ joinCode: 'PUB4', visibility: 'public', mode: 'coop', playerCount: 2 })
    expect(anonymous.data.find(room => room.id === 'locked')).toMatchObject({ joinCode: null, visibility: 'private' })
    // A hostless room can never be started: it is not a game.
    expect(anonymous.data.some(room => room.id === 'orphan')).toBe(false)
    expect(anonymous.data.some(room => room.id === 'closed')).toBe(false)

    const signedIn = await openRooms(tools, 'host')
    if (!signedIn.success) throw new Error(signedIn.error)
    expect(signedIn.data.find(room => room.id === 'locked')?.joinCode).toBeNull()
    expect(signedIn.data.find(room => room.id === 'mine')?.joinCode).toBe('MINE')
    expect(signedIn.data.find(room => room.id === 'joined')?.joinCode).toBe('FRND')
  })
})

it.each(['public', 'private'] as const)('retries %s collisions ten times without reusing a closed code', async visibility => {
  const { tools, rows, create } = memoryTools()
  const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
    (array as Uint8Array).fill(0)
    return array
  })
  try {
    rows('rooms').set('existing', { joinCode: 'AAAA', status: 'closed', hostId: 'other' })
    expect(await createRoom(tools, 'host', { name: 'Party', mode: 'coop', visibility })).toMatchObject({ success: false, code: 'code_unavailable' })
    expect(random).toHaveBeenCalledTimes(10)
    expect(create).not.toHaveBeenCalled()
    random.mockImplementationOnce(array => { (array as Uint8Array).fill(1); return array })
    expect(await createRoom(tools, 'host', { name: 'Party', mode: 'coop', visibility })).toMatchObject({ success: true, data: { joinCode: 'BBBB' } })
    expect(rows('rooms').get('existing')!.status).toBe('closed')
  } finally { random.mockRestore() }
})
it('joins short, legacy and default codes case-insensitively', async () => {
  const { tools, rows } = memoryTools()
  for (const code of ['AB2Z', 'LONG234ABC', 'MiXeD-code', 'play']) rows('rooms').set(code, { joinCode: code, status: 'playing', visibility: 'public', memberIds: ['guest'] })
  for (const joinCode of ['ab2z', 'long234abc', 'mixed-CODE', 'PLAY']) expect(await joinRoom(tools, 'guest', { joinCode })).toMatchObject({ success: true })
})

it('retries a unique-index collision from a concurrent creator but returns other storage failures', async () => {
  const { tools, create } = memoryTools()
  create.mockResolvedValueOnce({ success: false, error: 'Duplicate: a record with joinCode already exists in rooms' } as never)
  expect(await createRoom(tools, 'host', { name: 'Race', mode: 'coop', visibility: 'private' })).toMatchObject({ success: true })
  expect(create).toHaveBeenCalledTimes(2)
  create.mockResolvedValueOnce({ success: false, error: 'offline' } as never)
  expect(await createRoom(tools, 'host', { name: 'Fail', mode: 'coop', visibility: 'private' })).toMatchObject({ success: false, error: 'offline' })
})


it('only lets the host close a custom room, reserves its code, and frees an active slot', async () => {
  const { tools, rows, update } = memoryTools()
  for (let i = 0; i < 5; i++) rows('rooms').set(`room${i}`, { joinCode: `ABC${i}`, hostId: 'host', status: 'playing' })
  const close = vi.fn(async () => {})
  expect(await deleteRoom(tools, 'guest', { joinCode: 'ABC0' }, close)).toMatchObject({ success: false, code: 'not_host' })
  expect(update).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
  expect(await deleteRoom(tools, 'host', { joinCode: '../bad' }, close)).toMatchObject({ success: false, code: 'invalid_params' })
  expect(await deleteRoom(tools, 'host', { joinCode: 'NONE' }, close)).toMatchObject({ success: false, code: 'not_found' })
  expect(await deleteRoom(tools, 'host', { joinCode: 'abc0' }, close)).toMatchObject({ success: true })
  expect(rows('rooms').get('room0')).toMatchObject({ joinCode: 'ABC0', status: 'closed' })
  expect(close).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'room0' }))
  expect(await joinRoom(tools, 'host', { joinCode: 'ABC0' })).toMatchObject({ success: false, code: 'not_found' })
  expect(await createRoom(tools, 'host', { name: 'Replacement', mode: 'coop', visibility: 'public' })).toMatchObject({ success: true })
})

it('reports storage and shutdown failures and lets hosts retry an already closed room', async () => {
  const { tools, rows, update } = memoryTools()
  rows('rooms').set('room', { joinCode: 'AB2Z', hostId: 'host', status: 'playing' })
  const close = vi.fn<() => Promise<void>>(async () => { throw new Error('offline') })
  update.mockResolvedValueOnce({ success: false, error: 'storage offline' } as never)
  expect(await deleteRoom(tools, 'host', { joinCode: 'AB2Z' }, close)).toMatchObject({ success: false, error: 'storage offline' })
  expect(close).not.toHaveBeenCalled()
  expect(await deleteRoom(tools, 'host', { joinCode: 'AB2Z' }, close)).toMatchObject({ success: false, code: 'close_failed' })
  close.mockResolvedValueOnce(undefined)
  expect(await deleteRoom(tools, 'host', { joinCode: 'AB2Z' }, close)).toMatchObject({ success: true })
})
