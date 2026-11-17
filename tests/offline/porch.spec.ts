import { expect, test, type Page } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const user = { id: 'host', name: 'Offline host', email: 'host@example.test' }
const token = `fixture.${Buffer.from(JSON.stringify({ sub: user.id, name: user.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`

async function setup(page: Page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: { user, session: { id: 'offline', userId: user.id, expiresAt: '2096-01-01T00:00:00Z' } } })
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token } })
    if (url.pathname === '/api/daily/me') return route.fulfill({ json: { day: '2026-11-17', status: 'not_started', autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: Date.now() } })
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} })
    const asset = url.pathname.startsWith('/assets/')
    const path = asset ? resolve(clientDir, `.${url.pathname}`) : resolve(clientDir, '_spa.html')
    const contentType = asset ? path.endsWith('.css') ? 'text/css' : path.endsWith('.woff2') ? 'font/woff2' : 'application/javascript' : 'text/html'
    return route.fulfill({ contentType, body: await readFile(path) })
  })
  await page.routeWebSocket('**/ws/**', (socket) => {
    if (socket.url().includes('/ws/presence/')) return
    socket.send(JSON.stringify({ type: 'user.info', payload: { role: 'member' } }))
    socket.onMessage((raw) => {
      if (raw === 'ping') return socket.send('pong')
      const message = JSON.parse(String(raw))
      if (message.type === 'user.list') socket.send(JSON.stringify({ type: 'user.list', payload: { users: [] } }))
      if (message.type === 'core.subscribe') socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId: message.payload.subscriptionId, records: [] } }))
    })
  })
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 812 }]) {
  test(`sign beam has four signs at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await setup(page)
    await page.goto(`${origin}/party`)
    if (viewport.width < 768) await page.getByRole('button', { name: 'Toggle menu' }).click()
    const nav = page.getByTestId('app-navigation')
    for (const label of ['Daily', 'Party', 'Scores', 'Gallery']) {
      const sign = nav.getByRole('link', { name: label, exact: true })
      await expect(sign).toBeVisible()
      const bounds = await sign.boundingBox()
      expect(bounds!.width).toBeGreaterThanOrEqual(44)
      expect(bounds!.height).toBeGreaterThanOrEqual(44)
    }
    await expect(nav.getByRole('link', { name: 'Party', exact: true })).toHaveAttribute('aria-current', 'page')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('mailbox menu provides account actions', async ({ page }) => {
  await setup(page)
  await page.goto(`${origin}/party`)
  await page.getByRole('button', { name: 'Account menu' }).click()
  for (const name of ['My gallery', 'Settings', 'Sign out']) await expect(page.getByRole('menuitem', { name })).toBeVisible()
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 }]) {
  for (const route of ['party', 'settings']) {
    test(`capture ${route} ${viewport.width}`, async ({ page }) => {
      test.skip(process.env.SCREENSHOTS !== '1')
      await page.setViewportSize(viewport)
      await setup(page)
      await page.goto(`${origin}/${route}`)
      await expect(page.getByTestId('app-navigation')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const dir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-18-porch')
      await mkdir(dir, { recursive: true })
      await page.screenshot({ path: resolve(dir, `${route}-${viewport.width}x${viewport.height}.png`), fullPage: true })
    })
  }
}
