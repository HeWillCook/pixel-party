import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Player statistics: the card on a player's wall and the dialog opened from the scores board.
// Every HTTP and WebSocket call is stubbed locally, like the other offline suites.

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const shotsDir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-21-feedback')
const user = { id: 'host', name: 'Offline host', email: 'host@example.test' }
const token = `fixture.${Buffer.from(JSON.stringify({ sub: user.id, name: user.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`

type SubscribeQuery = { collection: string; where?: Record<string, unknown> }
type RecordSource = unknown[] | ((query: SubscribeQuery) => unknown[])

const aliceStats = {
  userId: 'u1',
  name: 'Alice',
  avatarUrl: '',
  daily: {
    daysPlayed: 12,
    bestScore: 912,
    bestDay: '2026-11-17',
    averageScore: 801,
    currentStreak: 3,
    longestStreak: 7,
    medals: { gold: 2, silver: 1, bronze: 1 },
    topThree: 4,
  },
  party: { partyRounds: 9, partyGuessed: 4, teamWins: 2, gamesHosted: 3, pixelsPainted: 0, updatedAt: 1 },
}

function samplePaintingBase64() {
  const cells = new Uint8Array(32 * 32)
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && x < 32 && y >= 0 && y < 32) cells[y * 32 + x] = c
  }
  for (let y = 0; y < 20; y++) for (let x = 0; x < 32; x++) set(x, y, 11)
  for (let y = 24; y < 32; y++) for (let x = 0; x < 32; x++) set(x, y, 9)
  for (let y = 8; y < 18; y++) for (let x = 13; x < 19; x++) set(x, y, 1)
  return Buffer.from(cells).toString('base64')
}

async function setup(page: Page, records: RecordSource = []) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: { user, session: { id: 'offline', userId: user.id, expiresAt: '2096-01-01T00:00:00Z' } } })
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token } })
    if (url.pathname === '/api/stats/u1') return route.fulfill({ json: { stats: aliceStats } })
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
      if (message.type === 'core.subscribe') {
        const result = typeof records === 'function' ? records(message.payload.query as SubscribeQuery) : records
        socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId: message.payload.subscriptionId, records: result } }))
      }
    })
  })
}


const many = Array.from({ length: 30 }, (_, index) => ({
  recordId: `s${index}`,
  data: { day: '2026-11-17', userId: `u${index}`, displayName: `Painter ${String(index + 1).padStart(2, '0')}`, avatarUrl: '', score: 990 - index * 20, startedAt: index },
}))

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }, { width: 375, height: 667 }, { width: 812, height: 375 }, { width: 1980, height: 1240 }]) {
  test(`the scores board scrolls to the last of 30 players at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await setup(page, query => (query.collection === 'dailyScores' ? many : []))
    await page.goto(`${origin}/scores`)
    const rows = page.locator('.scores-list > li')
    await expect(rows).toHaveCount(30)
    const last = page.getByText('Painter 30', { exact: true })
    await expect(last).not.toBeInViewport()
    // Scroll the way a player does: the wheel over the board's list.
    const list = page.locator('.scores-list')
    await list.hover()
    for (let step = 0; step < 40; step++) await page.mouse.wheel(0, 400)
    await expect(last).toBeInViewport()
    await expect(page.getByText('Painter 01', { exact: true })).not.toBeInViewport()
    await mkdir(shotsDir, { recursive: true })
    await page.screenshot({ path: resolve(shotsDir, `scores-scrolled-${viewport.width}x${viewport.height}.png`) })
  })
}

// The rows must keep one size while the camera zooms porch -> scores -> porch: only the camera scale
// changes. A frame strip of untransformed sizes (offsetHeight/offsetWidth ignore the camera's scale)
// catches a row that snaps between a compact and a full size mid-move.
for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`scores rows keep one size through the zoom in and out at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await setup(page, query => (query.collection === 'dailyScores' ? many.slice(0, 8) : []))
    // A finished player: today's paintings arrive from the gated route a beat after the board, mid-zoom.
    const cells = samplePaintingBase64()
    await page.route('**/api/daily/me', route => route.fulfill({
      json: { day: '2026-11-17', status: 'ended', prompt: 'A lighthouse', autoUsed: 1, finalUsed: true, best: 990, windows: [], nextAutoAt: null, serverNow: Date.now(), lastCells: cells },
    }))
    await page.route('**/api/daily/today/drawings', async route => {
      await new Promise(resolve => setTimeout(resolve, 600))
      await route.fulfill({ json: { drawings: many.slice(0, 8).map(row => ({ data: { userId: row.data.userId, cells, guess: 'lighthouse' } })) } })
    })
    await page.goto(`${origin}/home`)
    await page.evaluate(() => {
      const samples: string[] = []
      ;(window as Window & { __rowSamples?: string[] }).__rowSamples = samples
      const tick = () => {
        // The /scores board (the porch's own chalkboard face is a separate, smaller board).
        const row = document.querySelector<HTMLElement>('.scores-page .scores-list > li')
        const slot = row?.querySelector<HTMLElement>('.scores-avatar')
        if (row && row.offsetHeight > 0) samples.push(`${row.offsetHeight}x${slot?.offsetWidth ?? 0}`)
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.getByRole('link', { name: 'Scores', exact: true }).first().click()
    await expect(page).toHaveURL(`${origin}/scores`)
    await expect(page.locator('.scores-page .scores-list > li')).toHaveCount(8)
    await page.waitForTimeout(1500)
    await page.getByTestId('scores-porch-button').click()
    await expect(page).toHaveURL(`${origin}/home`)
    await page.waitForTimeout(1500)
    const samples = await page.evaluate(() => (window as Window & { __rowSamples?: string[] }).__rowSamples ?? [])
    expect(samples.length).toBeGreaterThan(10)
    expect([...new Set(samples)]).toHaveLength(1)
  })
}

test('a finger swipe scrolls the phone board to the last of 30 players', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await setup(page, query => (query.collection === 'dailyScores' ? many : []))
  await page.goto(`${origin}/scores`)
  await expect(page.locator('.scores-page .scores-list > li')).toHaveCount(30)
  const last = page.getByText('Painter 30', { exact: true })
  await expect(last).not.toBeInViewport()
  const box = (await page.locator('.scores-page .scores-list').boundingBox())!
  const cdp = await context.newCDPSession(page)
  const x = box.x + box.width / 2
  for (let swipe = 0; swipe < 12 && !(await last.isVisible() && await last.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })); swipe++) {
    const top = box.y + 20
    const bottom = box.y + box.height - 20
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: bottom, id: 1 }] })
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: bottom - ((bottom - top) * step) / 8, id: 1 }] })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(150)
  }
  await expect(last).toBeInViewport()
  await context.close()
})
