import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// The Daily leaderboard opens a painting full size when its thumbnail is tapped. These tests drive the
// real /scores page with every HTTP and WebSocket call stubbed locally (the same pattern as the other
// offline suites), so no dev server, account or credentials are involved.

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const user = { id: 'host', name: 'Offline host', email: 'host@example.test' }
const token = `fixture.${Buffer.from(JSON.stringify({ sub: user.id, name: user.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`

type SubscribeQuery = { collection: string; where?: Record<string, unknown> }
type RecordSource = unknown[] | ((query: SubscribeQuery) => unknown[])

function samplePaintingBase64() {
  const cells = new Uint8Array(32 * 32)
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && x < 32 && y >= 0 && y < 32) cells[y * 32 + x] = c
  }
  const fillRect = (x0: number, y0: number, w: number, h: number, c: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c)
  }
  fillRect(0, 0, 32, 20, 11)
  fillRect(4, 3, 2, 2, 15)
  fillRect(0, 24, 32, 8, 9)
  fillRect(13, 4, 6, 4, 1)
  fillRect(14, 5, 4, 2, 6)
  return Buffer.from(cells).toString('base64')
}

async function setup(page: Page, records: RecordSource = []) {
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
      if (message.type === 'core.subscribe') {
        const result = typeof records === 'function' ? records(message.payload.query as SubscribeQuery) : records
        socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId: message.payload.subscriptionId, records: result } }))
      }
    })
  })
}

/** An ended day: the board is finished, so today's paintings are on show. */
async function endedDay(page: Page, cells: string) {
  await page.route('**/api/daily/me', route => route.fulfill({
    json: { day: '2026-11-17', status: 'ended', prompt: 'A lighthouse', autoUsed: 0, asksUsed: 1, asksLeft: 2, finalUsed: true, best: 912, windows: [], nextAutoAt: null, serverNow: Date.now(), lastCells: cells },
  }))
}

const scores = [
  { recordId: 's1', data: { day: '2026-11-17', userId: 'u1', displayName: 'Alice', avatarUrl: '', score: 912, bestElapsedMs: 28000, medal: 1 } },
  { recordId: 's2', data: { day: '2026-11-17', userId: 'u2', displayName: 'Bob', avatarUrl: '', score: 740, bestElapsedMs: 41000, medal: 2 } },
  { recordId: 's3', data: { day: '2026-11-17', userId: 'u3', displayName: 'Cara', avatarUrl: '', score: 580, bestElapsedMs: 55000, medal: 3 } },
]

