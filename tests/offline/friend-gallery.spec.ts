import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// A friend's wall: today's painting is private until the day closes, so it comes from the gated
// `/api/daily/today/drawings` route — and only once BOTH the owner and the viewer have finished
// today's Daily. Every HTTP and WebSocket call is stubbed locally, like the other offline suites.

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const shotsDir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-21-feedback')
const user = { id: 'host', name: 'Offline host', email: 'host@example.test' }
const token = `fixture.${Buffer.from(JSON.stringify({ sub: user.id, name: user.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`

/** The app's own UTC day, so "today" in a fixture is the day the wall is asking about. */
const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - 86_400_000).toISOString().slice(0, 10)

type SubscribeQuery = { collection: string; where?: Record<string, unknown> }
type WebSocket = { send: (message: string) => void }

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

const aliceStats = {
  userId: 'u1',
  name: 'Alice',
  avatarUrl: '',
  daily: {
    daysPlayed: 12, bestScore: 912, bestDay: '2026-11-17', averageScore: 801,
    currentStreak: 3, longestStreak: 7, medals: { gold: 2, silver: 1, bronze: 1 }, topThree: 4,
  },
  party: { partyRounds: 9, partyGuessed: 4, teamWins: 2, gamesHosted: 3, pixelsPainted: 0, updatedAt: 1 },
}

interface Fixtures {
  /** Has Alice (the friend) ended today's Daily? */
  ended: boolean
  /** Does Alice have a painting from an earlier day on her wall? */
  pastPainting: boolean
}

interface Harness {
  /** Hits on the gated route (the wall must not ask when the viewer has not finished). */
  gated: number
  /** Alice's score row for today arrives as ended over the live subscription. */
  flipEnded: () => void
}

async function setup(page: Page, fixtures: Fixtures): Promise<Harness> {
  const cells = samplePaintingBase64()
  const state = { gated: 0 }
  const sockets: WebSocket[] = []

  // The catch-all first: Playwright runs the most recently registered route first, so the two
  // specific stubs below win over it.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: { user, session: { id: 'offline', userId: user.id, expiresAt: '2096-01-01T00:00:00Z' } } })
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token } })
    if (url.pathname === '/api/daily/me') return route.fulfill({ json: { day: today, status: 'not_started', autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: Date.now() } })
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} })
    const asset = url.pathname.startsWith('/assets/')
    const path = asset ? resolve(clientDir, `.${url.pathname}`) : resolve(clientDir, '_spa.html')
    const contentType = asset ? path.endsWith('.css') ? 'text/css' : path.endsWith('.woff2') ? 'font/woff2' : 'application/javascript' : 'text/html'
    return route.fulfill({ contentType, body: await readFile(path) })
  })
  page.route(url => url.origin === origin && url.pathname === '/api/stats/u1', route => route.fulfill({ json: { stats: aliceStats } }))
  page.route(url => url.origin === origin && url.pathname === '/api/daily/today/drawings', route => {
    const userId = new URL(route.request().url()).searchParams.get('userId')
    // Only the wall's own one-player call counts: the porch chalkboard asks for the whole day unfiltered.
    if (userId) state.gated += 1
    if (userId && userId !== 'u1') return route.fulfill({ json: { ok: true, drawings: [] } })
    return route.fulfill({ json: { ok: true, drawings: [{ recordId: 'd-today', data: { day: today, userId: 'u1', displayName: 'Alice', prompt: 'A lighthouse', cells, score: 900, guess: 'lighthouse', reason: 'A bright beacon.' } }] } })
  })

  function records(query: SubscribeQuery) {
    if (query.collection === 'profiles') return [{ recordId: 'profile-u1', data: { userId: 'u1', username: 'Alice' } }]
    if (query.collection === 'dailyScores') {
      if (query.where?.userId !== 'u1') return []
      const past = { recordId: 'score-past', data: { day: yesterday, userId: 'u1', displayName: 'Alice', score: 640, medal: 3, ended: 1 } }
      const todayScore = { recordId: 'score-today', data: { day: today, userId: 'u1', displayName: 'Alice', score: 900, medal: 0, ended: fixtures.ended ? 1 : 0 } }
      return [todayScore, past]
    }
    if (query.collection === 'dailyDrawings') {
      if (query.where?.userId !== 'u1' || !fixtures.pastPainting) return []
      return [{ recordId: 'd-past', data: { day: yesterday, userId: 'u1', displayName: 'Alice', prompt: 'A teacup', cells, score: 640, guess: 'teacup' } }]
    }
    return []
  }

  await page.routeWebSocket('**/ws/**', (socket) => {
    if (socket.url().includes('/ws/presence/')) return
    sockets.push(socket)
    socket.send(JSON.stringify({ type: 'user.info', payload: { role: 'member' } }))
    socket.onMessage((raw) => {
      if (raw === 'ping') return socket.send('pong')
      const message = JSON.parse(String(raw))
      if (message.type === 'user.list') socket.send(JSON.stringify({ type: 'user.list', payload: { users: [] } }))
      if (message.type === 'core.subscribe') {
        socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId: message.payload.subscriptionId, records: records(message.payload.query as SubscribeQuery) } }))
      }
    })
  })

  return {
    get gated() { return state.gated },
    flipEnded() {
      fixtures.ended = true
      // The wall's score query carries a limit, so the SDK re-subscribes on a change: the stub now
      // answers with `ended: 1`, exactly as the real room would after the owner's final judgement.
      for (const socket of sockets) {
        socket.send(JSON.stringify({
          type: 'core.record_change',
          payload: { collection: 'dailyScores', changeType: 'update', record: { recordId: 'score-today', data: { day: today, userId: 'u1', displayName: 'Alice', score: 900, medal: 0, ended: 1 } } },
        }))
      }
    },
  }
}

