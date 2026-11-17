import { canCreate, canDelete, canRead, canUpdate } from 'deepspace/worker'
import { describe, expect, it } from 'vitest'
import { schemas } from '../schemas'
import { createRoom, joinRoom } from '../actions/rooms'
import { ensureDefaultBoard } from './default-board'
import { memoryTools } from './room-test-tools'

describe('game collection permissions', () => {
  it.each(['rooms', 'rounds', 'teamMembers', 'scores'])('denies every client write to %s, including admins', name => {
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

  it('exposes scores to anonymous readers', () => {
    expect(canRead(schemas.find(schema => schema.name === 'scores')!, '*', { createdBy: 'server', data: {} }, '')).toBe(true)
  })
})

describe('room actions', () => {
  it('creates validated public/private rooms with random ten-character codes', async () => {
    const { tools, rows } = memoryTools()
    for (const visibility of ['public', 'private']) {
      const result = await createRoom(tools, 'host', { name: 'Drawing party', mode: 'coop', visibility })
      expect(result.success).toBe(true)
      if (!result.success) throw new Error(result.error)
      expect(result.data.joinCode).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ_]{10}$/)
      expect(rows('rooms').get(result.data.roomId)).toMatchObject({ visibility, hostId: 'host', memberIds: ['host'], playerCount: 0, currentRoundId: '', isDefaultBoard: false })
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

  it('does not overwrite an existing default board', async () => {
    const { tools, rows, create } = memoryTools()
    expect(await ensureDefaultBoard(tools)).toMatchObject({ success: true, data: { recordId: 'default-board', data: { joinCode: 'play', visibility: 'public', isDefaultBoard: true, hostId: '' } } })
    rows('rooms').get('default-board')!.currentRoundId = 'existing'
    expect(await ensureDefaultBoard(tools)).toMatchObject({ success: true, data: { recordId: 'default-board', data: { currentRoundId: 'existing' } } })
    expect(create).toHaveBeenCalledTimes(1)
    expect(rows('rooms').get('default-board')).toMatchObject({ joinCode: 'play', visibility: 'public', isDefaultBoard: true, hostId: '', currentRoundId: 'existing' })
  })
})
