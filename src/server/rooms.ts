import type { ActionResult } from 'deepspace/worker'
import type { ServerTools } from './server-tools'

export type RoomData = Record<string, unknown> & {
  name: string
  mode: 'coop' | 'team'
  visibility: 'public' | 'private'
  joinCode: string
  hostId: string
  memberIds: string[]
  status: 'lobby' | 'playing' | 'intermission' | 'paused' | 'closed'
  currentRoundId: string
  playerCount: number
  lastActiveAt: number
}
export type RoomRecord = { recordId: string; data: RoomData }

export const joinCodePattern = /^[A-Za-z0-9_-]{1,64}$/

export async function findRoom(tools: ServerTools, joinCode: string): Promise<ActionResult<RoomRecord | null>> {
  const normalized = joinCode.toUpperCase()
  const result = await tools.query<RoomData>('rooms', { where: { joinCode: normalized }, limit: 1 })
  if (!result.success) return result
  if (result.data.records[0]) return { success: true, data: result.data.records[0] }
  // Legacy room codes were not normalized at storage time. Page only on a canonical miss.
  const legacy = await roomRecords(tools, 'rooms', {})
  if (!legacy.success) return legacy
  const match = legacy.data.find(room => typeof room.data.joinCode === 'string' && room.data.joinCode.toUpperCase() === normalized)
  return { success: true, data: match ? match as RoomRecord : null }
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

/**
 * One row per open game for the lobby list. Private rooms are listed by name only: their join code is
 * included just when the viewer hosts or has joined them, so a locked room can never be walked into.
 */
export interface OpenRoomSummary {
  id: string
  name: string
  /** The host's user id, so the lobby can offer its own host controls. */
  hostId: string
  mode: 'coop' | 'team'
  status: RoomData['status']
  playerCount: number
  visibility: 'public' | 'private'
  /** Null on a private room the viewer may not enter without typing its code. */
  joinCode: string | null
}

export async function openRooms(tools: ServerTools, viewerId: string | null): Promise<ActionResult<OpenRoomSummary[]>> {
  const all = await roomRecords(tools, 'rooms', {})
  if (!all.success) return all
  const rows = all.data
    .filter(record => {
      const data = record.data as Partial<RoomData>
      // Closed rooms are gone, and a room with no host can never be started: it is not a game.
      // Co-op is the only mode for now: an old team room is not listed.
      return data.status !== 'closed' && data.mode !== 'team' && typeof data.hostId === 'string' && data.hostId !== ''
    })
    .sort((left, right) => Number(right.data.lastActiveAt ?? 0) - Number(left.data.lastActiveAt ?? 0))
    .slice(0, 50)
    .map(record => {
      const data = record.data as unknown as RoomData
      const member = Boolean(viewerId) && (data.hostId === viewerId || (Array.isArray(data.memberIds) && data.memberIds.includes(viewerId!)))
      return {
        id: record.recordId,
        name: typeof data.name === 'string' ? data.name : 'Studio room',
        hostId: data.hostId,
        mode: data.mode === 'team' ? 'team' as const : 'coop' as const,
        status: data.status,
        playerCount: typeof data.playerCount === 'number' ? data.playerCount : 0,
        visibility: data.visibility === 'private' ? 'private' as const : 'public' as const,
        joinCode: data.visibility === 'private' && !member ? null : (typeof data.joinCode === 'string' ? data.joinCode : null),
      }
    })
  return { success: true, data: rows }
}

export async function addRoomMember(tools: ServerTools, room: RoomRecord, userId: string): Promise<ActionResult<{ roomId: string }>> {
  if (room.data.status === 'closed') return { success: false, code: 'not_found', error: 'Room not found' }
  if (room.data.memberIds.includes(userId)) return { success: true, data: { roomId: room.recordId } }
  const memberIds = [...new Set([...room.data.memberIds, userId])]
  const updated = await tools.update('rooms', room.recordId, { memberIds })
  if (!updated.success) return updated
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
  return { success: true, data: { roomId: room.recordId } }
}