/** The viewer finished today's own Daily, so the gate lets their friend's painting through. */
async function viewerEnded(page: Page) {
  await page.route('**/api/daily/me', route => route.fulfill({
    json: { day: today, status: 'ended', prompt: 'A lighthouse', autoUsed: 0, asksUsed: 1, asksLeft: 2, finalUsed: true, best: 912, windows: [], nextAutoAt: null, serverNow: Date.now(), lastCells: samplePaintingBase64() },
  }))
}

test("a friend's wall shows today's painting once both players have finished the Daily", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const harness = await setup(page, { ended: true, pastPainting: true })
  await viewerEnded(page)
  await page.goto(`${origin}/u/u1`)

  // The private day came through the gated route, and the public past day through the live query.
  await expect(page.getByTestId(`gallery-frame-${today}`)).toBeVisible()
  await expect(page.getByTestId(`gallery-frame-${yesterday}`)).toBeVisible()
  await expect(page.getByTestId(`gallery-frame-${today}`).getByTestId('gallery-caption')).toContainText('900 / 1000')
  expect(harness.gated).toBe(1)
  // Not their own wall: no invitation to hang a first painting.
  await expect(page.getByTestId('gallery-empty')).toHaveCount(0)
  await expect(page.getByText('Your first painting hangs here')).toHaveCount(0)
})

test("a viewer who has not finished today's Daily gets a placeholder, and the gate is never asked", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const harness = await setup(page, { ended: true, pastPainting: true })
  await page.goto(`${origin}/u/u1`)

  const placeholder = page.getByTestId('gallery-pending-today')
  await expect(placeholder).toBeVisible()
  await expect(placeholder).toContainText("Finish today's Daily to see Alice's painting")
  await expect(placeholder.getByRole('link', { name: "Paint today's prompt" })).toHaveAttribute('href', '/home')
  // Their in-progress canvas is not on the wall, and the day's private gallery was not requested at all.
  await expect(page.getByTestId(`gallery-frame-${today}`)).toHaveCount(0)
  expect(harness.gated).toBe(0)
  // Past days are public and still hang.
  await expect(page.getByTestId(`gallery-frame-${yesterday}`)).toBeVisible()
})

test("the wall fills in when the friend's today row flips to ended over the live subscription", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const fixtures: Fixtures = { ended: false, pastPainting: true }
  const harness = await setup(page, fixtures)
  await viewerEnded(page)
  await page.goto(`${origin}/u/u1`)

  // They are still painting: nothing for today, and no reason to ask the gate.
  await expect(page.getByTestId(`gallery-frame-${yesterday}`)).toBeVisible()
  await expect(page.getByTestId('gallery-pending-today')).toHaveCount(0)
  await expect(page.getByTestId(`gallery-frame-${today}`)).toHaveCount(0)
  expect(harness.gated).toBe(0)

  harness.flipEnded()

  // No reload: the live score row says ended, so the wall asks for (and hangs) today's painting.
  await expect(page.getByTestId(`gallery-frame-${today}`)).toBeVisible()
  await expect(page.getByTestId(`gallery-frame-${today}`).getByTestId('gallery-caption')).toContainText('900 / 1000')
  expect(harness.gated).toBe(1)
})

test("a friend with no paintings gets their own empty wall, not the viewer's first-painting card", async ({ page }) => {
  await setup(page, { ended: false, pastPainting: false })
  await page.goto(`${origin}/u/u1`)

  const empty = page.getByTestId('gallery-empty')
  await expect(empty).toBeVisible()
  await expect(empty).toContainText("Alice hasn't hung a painting yet")
  await expect(empty).not.toContainText('Your first painting hangs here')
  await expect(page.getByText('Your first painting hangs here')).toHaveCount(0)
})

test('your own empty wall keeps its first-painting invitation', async ({ page }) => {
  await setup(page, { ended: false, pastPainting: false })
  await page.goto(`${origin}/u/host`)

  const empty = page.getByTestId('gallery-empty')
  await expect(empty).toBeVisible()
  await expect(empty).toContainText('Your first painting hangs here')
  await expect(empty.getByRole('link', { name: "Paint today's prompt" })).toHaveAttribute('href', '/home')
  await expect(empty).not.toContainText("hasn't hung a painting yet")
})

test('capture friend-gallery screenshots', async ({ page }) => {
  test.skip(process.env.SCREENSHOTS !== '1', 'Run with SCREENSHOTS=1 to capture the feedback screenshots')
  await mkdir(shotsDir, { recursive: true })

  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport)
    await setup(page, { ended: true, pastPainting: true })
    await viewerEnded(page)
    await page.goto(`${origin}/u/u1`)
    await expect(page.getByTestId(`gallery-frame-${today}`)).toBeVisible()
    await expect(page.getByTestId(`gallery-frame-${today}`).locator('.wall-frame__thumb')).toBeVisible()
    await page.waitForTimeout(350)
    await page.screenshot({ path: resolve(shotsDir, `friend-wall-today-${viewport.width}x${viewport.height}.png`), fullPage: true })
  }

  // A fresh page per viewport so the second pass starts from a viewer who has not painted today.
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    const fresh = await page.context().newPage()
    await fresh.setViewportSize(viewport)
    await setup(fresh, { ended: true, pastPainting: true })
    await fresh.goto(`${origin}/u/u1`)
    await expect(fresh.getByTestId('gallery-pending-today')).toBeVisible()
    await fresh.waitForTimeout(350)
    await fresh.screenshot({ path: resolve(shotsDir, `friend-wall-gate-${viewport.width}x${viewport.height}.png`), fullPage: true })
    await fresh.close()
  }
})
