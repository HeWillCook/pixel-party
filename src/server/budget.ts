import type { Env } from '../../worker.js'
import { withTimeout } from './room-time'

export async function reserveBudget(env: Env): Promise<boolean> {
  try {
    return await withTimeout((async () => {
      const namespace = env.BUDGET_ROOMS
      const response = await namespace.get(namespace.idFromName('global')).fetch(new Request('https://budget/reserve', { method: 'POST' }))
      if (!response.ok) return false
      const body = await response.json() as { ok?: unknown } | null
      return body?.ok === true
    })(), 5000, false)
  } catch {
    return false
  }
}
