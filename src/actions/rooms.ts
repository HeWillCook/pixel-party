import type { ActionResult } from 'deepspace/worker'
import { z } from 'zod'
import { ROOMS } from '../game/config'
import { addRoomMember, findRoom, joinCodePattern, roomRecords } from '../server/rooms'
import type { ServerTools } from '../server/server-tools'

const createParams = z.object({ name: z.string().trim().min(1).max(40), mode: z.enum(['coop', 'team']), visibility: z.enum(['public', 'private']) })
const joinParams = z.object({ joinCode: z.string().regex(joinCodePattern) })
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function randomJoinCode(): string {
  return [...crypto.getRandomValues(new Uint8Array(10))].map(value => alphabet[value & 31]).join('')
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
  const joinCode = randomJoinCode()
  const result = await tools.create('rooms', {
    ...parsed.data, joinCode, hostId: userId, memberIds: [userId], status: 'playing',
    currentRoundId: '', playerCount: 0, lastActiveAt: Date.now(), isDefaultBoard: false,
  })
  return result.success ? { success: true, data: { roomId: result.data.recordId, joinCode } } : result
}

export async function joinRoom(tools: ServerTools, userId: string, params: unknown): Promise<ActionResult<{ roomId: string }>> {
  const parsed = joinParams.safeParse(params)
  if (!parsed.success) return { success: false, code: 'invalid_params', error: 'Invalid join code' }
  const result = await findRoom(tools, parsed.data.joinCode)
  if (!result.success) return result
  if (!result.data || result.data.data.status === 'closed') return { success: false, code: 'not_found', error: 'Room not found' }
  return addRoomMember(tools, result.data, userId)
}
