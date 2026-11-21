import type { ActionResult } from 'deepspace/worker'
import type { ServerTools } from './server-tools'
import type { RoomData, RoomRecord } from './rooms'

export async function ensureDefaultBoard(tools: ServerTools): Promise<ActionResult<RoomRecord>> {
  const existing = await tools.get<RoomData>('rooms', 'default-board')
  if (existing.success) return { success: true, data: existing.data.record }
  if (existing.error !== 'Record not found') return existing
  const data: RoomData = {
    name: 'Pixle', mode: 'coop', visibility: 'public', joinCode: 'play', hostId: '', memberIds: [],
    status: 'lobby', currentRoundId: '', playerCount: 0, lastActiveAt: Date.now(), isDefaultBoard: true,
  }
  const created = await tools.create('rooms', data, 'default-board')
  return created.success ? { success: true, data: { recordId: created.data.recordId, data } } : created
}
