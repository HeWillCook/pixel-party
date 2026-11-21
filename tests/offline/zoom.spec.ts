import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { EMPTY_CANVAS } from '../../src/game/config'

// Phone-sized touch device: the whole point is that a thumb-and-forefinger pinch
// on a small board zooms instead of smearing pixels.
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const screenshotsDir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-21-feedback')

const CELLS = 32

interface TouchPoint {
  id: number
  x: number
  y: number
}

async function dispatchTouch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: TouchPoint[]) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(point => ({ x: point.x, y: point.y, id: point.id, radiusX: 8, radiusY: 8, force: 1 })),
  })
}

/** A real two-finger pinch: first finger down, second lands, then both spread apart. */
async function pinch(cdp: CDPSession, center: { x: number; y: number }, startGap: number, endGap: number) {
  const left = { id: 1, x: center.x - startGap / 2, y: center.y }
  const right = { id: 2, x: center.x + startGap / 2, y: center.y }
  await dispatchTouch(cdp, 'touchStart', [left])
  // The second finger lands as soon as the first touch is delivered, so the test measures the
  // cancel path rather than racing the 120 ms deferral on a busy CI machine.
  await dispatchTouch(cdp, 'touchStart', [left, right])
  const steps = 8
  for (let step = 1; step <= steps; step++) {
    const gap = startGap + ((endGap - startGap) * step) / steps
    await dispatchTouch(cdp, 'touchMove', [
      { id: 1, x: center.x - gap / 2, y: center.y },
      { id: 2, x: center.x + gap / 2, y: center.y },
    ])
    await new Promise(done => setTimeout(done, 16))
  }
  await dispatchTouch(cdp, 'touchEnd', [])
}

/** Both fingers already down, then moved together: pans at constant zoom. */
async function dragTwoFingers(cdp: CDPSession, start: { x: number; y: number }, delta: { x: number; y: number }, gap: number) {
  const points = (dx: number, dy: number): TouchPoint[] => [
    { id: 1, x: start.x - gap / 2 + dx, y: start.y + dy },
    { id: 2, x: start.x + gap / 2 + dx, y: start.y + dy },
  ]
  await dispatchTouch(cdp, 'touchStart', points(0, 0))
  const steps = 6
  for (let step = 1; step <= steps; step++) {
    await dispatchTouch(cdp, 'touchMove', points((delta.x * step) / steps, (delta.y * step) / steps))
    await new Promise(done => setTimeout(done, 16))
  }
  await dispatchTouch(cdp, 'touchEnd', [])
}

async function playingDaily(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') {
      return route.fulfill({ json: { user: { id: 'host', name: 'Will', email: 'will@example.test' }, session: { id: 'offline', userId: 'host', expiresAt: '2096-01-01T00:00:00Z' } } })
    }
    if (url.pathname === '/api/auth/token') {
      return route.fulfill({ json: { token: `fixture.${Buffer.from(JSON.stringify({ sub: 'host', exp: 4_000_000_000 })).toString('base64url')}.unsigned` } })
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} })
    const asset = url.pathname.startsWith('/assets/')
    const path = asset ? resolve(clientDir, `.${url.pathname}`) : resolve(clientDir, '_spa.html')
    return route.fulfill({ contentType: asset ? (path.endsWith('.css') ? 'text/css' : 'application/javascript') : 'text/html', body: await readFile(path) })
  })
  await page.routeWebSocket('**/ws/**', socket => {
    if (socket.url().includes('/ws/presence/')) return
    socket.send(JSON.stringify({ type: 'user.info', payload: { role: 'member' } }))
    socket.onMessage(raw => {
      if (String(raw) === 'ping') return
      const message = JSON.parse(String(raw))
      if (message.type === 'core.subscribe') {
        socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId: message.payload.subscriptionId, records: [] } }))
      }
    })
  })

  const day = new Date().toISOString().slice(0, 10)
  const now = Date.now()
  const playing = {
    day,
    status: 'playing',
    prompt: 'A tree',
    startedAt: now,
    endsAt: now + 300_000,
    autoUsed: 0,
    asksUsed: 0,
    asksLeft: 3,
    finalUsed: false,
    best: 0,
    windows: [],
    nextAutoAt: now + 60_000,
    serverNow: now,
  }
  await page.route('**/api/daily/**', route => route.fulfill({ json: playing }))

  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  return { errors, day }
}

