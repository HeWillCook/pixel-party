import type { ActionResult } from 'deepspace/worker'
import { z } from 'zod'
import { ROOMS } from '../game/config'
import { addRoomMember, findRoom, joinCodePattern, roomRecords } from '../server/rooms'
import type { RoomRecord } from '../server/rooms'
import type { ServerTools } from '../server/server-tools'

const createParams = z.object({ name: z.string().trim().min(1).max(40), mode: z.enum(['coop', 'team']), visibility: z.enum(['public', 'private']) })
const joinParams = z.object({ joinCode: z.string().regex(joinCodePattern) })
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomJoinCode(length: number): string {
  return [...crypto.getRandomValues(new Uint8Array(length))].map(value => alphabet[value & 31]).join('')
}

export async function createRoom(tools: ServerTools, userId: string, params: unknown): Promise<ActionResult<{ roomId: string; joinCode: string }>> {
  const parsed = createParams.safeParse(params)
  if (!parsed.success) return { success: false, code: 'invalid_params', error: 'Name must be 1–40 characters; choose a valid mode and visibility' }
  // Team mode remains in the schema, but is unavailable until Task 9.
  if (parsed.data.mode === 'team') return { success: false, code: 'mode_unavailable', error: 'Team mode is not available yet' }
  const hosted = await roomRecords(tools, 'rooms', { hostId: userId })
  if (!hosted.success) return hosted
  if (hosted.data.filter(room => room.data.status !== 'closed').length >= ROOMS.maxActivePerUser) {
    return { success: false, code: 'room_limit', error: `You can host at most ${ROOMS.maxActivePerUser} active rooms` }
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const joinCode = randomJoinCode(4)
    const existing = await findRoom(tools, joinCode)
    if (!existing.success) return existing
    // Keep closed codes reserved too: the collection has a unique index and old links must stay closed.
    if (existing.data) continue
    const result = await tools.create('rooms', {
      ...parsed.data, joinCode, hostId: userId, memberIds: [userId], status: 'lobby',
      currentRoundId: '', playerCount: 0, lastActiveAt: Date.now(), isDefaultBoard: false,
    })
    if (result.success) return { success: true, data: { roomId: result.data.recordId, joinCode } }
    // The RecordRoom's unique index also handles concurrent creators racing the pre-check.
    if (!result.error.startsWith('Duplicate:')) return result
  }
  return { success: false, code: 'code_unavailable', error: 'Could not allocate a room code. Try again.' }
}

export async function joinRoom(tools: ServerTools, userId: string, params: unknown): Promise<ActionResult<{ roomId: string }>> {
  const parsed = joinParams.safeParse(params)
  if (!parsed.success) return { success: false, code: 'invalid_params', error: 'Invalid join code' }
  const result = await findRoom(tools, parsed.data.joinCode)
  if (!result.success) return result
  if (!result.data || result.data.data.status === 'closed') return { success: false, code: 'not_found', error: 'Room not found' }
  return addRoomMember(tools, result.data, userId)
}

/** Keep the record and unique code as a tombstone; shutdown is retryable. */
export async function deleteRoom(tools: ServerTools, userId: string, params: unknown, close: (room: RoomRecord) => Promise<void>): Promise<ActionResult<{ roomId: string }>> {
  const parsed = joinParams.safeParse(params)
  if (!parsed.success) return { success: false, code: 'invalid_params', error: 'Invalid join code' }
  const result = await findRoom(tools, parsed.data.joinCode)
  if (!result.success) return result
  const room = result.data
  if (!room) return { success: false, code: 'not_found', error: 'Room not found' }
  if (room.data.isDefaultBoard || room.data.joinCode.toLowerCase() === 'play') return { success: false, code: 'default_board', error: 'The public board cannot be deleted' }
  if (room.data.hostId !== userId) return { success: false, code: 'not_host', error: 'Only the host can delete this room' }
  const closed = await tools.update('rooms', room.recordId, { status: 'closed', playerCount: 0 })
  if (!closed.success) return closed
  try { await close(room) } catch {
    return { success: false, code: 'close_failed', error: 'Room closed to new joins, but shutdown failed. Retry Pack up.' }
  }
  return { success: true, data: { roomId: room.recordId } }
}
