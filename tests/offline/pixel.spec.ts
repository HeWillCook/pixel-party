import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const fixtureUser = { id: 'host', name: 'Offline host', email: 'host@example.test' }
// Deliberately unsigned fixture, consumed only by the intercepted client APIs.
const fixtureToken = `fixture.${Buffer.from(JSON.stringify({ sub: fixtureUser.id, name: fixtureUser.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`

async function clientFixture(page: Page, options: { signedIn?: boolean; preflight?: () => Promise<void> } = {}) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: options.signedIn ? {
      user: fixtureUser, session: { id: 'offline-session', userId: 'host', expiresAt: '2096-01-01T00:00:00Z' },
    } : null })
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token: fixtureToken } })
    if (url.pathname.startsWith('/api/pixel/')) {
      await options.preflight?.()
      return route.fulfill({ status: 401, body: 'Unauthorized' })
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} })
    const asset = url.pathname.startsWith('/assets/')
    const path = asset ? resolve(clientDir, `.${url.pathname}`) : resolve(clientDir, '_spa.html')
    const contentType = asset
      ? path.endsWith('.css')
        ? 'text/css'
        : path.endsWith('.woff2')
          ? 'font/woff2'
          : path.endsWith('.woff')
            ? 'font/woff'
            : 'application/javascript'
      : 'text/html'
    return route.fulfill({ contentType, body: await readFile(path) })
  })
  await page.routeWebSocket('**/ws/**', socket => {
    if (socket.url().includes('/ws/presence/')) return
    socket.send(JSON.stringify({ type: 'user.info', payload: { role: 'member' } }))
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw))
      if (message.type === 'user.list') socket.send(JSON.stringify({ type: 'user.list', payload: { users: [] } }))
      if (message.type !== 'core.subscribe') return
      const { subscriptionId, query } = message.payload
      const records = query.collection === 'rooms' ? [{ recordId: 'room', data: {
        name: 'Offline party', mode: 'coop', visibility: 'private', joinCode: 'AB2Z', hostId: 'host', status: 'lobby', isDefaultBoard: false,
      } }] : []
      socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId, records } }))
    })
  })
  return errors
}

function snapshot(state: 'playing' | 'lobby') {
  return {
    t: 'snapshot', mode: 'coop', width: 32, height: 32, cells: Buffer.alloc(1024).toString('base64'),
    round: { id: state, word: state === 'playing' ? 'sun' : '', state, startedAt: Date.now(), endsAt: state === 'playing' ? Date.now() + 300000 : null, askAvailableAt: Date.now() + 10000 },
    you: { userId: 'host', cooldownUntil: 0 }, players: 1, roster: [{ userId: 'host', name: 'Offline host' }], aiResting: false,
  }
}

async function pixelColor(page: Page, x: number, y: number) {
  return page.getByTestId('pixel-canvas').evaluate((canvas: HTMLCanvasElement, point) =>
    [...canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data], { x, y })
}

test('signed-out private visitors never mount room content during a delayed preflight', async ({ page }) => {
  let release!: () => void
  const preflight = new Promise<void>(resolve => { release = resolve })
  const errors = await clientFixture(page, { preflight: () => preflight })
  await page.addInitScript(() => {
    const state = window as unknown as { roomContentMounted: boolean }
    state.roomContentMounted = false
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="pixel-canvas"], [data-testid="round-players"], [data-testid="room-lobby"]')) state.roomContentMounted = true
    }).observe(document, { childList: true, subtree: true })
  })
  await page.routeWebSocket('**/api/pixel/**', socket => socket.close({ code: 1008 }))
  await page.goto(`${origin}/r/AB2Z`)
  await expect(page.getByTestId('room-loading')).toBeVisible()
  await expect(page.getByTestId('pixel-canvas')).toHaveCount(0)
  release()
  await expect(page.getByTestId('room-error-unauthorized')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { roomContentMounted: boolean }).roomContentMounted)).toBe(false)
  expect(errors).toEqual([])
})

