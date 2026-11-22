import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { APIRequestContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

const appId = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8').match(/^DEEPSPACE_APP_ID\s*=\s*"([^"]+)"/m)![1]

type RecordReply = { type: string; payload: { records?: { recordId: string; data: Record<string, unknown> }[]; success?: boolean; error?: string } }

async function recordRequest(page: Page, bearer: string, message: Record<string, unknown>, replyType: string): Promise<RecordReply> {
  return page.evaluate(({ bearer, appId, message, replyType }) => new Promise<RecordReply>((resolve, reject) => {
    const websocket = new WebSocket(`${location.origin.replace('http', 'ws')}/ws/app:${appId}?token=${encodeURIComponent(bearer)}`)
    const timeout = setTimeout(() => { websocket.close(); reject(new Error('Record reply timeout')) }, 10_000)
    websocket.onerror = () => { clearTimeout(timeout); reject(new Error('Record WebSocket failed')) }
    websocket.onopen = () => websocket.send(JSON.stringify(message))
    websocket.onmessage = event => {
      const reply = JSON.parse(event.data)
      if (reply.type === replyType || reply.type === 'core.error') { clearTimeout(timeout); websocket.close(); resolve(reply) }
    }
  }), { bearer, appId, message, replyType })
}

async function gameSnapshot(page: Page, joinCode: string, bearer = '') {
  return page.evaluate(({ joinCode, bearer }) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const websocket = new WebSocket(`${location.origin.replace('http', 'ws')}/api/pixel/${joinCode}/ws${bearer ? `?token=${encodeURIComponent(bearer)}` : ''}`)
    const timeout = setTimeout(() => { websocket.close(); reject(new Error('Snapshot timeout')) }, 15_000)
    websocket.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket failed')) }
    websocket.onmessage = event => {
      const value = JSON.parse(event.data)
      if (value.t === 'snapshot') { clearTimeout(timeout); websocket.close(); resolve(value) }
    }
  }), { joinCode, bearer })
}

async function token(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/auth/token')
  expect(response.ok()).toBe(true)
  return (await response.json()).token
}

test('room actions require authentication', async ({ request }) => {
  for (const action of ['createRoom', 'joinRoom', 'deleteRoom']) {
    expect((await request.post(`/api/actions/${action}`, { data: {} })).status()).toBe(401)
  }
})

test('the old always-on public board is gone', async ({ request }) => {
  expect((await request.get('/api/pixel/play/ws')).status()).toBe(404)
})

test.describe('authenticated room API', () => {
  test.skip(loadAllTestAccounts().length < 2, 'Needs two usable scaffold test accounts; equivalent handlers and SDK RBAC rules are unit-tested.')

  test('public/private reads, joining, active-room limit, and denied client round creation', async ({ users, request }) => {
    const [host, guest] = await users(2)
    const hostToken = await token(host.context.request)
    const guestToken = await token(guest.context.request)
    const action = async (name: string, bearer: string, data: Record<string, unknown>) => {
      const response = await request.post(`/api/actions/${name}`, { headers: { Authorization: `Bearer ${bearer}` }, data })
      return response.json()
    }
    await guest.page.goto('/')
    const readRoom = async (recordId: string) => (await recordRequest(guest.page, guestToken, {
      type: 'core.subscribe', payload: { subscriptionId: crypto.randomUUID(), query: { collection: 'rooms', where: { recordId } } },
    }, 'core.query_result')).payload.records
    const created: { roomId: string; joinCode: string }[] = []
    for (let index = 0; index < 5; index++) {
      const result = await action('createRoom', hostToken, { name: 'API room', mode: 'coop', visibility: index === 0 ? 'public' : 'private' })
      expect(result.success).toBe(true)
      expect(result.data.joinCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/)
      created.push(result.data)
    }
    expect(await action('createRoom', hostToken, { name: 'Sixth', mode: 'coop', visibility: 'public' })).toMatchObject({ success: false, code: 'room_limit' })
    expect(await readRoom(created[0].roomId)).toHaveLength(1)
    expect(await readRoom(created[1].roomId)).toHaveLength(0)
    expect((await request.get(`/api/pixel/${created[1].joinCode}/ws`)).status()).toBe(401)
    expect(await action('joinRoom', guestToken, { joinCode: created[1].joinCode })).toMatchObject({ success: true })
    expect(await readRoom(created[1].roomId)).toHaveLength(1)
    expect(await readRoom(created[2].roomId)).toHaveLength(0)
    expect(await gameSnapshot(guest.page, created[2].joinCode, guestToken)).toMatchObject({ t: 'snapshot', you: { userId: guest.userId } })
    expect(await readRoom(created[2].roomId)).toHaveLength(1)
    const denied = await recordRequest(guest.page, hostToken, {
      type: 'core.put', payload: { collection: 'rounds', recordId: crypto.randomUUID(), requestId: crypto.randomUUID(), data: { roomId: created[0].roomId, word: 'spoof' } },
    }, 'records.ack')
    expect(denied.payload).toMatchObject({ success: false })
    expect(denied.payload.error).toContain('CREATE DENIED')
  })
})
