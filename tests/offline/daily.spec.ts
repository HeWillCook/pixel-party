import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')

for (const askFirst of [false, true]) test(askFirst ? 'auto-grade fires at 2:00 after an ask at 1:30' : 'auto-grade fires at 2:00 without asks', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const startedAt = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt, endsAt: startedAt + 600_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], serverNow: startedAt, nextAutoAt: startedAt + 120_000 }
  const grades: { body: unknown; status: number }[] = []
  page.on('response', response => {
    const request = response.request()
    if (new URL(response.url()).pathname === '/api/daily/grade' && request.method() === 'POST') grades.push({ body: request.postDataJSON(), status: response.status() })
  })
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: { ...playing, status: 'not_started' } })
    if (path.endsWith('/start')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      const body = route.request().postDataJSON()
      if (body.kind === 'auto' && askFirst) return route.fulfill({ status: 200, json: { skipped: 'skipped_unchanged', window: 0, state: { ...playing, asksUsed: 1, asksLeft: 2, nextAutoAt: startedAt + 240_000, serverNow: startedAt + 120_000 } } })
      return route.fulfill({ status: 200, json: { ok: true, grade: { guess: 'tree', reason: 'tree', fit: 100, recognition: 100, speed: 10, total: 210, elapsedMs: 120_000 }, state: { ...playing, ...(body.kind === 'ask' ? { asksUsed: 1, asksLeft: 2, serverNow: startedAt + 90_000 } : { autoUsed: 1, nextAutoAt: startedAt + 240_000 }) } } })
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
  if (askFirst) {
    const notice = page.getByText('Auto-grade skipped: no changes since your last grade')
    await expect(notice).toBeVisible()
    await page.clock.fastForward(6_000)
    await expect(notice).toHaveCount(0)
  }
})

test('ended user never sees start', async ({ page }) => {
  await offlineClient(page, true)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/daily/me', async route => {
    await gate
    const now = Date.now()
    await route.fulfill({ json: { day: new Date(now).toISOString().slice(0, 10), status: 'ended', startedAt: now - 600_000, endsAt: now, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: now } })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-loading')).toBeVisible()
  for (let sample = 0; sample < 15; sample++) {
    await expect(page.getByTestId('daily-start-button')).toHaveCount(0)
    await page.waitForTimeout(100)
  }
  release()
  await expect(page.getByTestId('daily-ended')).toBeVisible()
})

test('me failure stays loading then recovers', async ({ page }) => {
  await offlineClient(page, true)
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/daily/me', async route => {
    calls++
    if (calls === 1) return route.fulfill({ status: 500, json: {} })
    await gate
    const now = Date.now()
    return route.fulfill({ json: { day: new Date(now).toISOString().slice(0, 10), status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 600_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 120_000, serverNow: now } })
  })
  await page.goto(`${origin}/home`)
  await expect.poll(() => calls).toBeGreaterThan(0)
  await expect(page.getByTestId('daily-loading')).toBeVisible()
  await expect(page.getByTestId('daily-start-button')).toHaveCount(0)
  release()
  await expect(page.getByTestId('daily-playing')).toBeVisible({ timeout: 12_000 })
})

test('no local canvas, no auto', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:02:10Z') })
  await offlineClient(page, true)
  let grades = 0
  const now = Date.parse('2026-11-17T12:02:10Z')
  await page.route('**/api/daily/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/grade')) grades++
    return route.fulfill({ json: { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now - 130_000, endsAt: now + 470_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: now - 10_000, serverNow: now } })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.clock.fastForward(10_000)
  expect(grades).toBe(0)
})

test('auto-grade fires on another route', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 600_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 120_000, serverNow: now }
  let auto = 0
  let sentCells = ''
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: { ...playing, status: 'not_started' } })
    if (path.endsWith('/start')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      if (route.request().postDataJSON().kind === 'auto') {
        auto++
        sentCells = route.request().postDataJSON().cells
      }
      return route.fulfill({ json: { skipped: 'skipped_unchanged', window: 0, state: { ...playing, nextAutoAt: now + 240_000 } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
  await page.getByRole('link', { name: 'Party mode', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Live Public Rooms' })).toBeVisible()
  const latestCells = await page.evaluate(() => {
    const cells = new Uint8Array(1024)
    cells[50] = 7
    const encoded = btoa(String.fromCharCode(...cells))
    localStorage.setItem('daily:2026-11-17:host', encoded)
    return encoded
  })
  await page.clock.fastForward(125_000)
  await expect.poll(() => auto).toBe(1)
  expect(sentCells).toBe(latestCells)
})

for (const action of ['exit confirm leaves to party', 'grade now and submit are separate'] as const) test(action, async ({ page }) => {
  await offlineClient(page, true)
  const now = Date.now()
  const windows = [120_000, 240_000, 360_000, 480_000].map((offset, index) => ({ index, dueAt: now + offset, status: 'pending', score: null, late: false }))
  const playing = { day: new Date(now).toISOString().slice(0, 10), status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 600_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows, nextAutoAt: now + 120_000, serverNow: now }
  let ends = 0
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) return route.fulfill({ json: { ok: true, grade: { guess: 'tree', reason: 'recognisable tree', fit: 300, recognition: 200, speed: 90, total: 590, elapsedMs: 10_000 }, state: { ...playing, asksUsed: 1, asksLeft: 2, best: 590 } } })
    if (path.endsWith('/end')) { ends++; return route.fulfill({ json: { ...playing, status: 'ended' } }) }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  if (action === 'exit confirm leaves to party') {
    await page.getByTestId('daily-exit').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Leave the easel?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Keep painting' }).click()
    await expect(page.getByTestId('daily-playing')).toBeVisible()
    await page.getByTestId('daily-exit').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Exit', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/party`)
    expect(ends).toBe(0)
  } else {
    await expect(page.getByTestId('daily-ask-button')).toHaveText(/Grade now \(3 left\)/)
    await expect(page.getByTestId('daily-done-button')).toHaveText(/Submit & finish/)
    await expect(page.getByTestId('daily-auto-timeline')).toContainText('2:00 in')
    await page.getByTestId('daily-ask-button').click()
    await expect(page.getByTestId('daily-playing')).toBeVisible()
    await expect(page.getByTestId('daily-ask-button')).toHaveText(/Grade now \(2 left\)/)
    await expect(page.getByTestId('daily-score-breakdown')).toContainText('Matches the prompt')
    await expect(page.getByTestId('daily-score-breakdown')).toContainText('Easy to recognise')
    await expect(page.getByTestId('grade-total')).toContainText('590 / 1000')
    expect(ends).toBe(0)
    await page.getByTestId('daily-done-button').click()
    await expect(page.getByTestId('daily-ended')).toBeVisible()
    expect(ends).toBe(1)
  }
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
  let meRequests = 0
  await page.route('**/api/daily/me', async route => { meRequests++; await route.fulfill({ json: {} }) })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-sign-in-button')).toBeVisible()
  await expect(page.getByTestId('daily-leaderboard').getByRole('heading', { name: 'Leaderboard' })).toBeVisible()
  await expect(page.getByTestId('daily-prompt')).toHaveCount(0)
  expect(meRequests).toBe(0)
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
      const initial = { day: yesterday, status: 'playing', prompt: 'Yesterday scene', startedAt: Date.now() - 60_000, endsAt: Date.now() + 540_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 123, windows: [], nextAutoAt: Date.now() + 60_000, serverNow: Date.now() }
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