async function storedCells(page: Page, day: string) {
  const raw = await page.evaluate(date => localStorage.getItem(`daily:${date}:host`), day)
  return raw ? [...Uint8Array.from(atob(raw), char => char.charCodeAt(0))] : null
}

/** The cell under a client point on the (possibly zoomed and panned) canvas. */
async function cellAt(page: Page, point: { x: number; y: number }) {
  const box = (await page.getByTestId('pixel-canvas').boundingBox())!
  return {
    x: Math.floor(((point.x - box.x) / box.width) * CELLS),
    y: Math.floor(((point.y - box.y) / box.height) * CELLS),
    box,
  }
}

test('a two-finger pinch zooms in and paints no pixels', async ({ page }) => {
  const { errors, day } = await playingDaily(page)
  const canvas = page.getByTestId('pixel-canvas')
  const clip = (await page.getByTestId('pixel-canvas-clip').boundingBox())!
  const center = { x: clip.x + clip.width / 2, y: clip.y + clip.height / 2 }
  // The first finger's cell is where a deferred stroke would have landed by accident.
  const firstFinger = await cellAt(page, { x: center.x - 40, y: center.y })
  await expect(canvas).toHaveAttribute('data-zoom', '1')

  const cdp = await page.context().newCDPSession(page)
  await pinch(cdp, center, 80, 130)

  await expect.poll(async () => Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(1.4)
  // The zoomed board still covers the frame, so no blank edge shows.
  const zoomed = (await canvas.boundingBox())!
  expect(zoomed.x).toBeLessThanOrEqual(clip.x)
  expect(zoomed.y).toBeLessThanOrEqual(clip.y)
  expect(zoomed.x + zoomed.width).toBeGreaterThanOrEqual(clip.x + clip.width)
  expect(zoomed.y + zoomed.height).toBeGreaterThanOrEqual(clip.y + clip.height)

  // Two fingers dragged together pan the zoomed board.
  await dragTwoFingers(cdp, center, { x: 24, y: 18 }, 130)
  const panned = (await canvas.boundingBox())!
  expect(panned.x).toBeCloseTo(zoomed.x + 24, 0)
  expect(panned.y).toBeCloseTo(zoomed.y + 18, 0)

  // The canvas bitmap under the fingers is still bare board: the pinch never committed a stroke.
  const pixel = await canvas.evaluate((element: HTMLCanvasElement, cell) => [...element.getContext('2d')!.getImageData(cell.x, cell.y, 1, 1).data], { x: firstFinger.x, y: firstFinger.y })
  const [r, g, b] = [1, 3, 5].map(index => parseInt(EMPTY_CANVAS[(firstFinger.x + firstFinger.y) % 2].slice(index, index + 2), 16))
  expect(pixel).toEqual([r, g, b, 255])
  expect(await storedCells(page, day)).toBeNull()
  await expect(page.getByTestId('tool-undo')).toBeDisabled()
  await expect(page.getByTestId('zoom-reset')).toBeVisible()
  expect(errors).toEqual([])
})

test('a single tap after zooming paints exactly the cell under the finger', async ({ page }) => {
  const { errors, day } = await playingDaily(page)
  await page.getByTestId('swatch-7').click()
  const canvas = page.getByTestId('pixel-canvas')
  const clip = (await page.getByTestId('pixel-canvas-clip').boundingBox())!
  const center = { x: clip.x + clip.width / 2, y: clip.y + clip.height / 2 }

  const cdp = await page.context().newCDPSession(page)
  await pinch(cdp, center, 80, 150)
  await expect.poll(async () => Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(1.5)

  const box = (await canvas.boundingBox())!
  expect(box.width).toBeGreaterThan(clip.width)
  // Off-centre on purpose: a mapping that ignored the zoom would land on a different cell.
  const tapPoint = { x: clip.x + clip.width * 0.3, y: clip.y + clip.height * 0.35 }
  const target = await cellAt(page, tapPoint)
  expect(target.x).toBeGreaterThanOrEqual(0)
  expect(target.x).toBeLessThan(CELLS)
  expect(target.y).toBeGreaterThanOrEqual(0)
  expect(target.y).toBeLessThan(CELLS)
  expect(target.x).not.toBe(Math.floor(0.3 * CELLS))
  expect(target.y).not.toBe(Math.floor(0.35 * CELLS))

  await page.touchscreen.tap(tapPoint.x, tapPoint.y)
  await expect.poll(() => storedCells(page, day)).not.toBeNull()
  const cells = (await storedCells(page, day))!
  expect(cells[target.y * CELLS + target.x]).toBe(7)
  // Exactly one cell changed: the tap painted the cell under the finger and nothing else.
  expect(cells.filter(cell => cell !== 0)).toEqual([7])
  expect(errors).toEqual([])
})

test('one finger held still paints its cell once the deferral window passes', async ({ page }) => {
  const { errors, day } = await playingDaily(page)
  await page.getByTestId('swatch-9').click()
  const clip = (await page.getByTestId('pixel-canvas-clip').boundingBox())!
  const center = { x: clip.x + clip.width / 2, y: clip.y + clip.height / 2 }
  const target = await cellAt(page, center)
  const cdp = await page.context().newCDPSession(page)
  await dispatchTouch(cdp, 'touchStart', [{ id: 1, x: center.x, y: center.y }])
  // The finger is still down: this pixel comes from the 120 ms deferral, not from lifting it.
  await expect.poll(() => storedCells(page, day)).not.toBeNull()
  const cells = (await storedCells(page, day))!
  expect(cells[target.y * CELLS + target.x]).toBe(9)
  expect(cells.filter(cell => cell !== 0)).toEqual([9])
  await dispatchTouch(cdp, 'touchEnd', [])
  expect(errors).toEqual([])
})

test('reset zoom returns the board to 1x', async ({ page }) => {
  const { errors } = await playingDaily(page)
  const canvas = page.getByTestId('pixel-canvas')
  const clip = (await page.getByTestId('pixel-canvas-clip').boundingBox())!
  const center = { x: clip.x + clip.width / 2, y: clip.y + clip.height / 2 }
  const cdp = await page.context().newCDPSession(page)
  await pinch(cdp, center, 80, 140)
  await expect.poll(async () => Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(1.4)

  if (process.env.SCREENSHOTS === '1') {
    await mkdir(screenshotsDir, { recursive: true })
    await page.screenshot({ path: resolve(screenshotsDir, 'zoom-pinched-375x812.png') })
  }

  const reset = page.getByTestId('zoom-reset')
  await expect(reset).toBeVisible()
  const resetBox = (await reset.boundingBox())!
  await page.touchscreen.tap(resetBox.x + resetBox.width / 2, resetBox.y + resetBox.height / 2)
  await expect(canvas).toHaveAttribute('data-zoom', '1')
  await expect(reset).toHaveCount(0)
  const after = (await canvas.boundingBox())!
  expect(after.width).toBeCloseTo(clip.width, 0)
  expect(after.x).toBeCloseTo(clip.x, 0)

  if (process.env.SCREENSHOTS === '1') {
    await page.screenshot({ path: resolve(screenshotsDir, 'zoom-reset-375x812.png') })
  }

  // A new board size (here: a resize) starts fresh at 1x instead of stranding the drawing off-frame.
  await pinch(cdp, center, 80, 140)
  await expect.poll(async () => Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(1.4)
  await page.setViewportSize({ width: 812, height: 375 })
  await expect(canvas).toHaveAttribute('data-zoom', '1')
  const resizedClip = (await page.getByTestId('pixel-canvas-clip').boundingBox())!
  const resized = (await canvas.boundingBox())!
  expect(resized.width).toBeCloseTo(resizedClip.width, 0)
  expect(resized.x).toBeCloseTo(resizedClip.x, 0)
  await expect(page.getByTestId('zoom-reset')).toHaveCount(0)
  expect(errors).toEqual([])
})