test("a painter's thumbnail opens the drawing full size, steps and closes, and gives focus back", async ({ page }) => {
  const cells = samplePaintingBase64()
  await setup(page, (query) => (query.collection === 'dailyScores' ? scores : []))
  await endedDay(page, cells)
  await page.route('**/api/daily/today/drawings', route => route.fulfill({
    json: {
      drawings: [
        { data: { userId: 'u1', cells, guess: 'lighthouse', reason: 'A bright beacon above the waves.' } },
        { data: { userId: 'u2', cells, guess: 'sailboat', reason: 'A hull with a mast.' } },
        { data: { userId: 'u3', cells, guess: 'campfire', reason: 'Flames above logs.' } },
      ],
    },
  }))

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${origin}/scores`)
  const board = page.getByTestId('scores-chalkboard')
  await expect(board).toBeVisible()

  // Every visible row's thumbnail is a focusable button labelled after its painter, and the row link is untouched.
  await expect(page.getByTestId('leaderboard-thumb-button')).toHaveCount(3)
  const aliceThumb = page.getByRole('button', { name: "View Alice's drawing" })
  await expect(aliceThumb).toBeVisible()
  await expect(board.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/u/u1')
  // The button sits exactly over the row's thumbnail slot: the rows keep the layout they had.
  const slotBox = (await board.locator('.scores-thumb-slot').first().boundingBox())!
  const thumbBox = (await aliceThumb.boundingBox())!
  expect(Math.abs(thumbBox.x - slotBox.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(thumbBox.y - slotBox.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(thumbBox.width - slotBox.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(thumbBox.height - slotBox.height)).toBeLessThanOrEqual(1)

  await aliceThumb.click()
  const viewer = page.getByTestId('drawing-viewer')
  await expect(viewer).toBeVisible()
  await expect(viewer).toContainText('Alice')
  await expect(viewer).toContainText('Rank 1 · 912 / 1000')
  await expect(viewer).toContainText('lighthouse')
  await expect(viewer).toContainText('A bright beacon above the waves.')

  // Large and crisp: a 32x32 canvas drawn at ~420 CSS pixels with nearest-neighbour sampling.
  const art = viewer.getByRole('img', { name: 'Pixel drawing' })
  await expect(art).toBeVisible()
  await expect(art).toHaveCSS('image-rendering', 'pixelated')
  const artBox = (await art.boundingBox())!
  expect(artBox.width).toBeGreaterThanOrEqual(400)
  expect(artBox.width).toBeLessThanOrEqual(440)
  expect(Math.abs(artBox.width - artBox.height)).toBeLessThanOrEqual(1)

  // Previous/next step through exactly the rows that have drawings, keeping the painting on screen.
  await page.getByTestId('drawing-viewer-next').click()
  await expect(viewer).toContainText('Bob')
  await expect(viewer).toContainText('sailboat')
  await expect(viewer).toContainText('2 / 3')
  await page.getByTestId('drawing-viewer-prev').click()
  await expect(viewer).toContainText('Alice')
  await expect(viewer).toContainText('1 / 3')

  // The arrow keys do the same, and wrap round.
  await page.keyboard.press('ArrowLeft')
  await expect(viewer).toContainText('Cara')
  await expect(viewer).toContainText('3 / 3')
  await page.keyboard.press('ArrowRight')
  await expect(viewer).toContainText('Alice')
  await page.keyboard.press('ArrowRight')
  await expect(viewer).toContainText('Bob')

  // Escape closes the painting (and does not also leave the Scores page for the porch).
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(page).toHaveURL(`${origin}/scores`)
  await expect(page.getByRole('button', { name: "View Bob's drawing" })).toBeFocused()

  // The backdrop closes it too, and the thumbnail comes back with focus.
  await aliceThumb.click()
  await expect(viewer).toBeVisible()
  await page.mouse.click(8, 8)
  await expect(viewer).toHaveCount(0)
  await expect(aliceThumb).toBeFocused()

  // The close button is the third way out.
  await aliceThumb.click()
  await expect(viewer).toBeVisible()
  await page.getByTestId('drawing-viewer-close').click()
  await expect(viewer).toHaveCount(0)
  await expect(aliceThumb).toBeFocused()
})

test('the viewer never shows a painting the board is still hiding', async ({ page }) => {
  const cells = samplePaintingBase64()
  await setup(page, (query) => {
    if (query.collection === 'dailyDrawings' && query.where?.day === '2026-11-17') return [{ recordId: 'd1', data: { day: '2026-11-17', userId: 'u1', cells, guess: 'lighthouse', reason: 'A bright beacon above the waves.' } }]
    if (query.collection === 'dailyDrawings' && query.where?.day === '2026-11-16') return [{ recordId: 'd0', data: { day: '2026-11-16', userId: 'u4', cells, guess: 'windmill' } }]
    if (query.collection === 'dailyScores') {
      return query.where?.day === '2026-11-16'
        ? [{ recordId: 's0', data: { day: '2026-11-16', userId: 'u4', displayName: 'Dana', avatarUrl: '', score: 950, bestElapsedMs: 20000, medal: 1 } }]
        : scores
    }
    return []
  })
  // The day is still open: today's paintings stay hidden until the viewer has finished their own attempt.
  await page.route('**/api/daily/me', route => route.fulfill({
    json: { day: '2026-11-17', status: 'not_started', autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: Date.now() },
  }))
  await page.route('**/api/daily/today/drawings', route => route.fulfill({ json: { drawings: [{ data: { userId: 'u1', cells, guess: 'lighthouse' } }] } }))

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${origin}/scores`)
  const board = page.getByTestId('scores-chalkboard')
  await expect(board.getByRole('link', { name: 'Alice' })).toBeVisible()
  await expect(board.getByRole('img', { name: 'Pixel drawing' })).toHaveCount(0)
  await expect(page.getByTestId('leaderboard-thumb-button')).toHaveCount(0)
  await expect(page.getByTestId('drawing-viewer')).toHaveCount(0)

  // A past day's paintings are public, and there the same tapping works.
  await board.getByRole('button', { name: 'Previous day' }).click()
  await expect(board.getByRole('link', { name: 'Dana' })).toBeVisible()
  await expect(page.getByTestId('leaderboard-thumb-button')).toHaveCount(1)
  await page.getByRole('button', { name: "View Dana's drawing" }).click()
  await expect(page.getByTestId('drawing-viewer')).toContainText('Dana')
  await expect(page.getByTestId('drawing-viewer')).toContainText('windmill')
})

test('the full-size viewer fits a 375x812 phone without overflow', async ({ page }) => {
  const cells = samplePaintingBase64()
  await setup(page, (query) => (query.collection === 'dailyScores' ? scores : []))
  await endedDay(page, cells)
  await page.route('**/api/daily/today/drawings', route => route.fulfill({
    json: {
      drawings: [
        { data: { userId: 'u1', cells, guess: 'lighthouse', reason: 'A bright beacon above the waves.' } },
        { data: { userId: 'u2', cells, guess: 'sailboat' } },
      ],
    },
  }))

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${origin}/scores`)
  const board = page.getByTestId('scores-chalkboard')
  const thumb = page.getByRole('button', { name: "View Alice's drawing" })
  await expect(thumb).toBeVisible()
  // On a phone the 48px thumbnail still sits exactly in its slot.
  const mobileSlot = (await board.locator('.scores-thumb-slot').first().boundingBox())!
  const mobileThumb = (await thumb.boundingBox())!
  expect(Math.abs(mobileThumb.x - mobileSlot.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(mobileThumb.width - mobileSlot.width)).toBeLessThanOrEqual(1)
  await thumb.click()

  const viewer = page.getByTestId('drawing-viewer')
  await expect(viewer).toBeVisible()
  const box = (await viewer.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(375)
  expect(box.y + box.height).toBeLessThanOrEqual(812)

  // Nearly the whole phone's width, still one pixel per cell.
  const art = viewer.getByRole('img', { name: 'Pixel drawing' })
  const artBox = (await art.boundingBox())!
  expect(artBox.width).toBeGreaterThanOrEqual(280)
  expect(artBox.width).toBeLessThanOrEqual(330)

  const close = page.getByTestId('drawing-viewer-close')
  // The dialog is still zooming in for its first frames: wait for the 44px target to settle.
  await expect.poll(async () => (await close.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  const closeBox = (await close.boundingBox())!
  expect(closeBox.width).toBeGreaterThanOrEqual(44)
  expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(812)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

  await expect(page.getByTestId('drawing-viewer-next')).toBeVisible()
  await page.getByTestId('drawing-viewer-next').click()
  await expect(viewer).toContainText('Bob')
  await close.click()
  await expect(viewer).toHaveCount(0)
})
