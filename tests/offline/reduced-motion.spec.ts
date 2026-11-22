import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const user = { id: 'host', name: 'Offline host', email: 'host@example.test' }
const token = `fixture.${Buffer.from(JSON.stringify({ sub: user.id, name: user.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`
const profile = { userId: user.id, username: 'OfflineHost', onboardedAt: 1, usernameChangedAt: 1 }

async function setup(page: Page, options: { signedOut?: boolean; playing?: boolean } = {}) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') {
      return route.fulfill({ json: options.signedOut ? null : { user, session: { id: 'offline', userId: user.id, expiresAt: '2096-01-01T00:00:00Z' } } })
    }
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token: options.signedOut ? null : token } })
    if (url.pathname === '/api/daily/me') {
      const now = Date.now()
      const playing = Boolean(options.playing)
      return route.fulfill({
        json: {
          day: new Date(now).toISOString().slice(0, 10),
          status: playing ? 'playing' : 'not_started',
          autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: playing, best: 0,
          windows: [], nextAutoAt: playing ? now + 60_000 : null, serverNow: now, loaded: true,
          ...(playing ? { prompt: 'A lighthouse', startedAt: now - 30_000, endsAt: now + 270_000, lastCells: '' } : {}),
        },
      })
    }
    if (url.pathname === '/api/profile/me') return route.fulfill({ json: { profile } })
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} })
    const asset = url.pathname.startsWith('/assets/')
    const path = asset ? resolve(clientDir, `.${url.pathname}`) : resolve(clientDir, '_spa.html')
    const contentType = asset
      ? path.endsWith('.css') ? 'text/css' : path.endsWith('.woff2') ? 'font/woff2' : 'application/javascript'
      : 'text/html'
    return route.fulfill({ contentType, body: await readFile(path) })
  })
  await page.routeWebSocket('**/ws/**', (socket) => {
    if (socket.url().includes('/ws/presence/')) return
    socket.send(JSON.stringify({ type: 'user.info', payload: { role: 'member' } }))
    socket.onMessage((raw) => {
      if (raw === 'ping') return socket.send('pong')
      const message = JSON.parse(String(raw))
      if (message.type === 'user.list') socket.send(JSON.stringify({ type: 'user.list', payload: { users: [] } }))
      if (message.type !== 'core.subscribe') return
      socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId: message.payload.subscriptionId, records: [] } }))
    })
  })
}

const notice = (page: Page) => page.getByTestId('reduced-motion-notice')

test('with reduced motion on, the porch explains the skipped moves once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page, { signedOut: true })
  await page.goto(`${origin}/home`)
  await expect(notice(page)).toBeVisible()
  await expect(notice(page)).toContainText('Reduced motion is on')
  await expect(notice(page)).toHaveAttribute('role', 'status')
  if (process.env.RM_SHOTS) await page.screenshot({ path: `${process.env.RM_SHOTS}/notice-1440.png` })

  await notice(page).getByRole('button', { name: 'Got it' }).click()
  await expect(notice(page)).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('nav-sign-in-button')).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
})

test('on a phone the notice sits clear of the bottom dock', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: 812 })
  await setup(page, { signedOut: true })
  await page.goto(`${origin}/home`)
  await expect(notice(page)).toBeVisible()
  const box = await notice(page).boundingBox()
  const dock = await page.locator('.porch-dock').boundingBox()
  expect(box && dock && box.y + box.height <= dock.y).toBe(true)
  expect(box && box.x >= 16 && box.x + box.width <= 375 - 16).toBe(true)
  if (process.env.RM_SHOTS) await page.screenshot({ path: `${process.env.RM_SHOTS}/notice-375.png` })
})

test('without reduced motion the notice never appears', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await setup(page, { signedOut: true })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('nav-sign-in-button')).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
})

test('a Daily attempt in progress is never covered by the notice', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page, { playing: true })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
})
