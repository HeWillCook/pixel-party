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

const scores = [
  { recordId: 's1', data: { day: '2026-11-17', userId: 'u1', displayName: 'Alice', avatarUrl: '', score: 912, bestElapsedMs: 28000, medal: 1 } },
  { recordId: 's2', data: { day: '2026-11-17', userId: 'u2', displayName: 'Bob', avatarUrl: '', score: 740, bestElapsedMs: 41000, medal: 2 } },
]

async function endedDay(page: Page, cells: string) {
  await page.route('**/api/daily/me', route => route.fulfill({
    json: { day: '2026-11-17', status: 'ended', prompt: 'A lighthouse', autoUsed: 0, asksUsed: 1, asksLeft: 2, finalUsed: true, best: 912, windows: [], nextAutoAt: null, serverNow: Date.now(), lastCells: cells },
  }))
  await page.route('**/api/daily/today/drawings', route => route.fulfill({
    json: {
      drawings: [
        { data: { userId: 'u1', cells, guess: 'lighthouse', reason: 'A bright beacon above the waves.' } },
        { data: { userId: 'u2', cells, guess: 'sailboat', reason: 'A hull with a mast.' } },
      ],
    },
  }))
}

function boardRecords(query: SubscribeQuery) {
  if (query.collection === 'dailyScores') return scores
  if (query.collection === 'dailyDrawings') {
    const cells = samplePaintingBase64()
    return [
      { recordId: 'd1', data: { day: '2026-11-17', userId: 'u1', displayName: 'Alice', prompt: 'A lighthouse', cells, score: 912, guess: 'lighthouse' } },
      { recordId: 'd2', data: { day: '2026-11-17', userId: 'u2', displayName: 'Bob', prompt: 'A lighthouse', cells, score: 740, guess: 'sailboat' } },
    ]
  }
  return []
}

test('a name on the scores board opens the stats card, and the thumbnail still opens the painting', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page, boardRecords)
  await endedDay(page, samplePaintingBase64())
  await page.goto(`${origin}/scores`)
  const board = page.getByTestId('scores-chalkboard')
  await expect(board.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/u/u1')

  const aliceName = board.locator('.scores-row-name', { hasText: 'Alice' })
  await aliceName.click()
  const dialog = page.getByTestId('player-stats-dialog')
  await expect(dialog).toBeVisible()
  const card = dialog.getByTestId('player-stats-card')
  await expect(card).toContainText('Alice')
  await expect(dialog.getByTestId('stats-days-played')).toHaveText('12')
  await expect(dialog.getByTestId('stats-best')).toContainText('912')
  await expect(dialog.getByTestId('stats-average')).toHaveText('801')
  await expect(dialog.getByTestId('stats-current-streak')).toHaveText('3')
  await expect(dialog.getByTestId('stats-longest-streak')).toHaveText('7')
  await expect(dialog.getByTestId('stats-top-three')).toHaveText('4')
  await expect(dialog.getByTestId('stats-medal-gold')).toContainText('2')
  await expect(dialog.getByTestId('stats-best-day')).toContainText('Nov 17, 2026')
  await expect(dialog.getByTestId('stats-party-rounds')).toHaveText('9')
  await expect(dialog.getByTestId('stats-team-wins')).toHaveText('2')
  await expect(dialog.getByRole('link', { name: 'See their gallery' })).toHaveAttribute('href', '/u/u1')

  // Escape closes the card and does not also leave the Scores page; the row has focus again.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(`${origin}/scores`)
  await expect(board.getByRole('link', { name: 'Alice' })).toBeFocused()

  // Keyboard activation of the row opens the same card.
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await page.getByTestId('player-stats-dialog').getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)

  // The avatar is the same target as the name.
  await board.locator('.scores-avatar').first().click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // The thumbnail is still the way into the painting, unchanged.
  await page.getByRole('button', { name: "View Alice's drawing" }).click()
  const viewer = page.getByTestId('drawing-viewer')
  await expect(viewer).toBeVisible()
  await expect(viewer).toContainText('Rank 1 · 912 / 1000')
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(page).toHaveURL(`${origin}/scores`)
})

test('the stats dialog fits a 375x812 phone without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await setup(page, boardRecords)
  await endedDay(page, samplePaintingBase64())
  await page.goto(`${origin}/scores`)
  await page.locator('.scores-row-name', { hasText: 'Alice' }).click()

  const dialog = page.getByTestId('player-stats-dialog')
  await expect(dialog).toBeVisible()
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(375)
  expect(box.y + box.height).toBeLessThanOrEqual(812)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await expect(dialog.getByTestId('stats-days-played')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(`${origin}/scores`)
})

test("a player's page shows the stats plaque on the deck, clear of the paintings", async ({ page }) => {
  const cells = samplePaintingBase64()
  await setup(page, (query) => {
    if (query.collection === 'dailyDrawings') {
      return [{ recordId: 'd1', data: { day: '2026-11-17', userId: 'u1', displayName: 'Alice', prompt: 'A lighthouse', cells, score: 912, guess: 'lighthouse' } }]
    }
    return []
  })

  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport)
    await page.goto(`${origin}/u/u1`)
    const plaque = page.getByTestId('gallery-stats-plaque')
    await expect(plaque).toBeVisible()
    const card = plaque.getByTestId('player-stats-card')
    await expect(card).toContainText('Alice')
    await expect(card.getByTestId('stats-days-played')).toHaveText('12')
    await expect(card.getByTestId('stats-current-streak')).toHaveText('3')
    await expect(card.getByTestId('stats-best-day')).toContainText('Nov 17, 2026')

    const plaqueBox = (await plaque.boundingBox())!
    expect(plaqueBox.x).toBeGreaterThanOrEqual(0)
    expect(plaqueBox.x + plaqueBox.width).toBeLessThanOrEqual(viewport.width)
    expect(plaqueBox.y + plaqueBox.height).toBeLessThanOrEqual(viewport.height)
    // The plaque is on the deck, below the lowest painting, not over the wall.
    const frame = page.getByTestId('gallery-frame-2026-11-17').locator('.wall-frame')
    const frameBox = (await frame.boundingBox())!
    expect(plaqueBox.y).toBeGreaterThanOrEqual(frameBox.y + frameBox.height - 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
  }
})

test('capture stats screenshots', async ({ page }) => {
  test.skip(process.env.SCREENSHOTS !== '1', 'Run with SCREENSHOTS=1 to capture the feedback screenshots')
  await mkdir(shotsDir, { recursive: true })
  await setup(page, boardRecords)
  await endedDay(page, samplePaintingBase64())

  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport)
    await page.goto(`${origin}/scores`)
    await page.locator('.scores-row-name', { hasText: 'Alice' }).click()
    const dialog = page.getByTestId('player-stats-dialog')
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(350)
    await page.screenshot({ path: resolve(shotsDir, `stats-dialog-${viewport.width}x${viewport.height}.png`), fullPage: true })

    await page.goto(`${origin}/u/u1`)
    await expect(page.getByTestId('gallery-stats-plaque')).toBeVisible()
    await expect(page.getByTestId('stats-days-played')).toBeVisible()
    await page.screenshot({ path: resolve(shotsDir, `player-page-${viewport.width}x${viewport.height}.png`), fullPage: true })
  }
})
