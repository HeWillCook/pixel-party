import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Feedback screenshots: the reshaped Party lobby (every open game, private ones locked) and the co-op
 * round-end celebration. Gated behind SCREENSHOTS=1 like the other capture specs.
 */

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const outDir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-21-feedback')
const user = { id: 'host', name: 'Offline host', email: 'host@example.test' }
const token = `fixture.${Buffer.from(JSON.stringify({ sub: user.id, name: user.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`

const rooms = [
  { id: 'r-1', name: "Will's Studio", hostId: 'host', mode: 'coop', status: 'playing', playerCount: 3, visibility: 'public', joinCode: 'QX3J' },
  { id: 'r-2', name: 'Sunset Cove', hostId: 'u2', mode: 'coop', status: 'lobby', playerCount: 2, visibility: 'public', joinCode: 'M9K2' },
  { id: 'r-3', name: 'Night Owls', hostId: 'u3', mode: 'coop', status: 'playing', playerCount: 4, visibility: 'public', joinCode: 'P4W8' },
  { id: 'r-4', name: 'Secret Club', hostId: 'u4', mode: 'coop', status: 'lobby', playerCount: 1, visibility: 'private', joinCode: null },
]

async function fixture(page: Page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: { user, session: { id: 'offline', userId: user.id, expiresAt: '2096-01-01T00:00:00Z' } } })
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token } })
    if (url.pathname === '/api/party/rooms') return route.fulfill({ json: { rooms } })
    if (url.pathname === '/api/daily/me') {
      const now = Date.now()
      return route.fulfill({ json: { day: new Date(now).toISOString().slice(0, 10), status: 'not_started', autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: now } })
    }
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
      if (raw === 'ping') { socket.send('pong'); return }
      const message = JSON.parse(String(raw))
      if (message.type === 'user.list') socket.send(JSON.stringify({ type: 'user.list', payload: { users: [] } }))
      if (message.type !== 'core.subscribe') return
      const records = message.payload.query.collection === 'rooms'
        ? [{ recordId: 'r-1', data: { name: "Will's Studio", mode: 'coop', visibility: 'public', joinCode: 'QX3J', hostId: 'host', status: 'playing', playerCount: 3 } }]
        : []
      socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId: message.payload.subscriptionId, records } }))
    })
  })
}

async function signIn(page: Page) {
  // Skip the cold-load auth boot motion so the captures are the settled page.
  await page.goto(`${origin}/party`)
  await expect(page.getByTestId('lobby-page')).toHaveAttribute('data-measured', '1')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`capture the party lobby at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.skip(process.env.SCREENSHOTS !== '1')
    await page.setViewportSize(viewport)
    await fixture(page)
    await signIn(page)
    await expect(page.getByTestId('games-list').getByTestId('room-card-QX3J')).toBeVisible()
    await expect(page.getByTestId('games-list').getByTestId('room-card-r-4')).toHaveAttribute('data-locked', '1')
    await mkdir(outDir, { recursive: true })
    await page.screenshot({ path: resolve(outDir, `party-lobby-${viewport.width}x${viewport.height}.png`), fullPage: true })
  })
}

const canvas = (() => {
  const cells = Buffer.alloc(1024)
  const paint = (x: number, y: number, color = 10) => { if (x >= 0 && x < 32 && y >= 0 && y < 32) cells[y * 32 + x] = color }
  // A little lighthouse: tower, lantern room and a beam across the sky.
  for (let y = 8; y < 27; y++) for (let x = 13; x <= 18; x++) paint(x, y, 16)
  for (let x = 12; x <= 19; x++) for (let y = 6; y <= 8; y++) paint(x, y, 4)
  for (let y = 10; y <= 14; y++) for (let x = 9; x <= 11; x++) paint(x, y, 4)
  paint(15, 7, 2); paint(16, 7, 2)
  for (let x = 2; x <= 8; x++) paint(x, 9, 2)
  for (let x = 21; x <= 27; x++) paint(x, 9, 2)
  for (let x = 5; x < 28; x++) { paint(x, 29, 13); paint(x, 30, 13) }
  return cells.toString('base64')
})()

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`capture the co-op round-end celebration at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.skip(process.env.SCREENSHOTS !== '1')
    await page.setViewportSize(viewport)
    await fixture(page)
    const now = Date.now()
    await page.routeWebSocket('**/api/pixel/**', socket => {
      socket.send(JSON.stringify({
        t: 'snapshot', mode: 'coop', width: 32, height: 32, cells: canvas,
        round: { id: 'round-1', word: 'lighthouse', state: 'intermission', startedAt: now - 96_000, endsAt: null, endedAt: now, askAvailableAt: 0, result: { outcome: 'won', contributorCount: 2 } },
        you: { userId: 'host' }, players: 2, watching: 0,
        roster: [{ userId: 'host', name: 'Offline host' }, { userId: 'pal', name: 'Pal' }], aiResting: false,
        judgements: [{ zone: 'all', guesses: ['lighthouse'], confidence: 0.92, matched: true, at: now - 4_000 }],
      }))
    })
    await page.goto(`${origin}/r/QX3J`)
    await expect(page.getByTestId('round-overlay')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(400)
    await mkdir(outDir, { recursive: true })
    await page.screenshot({ path: resolve(outDir, `party-round-end-${viewport.width}x${viewport.height}.png`) })
  })
}
