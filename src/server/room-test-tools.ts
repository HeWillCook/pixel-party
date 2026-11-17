import { vi } from 'vitest'
import type { ServerTools } from './server-tools'

export function memoryTools() {
  const collections = new Map<string, Map<string, Record<string, unknown>>>()
  const rows = (collection: string) => {
    if (!collections.has(collection)) collections.set(collection, new Map())
    return collections.get(collection)!
  }
  const create = vi.fn(async (collection: string, data: Record<string, unknown>, recordId = crypto.randomUUID()) => {
    rows(collection).set(recordId, { ...rows(collection).get(recordId), ...data })
    return { success: true, data: { recordId } }
  })
  const update = vi.fn(async (collection: string, recordId: string, data: Record<string, unknown>) => create(collection, data, recordId))
  const get = vi.fn(async (collection: string, recordId: string) => rows(collection).has(recordId)
    ? { success: true, data: { record: { recordId, data: rows(collection).get(recordId) } } }
    : { success: false, error: 'Record not found' })
  const query = vi.fn(async (collection: string, options?: { where?: Record<string, unknown>; limit?: number; offset?: number }) => {
    const matches = [...rows(collection)].filter(([recordId, data]) => Object.entries(options?.where ?? {}).every(([key, value]) => (key === 'recordId' ? recordId : data[key]) === value))
    const offset = options?.offset ?? 0
    const page = matches.slice(offset, options?.limit ? offset + options.limit : undefined)
    return { success: true, data: { records: page.map(([recordId, data]) => ({ recordId, data })), count: page.length, ...(offset + page.length < matches.length ? { nextOffset: offset + page.length } : {}) } }
  })
  const tools = { create, update, get, query, integration: vi.fn() } as unknown as ServerTools
  return { tools, rows, create, update, get, query }
}
