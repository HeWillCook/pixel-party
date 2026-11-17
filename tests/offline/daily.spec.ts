import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')

async function offlineClient(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: null })
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token: null } })
    if (url.pathname === '/api/daily/start') return route.fulfill({ status: 401, body: 'Unauthorized' })
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} })
    const asset = url.pathname.startsWith('/assets/')
    const path = asset ? resolve(clientDir, `.${url.pathname}`) : resolve(clientDir, '_spa.html')
    const contentType = asset ? (path.endsWith('.css') ? 'text/css' : 'application/javascript') : 'text/html'
    return route.fulfill({ contentType, body: await readFile(path) })
  })
  await page.routeWebSocket('**/ws/**', socket => {
    if (socket.url().includes('/ws/presence/')) return
    socket.send(JSON.stringify({ type: 'user.info', payload: { role: 'member' } }))
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw))
      if (message.type === 'user.list') socket.send(JSON.stringify({ type: 'user.list', payload: { users: [] } }))
      if (message.type === 'core.subscribe') {
        socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId: message.payload.subscriptionId, records: [] } }))
      }
    })
  })
  return errors
}

test('signed-out home shows leaderboard and sign-in without revealing a prompt', async ({ page }) => {
  const errors = await offlineClient(page)
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-sign-in-button')).toBeVisible()
  await expect(page.getByTestId('daily-leaderboard').getByRole('heading', { name: 'Leaderboard' })).toBeVisible()
  await expect(page.getByTestId('daily-prompt')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('signed-out profile renders its heading and empty state without errors', async ({ page }) => {
  const errors = await offlineClient(page)
  await page.goto(`${origin}/u/offline-player`)
  await expect(page.getByRole('heading', { name: "Player's Gallery" })).toBeVisible()
  await expect(page.getByText('No drawings to show yet.')).toBeVisible()
  expect(errors).toEqual([])
})

test('party route still renders the lobby', async ({ page }) => {
  const errors = await offlineClient(page)
  await page.goto(`${origin}/party`)
  await expect(page.getByRole('heading', { name: 'Live Public Rooms' })).toBeVisible()
  await expect(page.getByTestId('lobby-play-now')).toBeVisible()
  expect(errors).toEqual([])
})

test('daily start endpoint rejects an unauthenticated request', async ({ page }) => {
  await offlineClient(page)
  await page.goto(`${origin}/home`)
  const status = await page.evaluate(async () => (await fetch('/api/daily/start', { method: 'POST' })).status)
  expect(status).toBe(401)
})
