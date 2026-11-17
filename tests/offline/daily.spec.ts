import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')

for (const askFirst of [false, true]) test(askFirst ? 'auto-grade fires at 2:00 after an ask at 1:30' : 'auto-grade fires at 2:00 without asks', async ({ page }) => {
  // Task 4 must un-fixme the reproduced manual-grade scheduling failure.
  test.fixme(askFirst, 'Task 4 must restore fixed auto-grade scheduling')
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const startedAt = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt, endsAt: startedAt + 600_000, autoUsed: 0, asksUsed: 0, finalUsed: false, best: 0, nextAutoAt: startedAt + 120_000 }
  const grades: { body: unknown; status: number }[] = []
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: { ...playing, status: 'not_started' } })
    if (path.endsWith('/start')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      const body = route.request().postDataJSON()
      grades.push({ body, status: 200 })
      return route.fulfill({ status: 200, json: { ok: true, grade: { guess: 'tree', reason: 'tree', fit: 100, recognition: 100, speed: 10, total: 210, elapsedMs: 120_000 }, state: { ...playing, ...(body.kind === 'ask' ? { asksUsed: 1, nextAutoAt: startedAt + 190_000 } : { autoUsed: 1 }) } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
  if (askFirst) {
    await page.clock.fastForward(90_000)
    await page.getByTestId('daily-ask-button').click()
    await expect.poll(() => grades.length).toBe(1)
  }
  await page.clock.fastForward(askFirst ? 35_000 : 125_000)
  await expect.poll(() => grades.filter(grade => (grade.body as { kind: string }).kind === 'auto')).toMatchObject([{ body: { kind: 'auto' }, status: 200 }])
})

async function offlineClient(page: Page, signedIn = false) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: signedIn ? { user: { id: 'host', name: 'Will', email: 'will@example.test' }, session: { id: 'offline', userId: 'host', expiresAt: '2096-01-01T00:00:00Z' } } : null })
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token: signedIn ? `fixture.${Buffer.from(JSON.stringify({ sub: 'host', exp: 4_000_000_000 })).toString('base64url')}.unsigned` : null } })
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
      if (String(raw) === 'ping') return
      const message = JSON.parse(String(raw))
      if (message.type === 'user.list') socket.send(JSON.stringify({ type: 'user.list', payload: { users: signedIn ? [{ id: 'host', name: 'Will' }] : [] } }))
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

for (const invalidAt of ['grade', 'end'] as const) {
  for (const todayStatus of ['not_started', 'playing', 'ended', 'unavailable'] as const) {
    test(`invalid-day ${invalidAt} reloads ${todayStatus} without ending another day`, async ({ page }) => {
      const errors = await offlineClient(page, true)
      const today = new Date().toISOString().slice(0, 10)
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
      const initial = { day: yesterday, status: 'playing', prompt: 'Yesterday scene', startedAt: Date.now() - 60_000, endsAt: Date.now() + 540_000, autoUsed: 0, asksUsed: 0, finalUsed: false, best: 123 }
      const fresh = { ...initial, day: today, status: todayStatus, prompt: 'Today scene', best: 456 }
      let refreshes = 0
      let staleRejected = false
      const ends: unknown[] = []
      const grades: unknown[] = []
      let release!: () => void
      const reload = new Promise<void>(resolve => { release = resolve })
      await page.route('**/api/daily/**', async route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/me')) {
          if (!staleRejected) return route.fulfill({ json: initial })
          refreshes++
          await reload
          return todayStatus === 'unavailable' ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: fresh })
        }
        if (path.endsWith('/grade')) {
          grades.push(route.request().postDataJSON())
          if (invalidAt === 'end') return route.fulfill({ json: { ok: true, grade: { guess: 'old scene', reason: 'old', fit: 100, recognition: 100, speed: 10, total: 210, elapsedMs: 60_000 }, state: { ...initial, finalUsed: true } } })
          staleRejected = true
          return route.fulfill({ json: { ok: false, reason: 'invalid_day', state: { ...fresh, status: 'not_started', best: 0 } } })
        }
        if (path.endsWith('/end')) {
          ends.push(route.request().postDataJSON())
          if (invalidAt === 'end') {
            staleRejected = true
            return route.fulfill({ status: 400, json: { error: 'invalid_attempt_day' } })
          }
          return route.fulfill({ json: { ...fresh, status: 'ended', best: 0 } })
        }
        return route.fulfill({ json: {} })
      })
      await page.goto(`${origin}/home`)
      await expect(page.getByTestId('daily-prompt')).toHaveText('Yesterday scene')
      await page.getByTestId('daily-done-button').click()
      await expect.poll(() => refreshes).toBeGreaterThanOrEqual(1)
      await expect(page.getByTestId('daily-prompt')).toHaveText('Yesterday scene')
      await expect(page.getByTestId('daily-done-button')).toBeDisabled()
      if (invalidAt === 'grade') expect(ends).toEqual([])
      else expect(ends).toMatchObject([{ day: yesterday }])
      expect(grades).toMatchObject([{ day: yesterday, kind: 'final' }])
      release()
      if (todayStatus === 'unavailable') {
        await expect(page.getByTestId('daily-grade-error')).toContainText('expired')
        await expect(page.getByTestId('daily-done-button')).toBeDisabled()
        await expect(page.getByTestId('daily-ask-button')).toBeDisabled()
      } else {
        await expect(page.getByTestId(`daily-${todayStatus.replace('_', '-')}`)).toBeVisible()
        if (todayStatus === 'playing') {
          await expect(page.getByTestId('daily-prompt')).toHaveText('Today scene')
          await expect(page.getByTestId('daily-done-button')).toBeEnabled()
          await expect(page.getByTestId('daily-ask-button')).toBeEnabled()
          await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
          await expect.poll(() => page.evaluate(day => localStorage.getItem(`daily:${day}:host`), today)).not.toBeNull()
        }
      }
      if (invalidAt === 'grade') expect(ends).toEqual([])
      else expect(ends).toMatchObject([{ day: yesterday }])
      expect(errors).toEqual([])
    })
  }
}
