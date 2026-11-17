import type { ActionResult } from 'deepspace/worker'
import type { ServerTools } from './server-tools'

export async function ensureDefaultBoard(tools: ServerTools): Promise<ActionResult<{ recordId: string }>> {
  const existing = await tools.get('rooms', 'default-board')
  if (existing.success) return { success: true, data: { recordId: 'default-board' } }
  if (existing.error !== 'Record not found') return existing
  return tools.create('rooms', {
    name: 'Pixel Party', mode: 'coop', visibility: 'public', joinCode: 'play', hostId: '', memberIds: [],
    status: 'playing', currentRoundId: '', playerCount: 0, lastActiveAt: Date.now(), isDefaultBoard: true,
  }, 'default-board')
}
