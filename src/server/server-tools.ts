import { apiWorkerFetch, normalizeApiError, splitIntegrationEndpoint } from 'deepspace/worker'
import type { ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker.js'

export type ServerTools = Pick<ActionTools, 'create' | 'update' | 'get' | 'query'> & {
  integration<T = unknown>(endpoint: string, body: unknown): Promise<ActionResult<T>>
}

/** Privileged app-owned operations. Callers must enforce game policy before using these tools. */
export function createServerTools(env: Env): ServerTools {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))

  async function execTool<T>(tool: string, params: Record<string, unknown>): Promise<ActionResult<T>> {
    const response = await stub.fetch(new Request('https://internal/api/tools/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': env.OWNER_USER_ID,
        'X-App-Action': 'true',
      },
      body: JSON.stringify({ tool, params }),
    }))
    return response.json() as Promise<ActionResult<T>>
  }

  async function integration<T>(endpoint: string, body: unknown): Promise<ActionResult<T>> {
    // Validate before attaching the owner credential: never allow arbitrary API paths.
    const target = splitIntegrationEndpoint(endpoint)
    if (!target) {
      return {
        success: false,
        code: 'invalid_integration_endpoint',
        error: `Integration endpoint ${JSON.stringify(endpoint)} must be "<integration>/<endpoint>"`,
      }
    }
    const response = await apiWorkerFetch(env, target.path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.APP_OWNER_JWT}`,
      },
      body: JSON.stringify(body ?? {}),
    })
    const payload = await response.json() as Record<string, unknown>
    if (!response.ok || payload.success === false) {
      return { success: false, ...normalizeApiError(response.status, payload) }
    }
    return payload as ActionResult<T>
  }

  return {
    create: (collection, data, recordId) => execTool('records.create', { collection, data, recordId }),
    update: (collection, recordId, data) => execTool('records.update', { collection, recordId, data }),
    get: (collection, recordId) => execTool('records.get', { collection, recordId }),
    query: (collection, options) => execTool('records.query', { collection, ...options }),
    integration,
  }
}
