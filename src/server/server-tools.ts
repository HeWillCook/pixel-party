import { apiWorkerFetch, normalizeApiError, splitIntegrationEndpoint } from 'deepspace/worker'
import type { ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker.js'

declare const __PIXEL_PARTY_TEST__: boolean

export type ServerTools = Pick<ActionTools, 'create' | 'update' | 'get' | 'deleteWhere'> & {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    collection: string,
    options?: NonNullable<Parameters<ActionTools['query']>[1]> & { offset?: number },
  ): Promise<ActionResult<{ records: { recordId: string; data: T }[]; count: number; nextOffset?: number }>>
  integration<T = unknown>(endpoint: string, body: unknown): Promise<ActionResult<T>>
}

function upstreamUnavailable(error: unknown): ActionResult<never> {
  return {
    success: false,
    code: 'upstream_unavailable',
    error: error instanceof Error ? error.message : 'Upstream request failed',
  }
}

async function readResult<T>(response: Response): Promise<ActionResult<T>> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    if (!response.ok) return { success: false, ...normalizeApiError(response.status, {}) }
    return upstreamUnavailable(error)
  }
  const body = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
  if (!response.ok || body?.success === false) {
    return { success: false, ...normalizeApiError(response.status, body ?? {}) }
  }
  if (body?.success !== true) return upstreamUnavailable(new Error('Invalid upstream response'))
  return body as ActionResult<T>
}

/** Privileged app-owned operations. Callers must enforce game policy before using these tools. */
export function createServerTools(env: Env): ServerTools {
  async function execTool<T>(tool: string, params: Record<string, unknown>): Promise<ActionResult<T>> {
    try {
      const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
      const response = await stub.fetch(new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': env.OWNER_USER_ID,
          'X-App-Action': 'true',
        },
        body: JSON.stringify({ tool, params }),
      }))
      return await readResult<T>(response)
    } catch (error) {
      return upstreamUnavailable(error)
    }
  }

  async function integration<T>(endpoint: string, body: unknown): Promise<ActionResult<T>> {
    try {
      // Vite defines this as false in production, preserving normal integrations there.
      if (typeof __PIXEL_PARTY_TEST__ !== 'undefined' && __PIXEL_PARTY_TEST__) {
        return { success: false, code: 'test_integration_disabled', error: 'External integrations disabled in tests' }
      }
      // Validate before attaching the owner credential: never allow arbitrary API paths.
      const target = splitIntegrationEndpoint(endpoint)
      if (!target) {
        return {
          success: false,
          code: 'invalid_integration_endpoint',
          error: `Integration endpoint ${JSON.stringify(endpoint)} must be "<integration>/<endpoint>"`,
        }
      }
      if (!env.APP_OWNER_JWT) {
        return { success: false, code: 'owner_credential_missing', error: 'App owner credential is missing' }
      }
      const response = await apiWorkerFetch(env, target.path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.APP_OWNER_JWT}`,
        },
        body: JSON.stringify(body ?? {}),
      })
      return await readResult<T>(response)
    } catch (error) {
      return upstreamUnavailable(error)
    }
  }

  return {
    create: (collection, data, recordId) => execTool('records.create', { collection, data, recordId }),
    update: (collection, recordId, data) => execTool('records.update', { collection, recordId, data }),
    get: (collection, recordId) => execTool('records.get', { collection, recordId }),
    // DEV ONLY (__DEBUG_TOOLS__) (used only by daily-debug.ts)
    deleteWhere: (collection, where, limit) => execTool('records.deleteWhere', { collection, where, limit }),
    query: (collection, options) => execTool('records.query', { collection, ...options }),
    integration,
  }
}
