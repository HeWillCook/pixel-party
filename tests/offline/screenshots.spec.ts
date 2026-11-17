import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test.skip(process.env.SCREENSHOTS !== '1', 'Run with SCREENSHOTS=1 to capture redesign screenshots')

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const screenshotsDir = resolve(
  import.meta.dirname,
  '../../docs/superpowers/screenshots/2026-11-17-redesign',
)
const fixtureUser = { id: 'host', name: 'Will', email: 'will@example.test' }
const fixtureToken = `fixture.${Buffer.from(
  JSON.stringify({ sub: fixtureUser.id, name: fixtureUser.name, exp: 4_000_000_000 }),
).toString('base64url')}.unsigned`

function lighthouseCells(): string {
  const cells = new Uint8Array(32 * 32)
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && x < 32 && y >= 0 && y < 32) cells[y * 32 + x] = c
  }
  const fillRect = (x0: number, y0: number, w: number, h: number, c: number) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) set(x, y, c)
    }
  }
  // Sky
  fillRect(0, 0, 32, 20, 11)
  // Stars
  fillRect(4, 3, 2, 2, 15)
  set(25, 5, 15)
  set(20, 2, 15)
  // Sea
  fillRect(0, 24, 32, 8, 9)
  for (let i = 0; i < 32; i += 4) fillRect(i, 26, 2, 1, 10)
  // Ground
  fillRect(0, 21, 32, 3, 14)
  // Tower stripes
  for (let r = 0; r < 14; r++) {
    const w = 6 + Math.floor(r / 3)
    const c = Math.floor(r / 3) % 2 ? 0 : 4
    fillRect(16 - Math.floor(w / 2), 8 + r, w, 1, c)
  }
  // Lantern room
  fillRect(13, 4, 6, 4, 1)
  fillRect(14, 5, 4, 2, 6)
  // Light beam
  for (let x = 18; x < 32; x++) {
    const spread = Math.floor((x - 18) / 3) + 1
    fillRect(x, 5 - spread, 1, spread * 2 + 1, 15)
  }
  // Roof
  fillRect(12, 3, 8, 1, 4)
  fillRect(15, 2, 2, 1, 4)
  return Buffer.from(cells).toString('base64')
}

async function setupClient(page: Page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') {
      return route.fulfill({
        json: {
          user: fixtureUser,
          session: { id: 'offline-session', userId: 'host', expiresAt: '2096-01-01T00:00:00Z' },
        },
      })
    }
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token: fixtureToken } })
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

  await page.routeWebSocket('**/ws/**', (socket) => {
    if (socket.url().includes('/ws/presence/')) return
    socket.send(JSON.stringify({ type: 'user.info', payload: { role: 'member' } }))
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw))
      if (message.type === 'user.list') {
        socket.send(
          JSON.stringify({
            type: 'user.list',
            payload: {
              users: [
                { id: 'host', name: 'Will' },
                { id: 'u2', name: 'Alex' },
                { id: 'u3', name: 'Sam' },
              ],
            },
          }),
        )
      }
      if (message.type !== 'core.subscribe') return
      const { subscriptionId, query } = message.payload
      if (query.collection === 'rooms') {
        socket.send(
          JSON.stringify({
            type: 'core.query_result',
            payload: {
              subscriptionId,
              records: [
                {
                  recordId: 'room',
                  data: {
                    name: "Will's Room",
                    mode: 'coop',
                    visibility: 'public',
                    joinCode: 'QX3J',
                    hostId: 'host',
                    status: 'playing',
                    isDefaultBoard: false,
                  },
                },
              ],
            },
          }),
        )
      } else if (query.collection === 'rounds') {
        socket.send(
          JSON.stringify({
            type: 'core.query_result',
            payload: {
              subscriptionId,
              records: [
                {
                  recordId: 'round-1',
                  data: {
                    roomId: 'room',
                    roundId: 'round-1',
                    word: 'LIGHTHOUSE',
                    outcome: 'won',
                    score: 840,
                    pixelsUsed: 87,
                    contributorIds: ['host', 'u2', 'u3'],
                    finalGuesses: ['lighthouse', 'tower'],
                  },
                },
              ],
            },
          }),
        )
      } else {
        socket.send(
          JSON.stringify({
            type: 'core.query_result',
            payload: { subscriptionId, records: [] },
          }),
        )
      }
    })
  })
}

