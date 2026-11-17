import type { ActionResult } from 'deepspace/worker'
import type { ServerTools } from './server-tools'

export type RoomData = Record<string, unknown> & {
  name: string
  mode: 'coop' | 'team'
  visibility: 'public' | 'private'
  joinCode: string
  hostId: string
  memberIds: string[]
  status: 'playing' | 'intermission' | 'paused' | 'closed'
  currentRoundId: string
  playerCount: number
  lastActiveAt: number
  isDefaultBoard: boolean | 0 | 1
}
export type RoomRecord = { recordId: string; data: RoomData }

export const joinCodePattern = /^[A-Za-z0-9_-]{1,64}$/

export async function findRoom(tools: ServerTools, joinCode: string): Promise<ActionResult<RoomRecord | null>> {
  const result = await tools.query<RoomData>('rooms', { where: { joinCode }, limit: 1 })
  return result.success ? { success: true, data: result.data.records[0] ?? null } : result
}

export async function roomRecords(tools: ServerTools, collection: string, where: Record<string, unknown>): Promise<ActionResult<{ recordId: string; data: Record<string, unknown> }[]>> {
  const records: { recordId: string; data: Record<string, unknown> }[] = []
  let offset = 0
  for (;;) {
    const result = await tools.query(collection, { where, limit: 50, offset, orderBy: 'createdAt', orderDir: 'asc' })
    if (!result.success) return result
    records.push(...result.data.records)
    if (result.data.nextOffset === undefined) return { success: true, data: records }
    if (result.data.nextOffset <= offset) return { success: false, error: 'Room query pagination did not advance' }
    offset = result.data.nextOffset
  }
}

export async function addRoomMember(tools: ServerTools, room: RoomRecord, userId: string): Promise<ActionResult<{ roomId: string }>> {
  if (room.data.status === 'closed') return { success: false, code: 'not_found', error: 'Room not found' }
  const memberIds = [...new Set([...room.data.memberIds, userId])]
  for (const collection of ['rounds', 'teamMembers']) {
    if (room.data.visibility === 'public') continue
    const history = await roomRecords(tools, collection, { roomId: room.recordId })
    if (!history.success) return history
    for (const record of history.data) {
      const members = Array.isArray(record.data.memberIds) ? record.data.memberIds as string[] : []
      if (members.includes(userId)) continue
      const result = await tools.update(collection, record.recordId, { memberIds: [...new Set([...members, ...memberIds])] })
      if (!result.success) return result
    }
  }
  if (!room.data.memberIds.includes(userId)) {
    const result = await tools.update('rooms', room.recordId, { memberIds })
    if (!result.success) return result
  }
  return { success: true, data: { roomId: room.recordId } }
}