test('fast solo drag paints a solid optimistic stroke and sends a frame batch with targeted rollback', async ({ page }) => {
  const errors = await clientFixture(page, { signedIn: true })
  const sent: { x: number; y: number; c: number }[][] = []
  let server!: WebSocketRoute
  await page.routeWebSocket('**/api/pixel/**', socket => {
    server = socket
    socket.send(JSON.stringify(snapshot('playing')))
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw))
      if (message.t === 'place') sent.push(message.cells)
    })
  })
  await page.goto(`${origin}/r/AB2Z`)
  const canvas = page.getByTestId('pixel-canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const point = (x: number, y: number) => ({ x: box.x + box.width * (x + 0.5) / 32, y: box.y + box.height * (y + 0.5) / 32 })
  await canvas.dispatchEvent('pointerdown', { clientX: point(1, 1).x, clientY: point(1, 1).y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointermove', { clientX: point(20, 1).x, clientY: point(20, 1).y, pointerId: 1, pointerType: 'mouse', buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect.poll(() => sent.flat().length).toBe(20)
  expect(sent.some(cells => cells.length > 1)).toBe(true)
  expect(sent.flat().map(cell => cell.x)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  // The fixture has sent no acceptance yet: these are all optimistic pixels.
  for (let x = 1; x <= 20; x++) expect(await pixelColor(page, x, 1)).toEqual([239, 68, 68, 255])
  server.send(JSON.stringify({ t: 'reject', reason: 'rate_limited', x: 10, y: 1, retryAt: Date.now() + 17 }))
  await expect.poll(() => pixelColor(page, 10, 1)).toEqual([255, 255, 255, 255])
  expect(await pixelColor(page, 11, 1)).toEqual([239, 68, 68, 255])
  expect(errors).toEqual([])
})

test('private lobby shows code and roster, copies full link, and host can start solo', async ({ page }) => {
  const errors = await clientFixture(page, { signedIn: true })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as unknown as { copiedLink: string }).copiedLink = text } } })
  })
  await page.routeWebSocket('**/api/pixel/**', socket => {
    socket.send(JSON.stringify(snapshot('lobby')))
    socket.onMessage(raw => { if (JSON.parse(String(raw)).t === 'next') socket.send(JSON.stringify(snapshot('playing'))) })
  })
  await page.goto(`${origin}/r/ab2z`)
  await expect(page.getByTestId('room-lobby')).toBeVisible()
  await expect(page.getByTestId('room-code')).toHaveText('AB2Z')
  await expect(page.getByRole('list', { name: 'Connected players' })).toContainText('Offline host')
  await expect(page.getByTestId('pixel-canvas')).toHaveCount(0)
  await page.getByTestId('copy-room-link').click()
  expect(await page.evaluate(() => (window as unknown as { copiedLink: string }).copiedLink)).toBe(`${origin}/r/AB2Z`)
  await page.getByTestId('host-start-button').click()
  await expect(page.getByTestId('room-lobby')).toHaveCount(0)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  expect(errors).toEqual([])
})

test('public spectators retain click-to-sign-in and never send placements', async ({ page }) => {
  const errors = await clientFixture(page)
  const placements: unknown[] = []
  await page.routeWebSocket('**/api/pixel/**', socket => {
    const state = snapshot('playing')
    socket.send(JSON.stringify({ ...state, you: { userId: null, cooldownUntil: 0 }, players: 0, roster: [] }))
    socket.onMessage(raw => { if (JSON.parse(String(raw)).t === 'place') placements.push(raw) })
  })
  await page.goto(`${origin}/r/play`)
  await page.getByTestId('pixel-canvas').click()
  await expect(page.getByRole('heading', { name: 'Sign in to DeepSpace' })).toBeVisible()
  expect(placements).toEqual([])
  expect(errors).toEqual([])
})

test('switching from a public board to a private invite clears the previous room before effects resolve', async ({ page }) => {
  let release!: () => void
  const preflight = new Promise<void>(resolve => { release = resolve })
  const errors = await clientFixture(page, { preflight: () => preflight })
  await page.routeWebSocket('**/api/pixel/**', socket => {
    if (new URL(socket.url()).pathname.includes('/play/')) {
      socket.send(JSON.stringify({ ...snapshot('playing'), you: { userId: null, cooldownUntil: 0 } }))
    } else socket.close({ code: 1008 })
  })
  await page.goto(`${origin}/r/play`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  // Same mounted route component: exercise its identity/scope reset without reloading the app.
  await page.evaluate(() => {
    history.pushState({}, '', '/r/AB2Z')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByTestId('room-loading')).toBeVisible()
  await expect(page.getByTestId('pixel-canvas')).toHaveCount(0)
  release()
  await expect(page.getByTestId('room-error-unauthorized')).toBeVisible()
  expect(errors).toEqual([])
})

test('banner-aware canvas sizing keeps palette inside 1280x720 with spectator banner and reject notice, and renders room name', async ({ page }) => {
  const errors = await clientFixture(page)
  let server!: WebSocketRoute
  await page.routeWebSocket('**/api/pixel/**', socket => {
    server = socket
    const state = snapshot('playing')
    socket.send(JSON.stringify({ ...state, you: { userId: null, cooldownUntil: 0 }, players: 1, watching: 2, roster: [{ userId: 'host', name: 'Offline host' }] }))
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`${origin}/r/AB2Z`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  await expect(page.getByTestId('room-name')).toHaveText('Offline party')
  await expect(page.getByTestId('spectator-banner')).toBeVisible()

  server.send(JSON.stringify({ t: 'reject', reason: 'not_signed_in' }))
  await expect(page.getByTestId('reject-notice')).toBeVisible()

  await expect.poll(async () => {
    return page.evaluate(() => {
      const palette = document.querySelector('[data-testid="palette"]')!.getBoundingClientRect()
      return palette.bottom
    })
  }).toBeLessThanOrEqual(720)

  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="pixel-canvas"]')!.getBoundingClientRect()
    const palette = document.querySelector('[data-testid="palette"]')!.getBoundingClientRect()
    return { canvasWidth: canvas.width, canvasBottom: canvas.bottom, paletteBottom: palette.bottom }
  })
  console.log('1280x720 banner-case metrics:', JSON.stringify(metrics))
  expect(metrics.canvasBottom).toBeLessThanOrEqual(720)
  expect(metrics.paletteBottom).toBeLessThanOrEqual(720)
  expect(errors).toEqual([])
})