test('capture playing room at 1440x900, 1280x720, 375x812, lobby and overlay at 1440x900', async ({
  page,
}) => {
  await mkdir(screenshotsDir, { recursive: true })
  await setupClient(page)

  let server!: WebSocketRoute
  await page.routeWebSocket('**/api/pixel/**', (socket) => {
    server = socket
    const now = Date.now()
    socket.send(
      JSON.stringify({
        t: 'snapshot',
        mode: 'coop',
        width: 32,
        height: 32,
        cells: lighthouseCells(),
        round: {
          id: 'round-1',
          word: 'LIGHTHOUSE',
          state: 'playing',
          startedAt: now - 15_000,
          endsAt: now + 42_000,
          askAvailableAt: now - 1_000,
        },
        you: { userId: 'host', cooldownUntil: 0 },
        players: 3,
        watching: 2,
        roster: [
          { userId: 'host', name: 'Will' },
          { userId: 'u2', name: 'Alex' },
          { userId: 'u3', name: 'Sam' },
        ],
        aiResting: false,
      }),
    )
    socket.send(
      JSON.stringify({
        t: 'judgement',
        zone: 'all',
        guesses: ['tower', 'rocket?'],
        confidence: 0.45,
        matched: false,
      }),
    )
    socket.send(
      JSON.stringify({
        t: 'round',
        round: {
          id: 'round-1',
          word: 'LIGHTHOUSE',
          state: 'playing',
          startedAt: now - 30_000,
          endsAt: now + 42_000,
          askAvailableAt: now - 1_000,
        },
      }),
    )
    socket.send(
      JSON.stringify({
        t: 'judgement',
        zone: 'all',
        guesses: ['lighthouse', 'tower'],
        confidence: 0.92,
        matched: false,
      }),
    )
  })

  // 1. Playing at 1440x900
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${origin}/r/QX3J`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  await expect(page.getByTestId('guess-list')).toContainText('lighthouse, tower')
  await page.evaluate(() => document.fonts.ready)

  const check1440 = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="pixel-canvas"]')!.getBoundingClientRect()
    const palette = document.querySelector('[data-testid="palette"]')!.getBoundingClientRect()
    const ask = document.querySelector('[data-testid="ask-ai-button"]')!.getBoundingClientRect()
    const main = document.querySelector('main')!
    return {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      canvasBottom: canvas.bottom,
      paletteBottom: palette.bottom,
      askBottom: ask.bottom,
      vh: window.innerHeight,
      mainScrollHeight: main.scrollHeight,
      mainClientHeight: main.clientHeight,
    }
  })
  console.log('1440x900 metrics:', JSON.stringify(check1440))
  expect(check1440.canvasWidth).toBeGreaterThanOrEqual(576)
  expect(check1440.canvasBottom).toBeLessThanOrEqual(900)
  expect(check1440.paletteBottom).toBeLessThanOrEqual(900)
  expect(check1440.askBottom).toBeLessThanOrEqual(900)

  await page.screenshot({ path: resolve(screenshotsDir, 'room-playing-1440x900.png') })

  // 2. Playing at 1280x720
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.waitForTimeout(150)
  const check1280 = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="pixel-canvas"]')!.getBoundingClientRect()
    const palette = document.querySelector('[data-testid="palette"]')!.getBoundingClientRect()
    const ask = document.querySelector('[data-testid="ask-ai-button"]')!.getBoundingClientRect()
    return {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      canvasBottom: canvas.bottom,
      paletteBottom: palette.bottom,
      askBottom: ask.bottom,
    }
  })
  console.log('1280x720 metrics:', JSON.stringify(check1280))
  expect(check1280.canvasBottom).toBeLessThanOrEqual(720)
  expect(check1280.paletteBottom).toBeLessThanOrEqual(720)
  expect(check1280.askBottom).toBeLessThanOrEqual(720)

  await page.screenshot({ path: resolve(screenshotsDir, 'room-playing-1280x720.png') })

  // 3. Playing at 375x812
  await page.setViewportSize({ width: 375, height: 812 })
  await page.waitForTimeout(150)
  const check375 = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="pixel-canvas"]')!.getBoundingClientRect()
    return {
      canvasWidth: canvas.width,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }
  })
  console.log('375x812 metrics:', JSON.stringify(check375))
  expect(check375.docScrollWidth).toBeLessThanOrEqual(375)
  expect(check375.bodyScrollWidth).toBeLessThanOrEqual(375)

  await page.screenshot({ path: resolve(screenshotsDir, 'room-playing-375x812.png') })

  // 4. Intermission overlay at 1440x900
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(150)
  const now2 = Date.now()
  server.send(
    JSON.stringify({
      t: 'round',
      round: {
        id: 'round-1',
        word: 'LIGHTHOUSE',
        state: 'intermission',
        startedAt: now2 - 45_000,
        endsAt: null,
        endedAt: now2,
        askAvailableAt: 0,
        result: {
          outcome: 'won',
          score: 840,
          contributorCount: 3,
        },
      },
    }),
  )
  await expect(page.getByTestId('round-overlay')).toBeVisible()
  await page.screenshot({ path: resolve(screenshotsDir, 'room-overlay-1440x900.png') })

  // 5. Lobby at 1440x900
  server.send(
    JSON.stringify({
      t: 'round',
      round: {
        id: 'round-lobby',
        word: '',
        state: 'lobby',
        startedAt: now2,
        endsAt: null,
        askAvailableAt: 0,
      },
    }),
  )
  await expect(page.getByTestId('room-lobby')).toBeVisible()
  await page.screenshot({ path: resolve(screenshotsDir, 'room-lobby-1440x900.png') })
})
