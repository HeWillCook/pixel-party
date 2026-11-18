import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')

async function playFixture(page: Page, initiallyPlaying = false) {
  await offlineClient(page, true)
  const now = Date.now()
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 600_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 120_000, serverNow: now }
  await page.route('**/api/daily/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/me') && !initiallyPlaying ? { ...playing, status: 'not_started' } : playing }))
}

test('selecting a colour while erasing switches to paint', async ({ page }) => {
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  await page.getByTestId('tool-erase').click()
  await page.getByTestId('swatch-7').click()
  await expect(page.getByTestId('tool-paint')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('swatch-7')).toHaveAttribute('aria-pressed', 'true')
})

test('pick switches to paint with the picked colour', async ({ page }) => {
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  await page.getByTestId('swatch-7').click()
  const canvas = page.getByTestId('pixel-canvas')
  await canvas.click({ position: { x: 10, y: 10 } })
  await page.getByTestId('swatch-4').click()
  await page.getByTestId('tool-pick').click()
  await canvas.click({ position: { x: 10, y: 10 } })
  await expect(page.getByTestId('tool-paint')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('swatch-7')).toHaveAttribute('aria-pressed', 'true')
})

test('current colour chip shows eraser when erasing', async ({ page }) => {
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  await page.getByTestId('tool-erase').click()
  await expect(page.getByTestId('current-colour')).toHaveAttribute('aria-label', 'Current action: erase')
  await expect(page.getByTestId('current-colour').getByTestId('current-eraser')).toBeVisible()
})

test('stacked tray aligns chip and uses legible tool targets', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  const chip = (await page.getByTestId('current-colour').boundingBox())!
  const tool = page.getByTestId('tool-paint')
  const bounds = (await tool.boundingBox())!
  expect(bounds.width).toBeGreaterThanOrEqual(48)
  expect(bounds.height).toBeGreaterThanOrEqual(48)
  expect(Math.abs((chip.y + chip.height / 2) - (bounds.y + bounds.height / 2))).toBeLessThanOrEqual(2)
  await expect(tool.locator('svg')).toHaveCSS('width', '32px')
  await expect(page.getByText('Colour', { exact: true })).toBeVisible()
})

test('mobile tools form a clean three by two grid', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  const boxes = await Promise.all(['paint', 'erase', 'fill', 'pick', 'undo', 'redo'].map(async name => (await page.getByTestId(`tool-${name}`).boundingBox())!))
  expect(boxes[0].x).toBe(boxes[3].x)
  expect(boxes[1].x).toBe(boxes[4].x)
  expect(boxes[2].x).toBe(boxes[5].x)
  expect(boxes[0].y).toBe(boxes[2].y)
  expect(boxes[3].y).toBe(boxes[5].y)
})

test('canvas restores its desktop size after scrolling on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  await page.getByText('Scores & grading').click()
  await page.getByTestId('daily-auto-timeline').scrollIntoViewIfNeeded()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect.poll(async () => (await page.getByTestId('pixel-canvas').boundingBox())!.width).toBeGreaterThanOrEqual(576)
})

test('palette starts with black and white and raises the selected swatch', async ({ page }) => {
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  const swatches = page.getByTestId('palette').getByRole('button')
  await expect(swatches.nth(0)).toHaveAttribute('aria-label', 'Select Black')
  await expect(swatches.nth(1)).toHaveAttribute('aria-label', 'Select White')
  await swatches.nth(0).click()
  await expect(swatches.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(swatches.nth(0)).not.toHaveCSS('translate', 'none')
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`play easel fits ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await playFixture(page, true)
    await page.goto(`${origin}/home`)
    const easel = page.getByTestId('hover-easel')
    await expect(easel).toBeVisible()
    const easelBox = (await easel.boundingBox())!
    const frame = (await page.getByTestId('hover-easel-frame').boundingBox())!
    const canvas = (await page.getByTestId('pixel-canvas').boundingBox())!
    expect(frame.x).toBeLessThanOrEqual(canvas.x)
    expect(frame.y).toBeLessThanOrEqual(canvas.y)
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(canvas.x + canvas.width)
    expect(frame.y + frame.height).toBeGreaterThanOrEqual(canvas.y + canvas.height)
    if (viewport.width === 1440) {
      expect(easelBox.x).toBeGreaterThanOrEqual(0)
      expect(easelBox.y).toBeGreaterThanOrEqual(0)
      expect(easelBox.x + easelBox.width).toBeLessThanOrEqual(viewport.width)
      expect(easelBox.y + easelBox.height).toBeLessThanOrEqual(viewport.height)
      const booster = (await easel.locator('.hover-easel__booster').first().boundingBox())!
      const palette = (await page.getByTestId('palette').boundingBox())!
      expect(booster.y + booster.height + 9).toBeLessThanOrEqual(palette.y)
    }
  })
}

test('mobile painter tray and grading actions stay accessible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('painter-tray').getByTestId('toolbar')).toBeVisible()
  const lastSwatch = page.getByTestId('swatch-15')
  await lastSwatch.scrollIntoViewIfNeeded()
  await lastSwatch.click()
  await expect(lastSwatch).toHaveAttribute('aria-pressed', 'true')
  for (const id of ['daily-ask-button', 'daily-done-button']) {
    const bounds = (await page.getByTestId(id).boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375)
  }
  await page.getByText('Scores & grading').click()
  await expect(page.getByTestId('daily-auto-timeline')).toBeVisible()
  await expect(page.getByTestId('daily-score-breakdown')).toBeVisible()
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`painter tray and controls fit ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await playFixture(page, true)
    await page.goto(`${origin}/home`)
    const tray = page.getByTestId('painter-tray')
    await expect(tray.getByTestId('toolbar')).toBeVisible()
    await expect(tray.getByTestId('palette')).toBeVisible()
    for (const target of [page.getByTestId('pixel-canvas'), tray, page.getByTestId('daily-ask-button')]) {
      const bounds = (await target.boundingBox())!
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
    }
    if (viewport.width === 1440) await expect.poll(async () => (await page.getByTestId('pixel-canvas').boundingBox())!.width).toBeGreaterThanOrEqual(576)
  })
}

test('start zooms into the easel', async ({ page }) => {
  await playFixture(page)
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await expect(page.locator('[data-camera="easel"]')).toBeAttached()
})

test('easel camera crossfades on entry and reverses on exit', async ({ page }) => {
  await playFixture(page)
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  const backdrop = page.locator('[data-camera="easel"]')
  await expect(backdrop).toHaveAttribute('data-phase', 'entering')
  await expect(backdrop.locator('.pixel-scene__camera')).toHaveCSS('transition-duration', '0.6s')
  const camera = backdrop.locator('.pixel-scene__camera')
  const entryStart = await camera.evaluate(element => getComputedStyle(element).transform)
  await page.waitForTimeout(150)
  const entryMiddle = await camera.evaluate(element => getComputedStyle(element).transform)
  if (process.env.PLAY_TRANSITION_SCREENSHOTS) await page.screenshot({ path: '/tmp/play-entry-midpoint.png' })
  expect(entryMiddle).not.toBe(entryStart)
  await expect(backdrop).toHaveAttribute('data-phase', 'active')
  await expect(backdrop.locator('.play-scenery-layer')).toHaveCSS('opacity', '1')
  await expect(backdrop.locator('.play-scenery-layer')).toHaveCSS('transition-duration', '0.15s')
  await page.getByTestId('daily-exit').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Exit', exact: true }).click()
  await expect(backdrop).toHaveAttribute('data-phase', 'leaving')
  await page.waitForTimeout(200)
  const exitStart = await camera.evaluate(element => getComputedStyle(element).transform)
  await page.waitForTimeout(150)
  const exitMiddle = await camera.evaluate(element => getComputedStyle(element).transform)
  if (process.env.PLAY_TRANSITION_SCREENSHOTS) await page.screenshot({ path: '/tmp/play-exit-midpoint.png' })
  expect(exitMiddle).not.toBe(exitStart)
  await expect(page.getByTestId('daily-playing')).toHaveCount(0)
  await expect(page.locator('.porch-world .pixel-hotspot').first()).toBeVisible()
})

test('reload mid-attempt never shows porch hotspots', async ({ page }) => {
  await playFixture(page, true)
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => { if (document.querySelector('.porch-world .pixel-hotspot')) document.documentElement.dataset.sawPorch = 'yes' })
    observer.observe(document, { childList: true, subtree: true })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.dataset.sawPorch)).toBeUndefined()
  await expect(page.locator('[data-camera="easel"]')).toBeAttached()
})

test('reduced motion zoom is immediate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await playFixture(page)
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await expect(page.getByTestId('daily-playing')).toBeVisible({ timeout: 100 })
})

test('drawable easel remains still', async ({ page }) => {
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  const easel = page.getByTestId('hover-easel')
  await expect(easel).toBeVisible()
  const before = await easel.boundingBox()
  await page.waitForTimeout(1000)
  expect(await easel.boundingBox()).toEqual(before)
})

test('camera centers the porch board on the measured drawing canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await playFixture(page)
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  await expect.poll(async () => page.evaluate(() => {
    const scene = document.querySelector('[data-camera="easel"] canvas')!.getBoundingClientRect()
    const target = document.querySelector('[data-testid="pixel-canvas"]')!.getBoundingClientRect()
    const sceneCenterX = scene.left + (138 + 15 + 39 / 2) / 320 * scene.width
    const sceneCenterY = scene.top + (40 + 23 + 51 / 2) / 180 * scene.height
    return Math.max(Math.abs(sceneCenterX - target.left - target.width / 2), Math.abs(sceneCenterY - target.top - target.height / 2))
  })).toBeLessThan(3)
})

test('reduced motion exit returns to the porch and resumes the attempt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-exit').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Exit', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start Daily Challenge' })).toBeVisible({ timeout: 100 })
  await expect(page).toHaveURL(`${origin}/home`)
  await page.getByRole('button', { name: 'Start Daily Challenge' }).click()
  await expect(page.getByTestId('pixel-canvas')).toBeVisible({ timeout: 100 })
})

for (const askFirst of [false, true]) test(askFirst ? 'auto-grade fires at 2:00 after an ask at 1:30' : 'auto-grade fires at 2:00 without asks', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const startedAt = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt, endsAt: startedAt + 600_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], serverNow: startedAt, nextAutoAt: startedAt + 120_000 }
  const grades: { body: unknown; status: number }[] = []
  page.on('response', response => {
    const request = response.request()
    if (new URL(response.url()).pathname === '/api/daily/grade' && request.method() === 'POST') grades.push({ body: request.postDataJSON(), status: response.status() })
  })
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: { ...playing, status: 'not_started' } })
    if (path.endsWith('/start')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      const body = route.request().postDataJSON()
      if (body.kind === 'auto' && askFirst) return route.fulfill({ status: 200, json: { skipped: 'skipped_unchanged', window: 0, state: { ...playing, asksUsed: 1, asksLeft: 2, nextAutoAt: startedAt + 240_000, serverNow: startedAt + 120_000 } } })
      return route.fulfill({ status: 200, json: { ok: true, grade: { guess: 'tree', reason: 'tree', fit: 100, recognition: 100, speed: 10, total: 210, elapsedMs: 120_000 }, state: { ...playing, ...(body.kind === 'ask' ? { asksUsed: 1, asksLeft: 2, serverNow: startedAt + 90_000 } : { autoUsed: 1, nextAutoAt: startedAt + 240_000 }) } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
  if (askFirst) {
    await page.clock.fastForward(90_000)
    await page.getByTestId('daily-ask-button').click()
    await expect.poll(() => grades.length).toBe(1)
  }
  await page.clock.fastForward(askFirst ? 35_000 : 125_000)
  await expect.poll(() => grades.filter(grade => (grade.body as { kind: string }).kind === 'auto')).toMatchObject([{ body: { kind: 'auto', window: 0 }, status: 200 }])
  if (askFirst) {
    const notice = page.getByText('Auto-grade skipped: no changes since your last grade')
    await expect(notice).toBeVisible()
    await page.clock.fastForward(6_000)
    await expect(notice).toHaveCount(0)
  }
})

test('ended user never sees start', async ({ page }) => {
  await offlineClient(page, true)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/daily/me', async route => {
    await gate
    const now = Date.now()
    await route.fulfill({ json: { day: new Date(now).toISOString().slice(0, 10), status: 'ended', startedAt: now - 600_000, endsAt: now, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: now } })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-loading')).toBeVisible()
  for (let sample = 0; sample < 15; sample++) {
    await expect(page.getByTestId('daily-start-button')).toHaveCount(0)
    await page.waitForTimeout(100)
  }
  release()
  await expect(page.getByTestId('daily-ended')).toBeVisible()
  await page.getByRole('button', { name: 'View result' }).click()
  await expect(page.getByText('Manual grades: 0 of 3 used')).toBeVisible()
})

test('reduced motion starts directly in the play view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await offlineClient(page, true)
  const now = Date.now()
  const playing = { day: new Date(now).toISOString().slice(0, 10), status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 600_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 120_000, serverNow: now }
  await page.route('**/api/daily/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/me') ? { ...playing, status: 'not_started' } : playing }))
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await expect(page.locator('.porch-world')).toHaveCount(0)
})

test('me failure stays loading then recovers', async ({ page }) => {
  await offlineClient(page, true)
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/daily/me', async route => {
    calls++
    if (calls === 1) return route.fulfill({ status: 500, json: {} })
    await gate
    const now = Date.now()
    return route.fulfill({ json: { day: new Date(now).toISOString().slice(0, 10), status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 600_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 120_000, serverNow: now } })
  })
  await page.goto(`${origin}/home`)
  await expect.poll(() => calls).toBeGreaterThan(0)
  await expect(page.getByTestId('daily-loading')).toBeVisible()
  await expect(page.getByTestId('daily-start-button')).toHaveCount(0)
  release()
  await expect(page.getByTestId('daily-playing')).toBeVisible({ timeout: 12_000 })
})

test('no local canvas, no auto', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:02:10Z') })
  await offlineClient(page, true)
  let grades = 0
  let ends = 0
  const now = Date.parse('2026-11-17T12:02:10Z')
  await page.route('**/api/daily/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/grade')) grades++
    if (new URL(route.request().url()).pathname.endsWith('/end')) ends++
    return route.fulfill({ json: { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now - 130_000, endsAt: now + 470_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: now - 10_000, serverNow: now } })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.clock.fastForward(10_000)
  expect(grades).toBe(0)
  await page.getByRole('button', { name: /Account menu:/ }).click()
  await page.getByRole('menuitem', { name: 'Party', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Live Public Rooms' })).toBeVisible()
  await page.clock.fastForward(470_000)
  expect(grades).toBe(0)
  expect(ends).toBe(0)
})

test('starting without painting schedules a blank auto', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 600_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 120_000, serverNow: now }
  let auto: { kind: string; window: number; cells: string } | undefined
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: { ...playing, status: 'not_started' } })
    if (path.endsWith('/start')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      auto = route.request().postDataJSON()
      return route.fulfill({ json: { skipped: 'skipped_blank', window: 0, state: { ...playing, nextAutoAt: now + 240_000 } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.clock.fastForward(125_000)
  await expect.poll(() => auto?.kind).toBe('auto')
  expect(auto?.window).toBe(0)
  expect(Buffer.from(auto!.cells, 'base64').every(cell => cell === 0)).toBe(true)
  await expect(page.getByText('Auto-grade skipped: nothing drawn yet')).toBeVisible()
})

test('timeout on party uses the latest stored canvas', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:09:58Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:09:58Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now - 598_000, endsAt: now + 2_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: now }
  let finalCells = ''
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/grade')) {
      finalCells = route.request().postDataJSON().cells
      return route.fulfill({ json: { ok: false, reason: 'unchanged', state: playing } })
    }
    if (path.endsWith('/end')) return route.fulfill({ json: { ...playing, status: 'ended' } })
    return route.fulfill({ json: playing })
  })
  await page.goto(`${origin}/party`)
  await expect(page.getByRole('heading', { name: 'Live Public Rooms' })).toBeVisible()
  const latest = await page.evaluate(() => {
    const cells = new Uint8Array(1024).fill(7)
    const encoded = btoa(String.fromCharCode(...cells))
    localStorage.setItem('daily:2026-11-17:host', encoded)
    return encoded
  })
  await page.clock.fastForward(4_000)
  await expect.poll(() => finalCells).toBe(latest)
})

test('timer uses server clock offset', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  await page.route('**/api/daily/**', route => route.fulfill({ json: { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now - 510_000, endsAt: now + 90_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: now + 90_000 } }))
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-timer')).toHaveText('0:00')
})

test('auto-grade fires on another route', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 600_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 120_000, serverNow: now }
  let auto = 0
  let sentCells = ''
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: { ...playing, status: 'not_started' } })
    if (path.endsWith('/start')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      if (route.request().postDataJSON().kind === 'auto') {
        auto++
        sentCells = route.request().postDataJSON().cells
      }
      return route.fulfill({ json: { skipped: 'skipped_unchanged', window: 0, state: { ...playing, nextAutoAt: now + 240_000 } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
  await page.getByRole('button', { name: /Account menu:/ }).click()
  await page.getByRole('menuitem', { name: 'Party', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Live Public Rooms' })).toBeVisible()
  const latestCells = await page.evaluate(() => {
    const cells = new Uint8Array(1024)
    cells[50] = 7
    const encoded = btoa(String.fromCharCode(...cells))
    localStorage.setItem('daily:2026-11-17:host', encoded)
    return encoded
  })
  await page.clock.fastForward(125_000)
  await expect.poll(() => auto).toBe(1)
  expect(sentCells).toBe(latestCells)
})

test('a delayed state refresh cannot overwrite a later grade', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  const initial = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 600_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 120_000, serverNow: now }
  let hold = false
  let pending = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) {
      if (hold) { pending++; await gate }
      return route.fulfill({ json: initial })
    }
    if (path.endsWith('/grade')) return route.fulfill({ json: { ok: true, grade: { guess: 'tree', reason: 'recognisable tree', fit: 300, recognition: 200, speed: 90, total: 590, elapsedMs: 181_000 }, state: { ...initial, asksUsed: 1, asksLeft: 2, best: 590, nextAutoAt: now + 240_000 } } })
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  hold = true
  await page.clock.fastForward(181_000)
  await expect.poll(() => pending).toBe(1)
  await page.getByTestId('daily-ask-button').click()
  await expect(page.getByTestId('daily-ask-button')).toHaveText(/Grade now \(2 left\)/)
  await expect(page.getByTestId('daily-best-score')).toContainText('590')
  const refreshResponse = page.waitForResponse(response => response.url().endsWith('/api/daily/me'))
  release()
  await refreshResponse
  await page.waitForTimeout(100)
  await expect(page.getByTestId('daily-ask-button')).toHaveText(/Grade now \(2 left\)/)
  await expect(page.getByTestId('daily-best-score')).toContainText('590')
})

for (const action of ['exit confirm returns to porch', 'grade now and submit are separate'] as const) test(action, async ({ page }) => {
  await offlineClient(page, true)
  const now = Date.now()
  const windows = [120_000, 240_000, 360_000, 480_000].map((offset, index) => ({ index, dueAt: now + offset, status: 'pending', score: null, late: false }))
  const playing = { day: new Date(now).toISOString().slice(0, 10), status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 600_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows, nextAutoAt: now + 120_000, serverNow: now }
  let ends = 0
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) return route.fulfill({ json: { ok: true, grade: { guess: 'tree', reason: 'recognisable tree', fit: 300, recognition: 200, speed: 90, total: 590, elapsedMs: 10_000 }, state: { ...playing, asksUsed: 1, asksLeft: 2, best: 590 } } })
    if (path.endsWith('/end')) { ends++; return route.fulfill({ json: { ...playing, status: 'ended' } }) }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  if (action === 'exit confirm returns to porch') {
    await page.getByTestId('daily-exit').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Leave the easel?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Keep painting' }).click()
    await expect(page.getByTestId('daily-playing')).toBeVisible()
    await page.getByTestId('daily-exit').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Exit', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/home`)
    await expect(page.getByRole('button', { name: 'Start Daily Challenge' })).toBeVisible()
    expect(ends).toBe(0)
  } else {
    await expect(page.getByTestId('daily-ask-button')).toHaveText(/Grade now \(3 left\)/)
    await expect(page.getByTestId('daily-done-button')).toHaveText(/Submit & finish/)
    await expect(page.getByTestId('daily-auto-timeline')).toContainText('2:00 in')
    await page.getByTestId('daily-ask-button').click()
    await expect(page.getByTestId('daily-playing')).toBeVisible()
    await expect(page.getByTestId('daily-ask-button')).toHaveText(/Grade now \(2 left\)/)
    await expect(page.getByTestId('daily-score-breakdown')).toContainText('Matches the prompt')
    await expect(page.getByTestId('daily-score-breakdown')).toContainText('Easy to recognise')
    await expect(page.getByTestId('grade-total')).toContainText('590 / 1000')
    expect(ends).toBe(0)
    await page.getByTestId('daily-done-button').click()
    await expect(page.getByTestId('daily-ended')).toBeVisible()
    expect(ends).toBe(1)
  }
})

async function offlineClient(page: Page, signedIn = false) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: signedIn ? { user: { id: 'host', name: 'Will', email: 'will@example.test' }, session: { id: 'offline', userId: 'host', expiresAt: '2096-01-01T00:00:00Z' } } : null })
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token: signedIn ? `fixture.${Buffer.from(JSON.stringify({ sub: 'host', exp: 4_000_000_000 })).toString('base64url')}.unsigned` : null } })
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
      if (String(raw) === 'ping') return
      const message = JSON.parse(String(raw))
      if (message.type === 'user.list') socket.send(JSON.stringify({ type: 'user.list', payload: { users: signedIn ? [{ id: 'host', name: 'Will' }] : [] } }))
      if (message.type === 'core.subscribe') {
        socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId: message.payload.subscriptionId, records: [] } }))
      }
    })
  })
  return errors
}

test('signed-out home shows leaderboard and sign-in without revealing a prompt', async ({ page }) => {
  const errors = await offlineClient(page)
  let meRequests = 0
  await page.route('**/api/daily/me', async route => { meRequests++; await route.fulfill({ json: {} }) })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-sign-in-button')).toBeVisible()
  await expect(page.getByTestId('daily-leaderboard').getByRole('heading', { name: 'Leaderboard' })).toBeVisible()
  await expect(page.getByTestId('daily-prompt')).toHaveCount(0)
  expect(meRequests).toBe(0)
  expect(errors).toEqual([])
})

test('signed-out profile renders its heading and empty state without errors', async ({ page }) => {
  const errors = await offlineClient(page)
  await page.goto(`${origin}/u/offline-player`)
  await expect(page.getByRole('heading', { name: "Player's Gallery" })).toBeVisible()
  await expect(page.getByText('No drawings to show yet.')).toBeVisible()
  expect(errors).toEqual([])
})

test('party route still renders the lobby', async ({ page }) => {
  const errors = await offlineClient(page)
  await page.goto(`${origin}/party`)
  await expect(page.getByRole('heading', { name: 'Live Public Rooms' })).toBeVisible()
  await expect(page.getByTestId('lobby-play-now')).toBeVisible()
  expect(errors).toEqual([])
})

for (const invalidAt of ['grade', 'end'] as const) {
  for (const todayStatus of ['not_started', 'playing', 'ended', 'unavailable'] as const) {
    test(`invalid-day ${invalidAt} reloads ${todayStatus} without ending another day`, async ({ page }) => {
      const errors = await offlineClient(page, true)
      const today = new Date().toISOString().slice(0, 10)
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
      const initial = { day: yesterday, status: 'playing', prompt: 'Yesterday scene', startedAt: Date.now() - 60_000, endsAt: Date.now() + 540_000, autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 123, windows: [], nextAutoAt: Date.now() + 60_000, serverNow: Date.now() }
      const fresh = { ...initial, day: today, status: todayStatus, prompt: 'Today scene', best: 456 }
      let refreshes = 0
      let staleRejected = false
      const ends: unknown[] = []
      const grades: unknown[] = []
      let release!: () => void
      const reload = new Promise<void>(resolve => { release = resolve })
      await page.route('**/api/daily/**', async route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/me')) {
          if (!staleRejected) return route.fulfill({ json: initial })
          refreshes++
          await reload
          return todayStatus === 'unavailable' ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: fresh })
        }
        if (path.endsWith('/grade')) {
          grades.push(route.request().postDataJSON())
          if (invalidAt === 'end') return route.fulfill({ json: { ok: true, grade: { guess: 'old scene', reason: 'old', fit: 100, recognition: 100, speed: 10, total: 210, elapsedMs: 60_000 }, state: { ...initial, finalUsed: true } } })
          staleRejected = true
          return route.fulfill({ json: { ok: false, reason: 'invalid_day', state: { ...fresh, status: 'not_started', best: 0 } } })
        }
        if (path.endsWith('/end')) {
          ends.push(route.request().postDataJSON())
          if (invalidAt === 'end') {
            staleRejected = true
            return route.fulfill({ status: 400, json: { error: 'invalid_attempt_day' } })
          }
          return route.fulfill({ json: { ...fresh, status: 'ended', best: 0 } })
        }
        return route.fulfill({ json: {} })
      })
      await page.goto(`${origin}/home`)
      await expect(page.getByTestId('daily-prompt')).toHaveText('Yesterday scene')
      await page.getByTestId('daily-done-button').click()
      await expect.poll(() => refreshes).toBeGreaterThanOrEqual(1)
      await expect(page.getByTestId('daily-prompt')).toHaveText('Yesterday scene')
      await expect(page.getByTestId('daily-done-button')).toBeDisabled()
      if (invalidAt === 'grade') expect(ends).toEqual([])
      else expect(ends).toMatchObject([{ day: yesterday }])
      expect(grades).toMatchObject([{ day: yesterday, kind: 'final' }])
      release()
      if (todayStatus === 'unavailable') {
        await expect(page.getByTestId('daily-grade-error')).toContainText('expired')
        await expect(page.getByTestId('daily-done-button')).toBeDisabled()
        await expect(page.getByTestId('daily-ask-button')).toBeDisabled()
      } else {
        await expect(page.getByTestId(`daily-${todayStatus.replace('_', '-')}`)).toBeVisible()
        if (invalidAt === 'grade' && todayStatus === 'not_started') {
          await page.waitForTimeout(300)
          expect(refreshes).toBe(1)
        }
        if (todayStatus === 'playing') {
          await expect(page.getByTestId('daily-prompt')).toHaveText('Today scene')
          await expect(page.getByTestId('daily-done-button')).toBeEnabled()
          await expect(page.getByTestId('daily-ask-button')).toBeEnabled()
          await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
          await expect.poll(() => page.evaluate(day => localStorage.getItem(`daily:${day}:host`), today)).not.toBeNull()
        }
      }
      if (invalidAt === 'grade') expect(ends).toEqual([])
      else expect(ends).toMatchObject([{ day: yesterday }])
      expect(errors).toEqual([])
    })
  }
}

async function dailyPlayingSetup(page: Page, initialCells?: Uint8Array) {
  const errors = await offlineClient(page, true)
  const day = new Date().toISOString().slice(0, 10)
  const now = Date.now()
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) {
      return route.fulfill({
        json: {
          day,
          status: 'playing',
          prompt: 'A tree',
          startedAt: now,
          endsAt: now + 600_000,
          autoUsed: 0,
          asksUsed: 0,
          asksLeft: 3,
          finalUsed: false,
          best: 0,
          windows: [],
          nextAutoAt: now + 120_000,
          serverNow: now,
          ...(initialCells ? { lastCells: Buffer.from(initialCells).toString('base64') } : {}),
        },
      })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  const canvas = page.getByTestId('pixel-canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const point = (x: number, y: number) => ({
    x: box.x + (box.width * (x + 0.5)) / 32,
    y: box.y + (box.height * (y + 0.5)) / 32,
  })
  const pixelColor = (x: number, y: number) =>
    canvas.evaluate((el: HTMLCanvasElement, p) => [...el.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data], { x, y })
  const readStored = () =>
    page.evaluate(d => {
      const raw = localStorage.getItem(`daily:${d}:host`)
      if (!raw) return null
      return [...Uint8Array.from(atob(raw), ch => ch.charCodeAt(0))]
    }, day)
  return { errors, canvas, point, pixelColor, readStored }
}

test('one fill is one undo step', async ({ page }) => {
  const { errors, canvas, point, pixelColor, readStored } = await dailyPlayingSetup(page)
  await page.getByTestId('tool-fill').click()
  await expect(page.getByTestId('tool-fill')).toHaveAttribute('aria-pressed', 'true')
  const p = point(4, 4)
  await canvas.dispatchEvent('pointerdown', { clientX: p.x, clientY: p.y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })

  await expect.poll(() => pixelColor(0, 0)).toEqual([239, 68, 68, 255])
  expect(await pixelColor(31, 31)).toEqual([239, 68, 68, 255])
  await expect.poll(async () => (await readStored())?.every(c => c === 4)).toBe(true)

  await page.getByTestId('tool-undo').click()
  await expect.poll(() => pixelColor(0, 0)).toEqual([243, 234, 216, 255])
  expect(await pixelColor(1, 0)).toEqual([239, 227, 204, 255])
  await expect.poll(async () => (await readStored())?.every(c => c === 0)).toBe(true)
  expect(errors).toEqual([])
})

test('drag stroke is one undo step', async ({ page }) => {
  const { errors, canvas, point, pixelColor, readStored } = await dailyPlayingSetup(page)
  await canvas.dispatchEvent('pointerdown', { clientX: point(2, 2).x, clientY: point(2, 2).y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointermove', { clientX: point(6, 2).x, clientY: point(2, 2).y, pointerId: 1, pointerType: 'mouse', buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })

  for (let x = 2; x <= 6; x++) {
    await expect.poll(() => pixelColor(x, 2)).toEqual([239, 68, 68, 255])
  }
  await page.getByTestId('tool-undo').click()
  for (let x = 2; x <= 6; x++) {
    const expected = x % 2 === 0 ? [243, 234, 216, 255] : [239, 227, 204, 255]
    await expect.poll(() => pixelColor(x, 2)).toEqual(expected)
  }
  await expect.poll(async () => (await readStored())?.every(c => c === 0)).toBe(true)
  expect(errors).toEqual([])
})

test('redo restores', async ({ page }) => {
  const { errors, canvas, point, pixelColor, readStored } = await dailyPlayingSetup(page)
  await page.getByTestId('tool-fill').click()
  const p = point(0, 0)
  await canvas.dispatchEvent('pointerdown', { clientX: p.x, clientY: p.y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect.poll(() => pixelColor(10, 10)).toEqual([239, 68, 68, 255])

  await page.getByTestId('tool-undo').click()
  await expect.poll(() => pixelColor(10, 10)).toEqual([243, 234, 216, 255])
  await expect(page.getByTestId('tool-redo')).toBeEnabled()

  await page.getByTestId('tool-redo').click()
  await expect.poll(() => pixelColor(10, 10)).toEqual([239, 68, 68, 255])
  await expect.poll(async () => (await readStored())?.[10 * 32 + 10]).toBe(4)
  expect(errors).toEqual([])
})

test('pick switches colour', async ({ page }) => {
  const initial = new Uint8Array(1024)
  initial[3 * 32 + 3] = 9
  const { errors, canvas, point, pixelColor } = await dailyPlayingSetup(page, initial)

  await page.getByTestId('tool-pick').click()
  const p = point(3, 3)
  await canvas.dispatchEvent('pointerdown', { clientX: p.x, clientY: p.y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect(page.getByTestId('tool-paint')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('swatch-9')).toHaveAttribute('aria-pressed', 'true')

  const p2 = point(5, 5)
  await canvas.dispatchEvent('pointerdown', { clientX: p2.x, clientY: p2.y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect.poll(() => pixelColor(5, 5)).toEqual([6, 182, 212, 255])

  // Picking empty cell switches to erase
  await page.getByTestId('tool-pick').click()
  const empty = point(8, 8)
  await canvas.dispatchEvent('pointerdown', { clientX: empty.x, clientY: empty.y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect(page.getByTestId('tool-erase')).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('eraser clears', async ({ page }) => {
  const initial = new Uint8Array(1024)
  initial[4 * 32 + 4] = 4
  const { errors, canvas, point, pixelColor, readStored } = await dailyPlayingSetup(page, initial)
  await expect.poll(() => pixelColor(4, 4)).toEqual([239, 68, 68, 255])

  await page.getByTestId('tool-erase').click()
  const p = point(4, 4)
  await canvas.dispatchEvent('pointerdown', { clientX: p.x, clientY: p.y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect.poll(() => pixelColor(4, 4)).toEqual([243, 234, 216, 255])
  await expect.poll(async () => (await readStored())?.[4 * 32 + 4]).toBe(0)
  expect(errors).toEqual([])
})

test('no-op erase stroke does not create empty undo step or clear redo', async ({ page }) => {
  const { errors, canvas, point, pixelColor } = await dailyPlayingSetup(page)

  // Paint (2, 2), then undo -> Redo enabled, Undo disabled
  const p1 = point(2, 2)
  await canvas.dispatchEvent('pointerdown', { clientX: p1.x, clientY: p1.y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect.poll(() => pixelColor(2, 2)).toEqual([239, 68, 68, 255])
  await page.getByTestId('tool-undo').click()
  await expect.poll(() => pixelColor(2, 2)).toEqual([243, 234, 216, 255])
  await expect(page.getByTestId('tool-redo')).toBeEnabled()
  await expect(page.getByTestId('tool-undo')).toBeDisabled()

  // Erase empty cells (6, 6) -> (7, 6) -> Redo stays enabled and Undo stays disabled
  await page.getByTestId('tool-erase').click()
  const e1 = point(6, 6)
  const e2 = point(7, 6)
  await canvas.dispatchEvent('pointerdown', { clientX: e1.x, clientY: e1.y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointermove', { clientX: e2.x, clientY: e2.y, pointerId: 1, pointerType: 'mouse', buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect(page.getByTestId('tool-redo')).toBeEnabled()
  await expect(page.getByTestId('tool-undo')).toBeDisabled()

  // Clicking Redo restores (2, 2)
  await page.getByTestId('tool-redo').click()
  await expect.poll(() => pixelColor(2, 2)).toEqual([239, 68, 68, 255])
  expect(errors).toEqual([])
})

test('undo and redo buttons and shortcuts are disabled mid-drag', async ({ page }) => {
  const { errors, canvas, point, pixelColor } = await dailyPlayingSetup(page)

  // Stroke 1 so Undo would otherwise be enabled
  const p0 = point(1, 1)
  await canvas.dispatchEvent('pointerdown', { clientX: p0.x, clientY: p0.y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect(page.getByTestId('tool-undo')).toBeEnabled()

  // Start stroke 2 and keep pointer down
  const s1 = point(4, 4)
  const s2 = point(5, 4)
  const s3 = point(6, 4)
  await canvas.dispatchEvent('pointerdown', { clientX: s1.x, clientY: s1.y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointermove', { clientX: s2.x, clientY: s2.y, pointerId: 1, pointerType: 'mouse', buttons: 1 })
  await expect(page.getByTestId('tool-undo')).toBeDisabled()
  await expect(page.getByTestId('tool-redo')).toBeDisabled()

  // Pressing Ctrl/Cmd+Z mid-drag does not undo (1, 1) or (4..5, 4)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => pixelColor(4, 4)).toEqual([239, 68, 68, 255])
  await expect.poll(() => pixelColor(5, 4)).toEqual([239, 68, 68, 255])

  // Continuing and releasing completes stroke 2, then Undo reverts entire stroke 2
  await canvas.dispatchEvent('pointermove', { clientX: s3.x, clientY: s3.y, pointerId: 1, pointerType: 'mouse', buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect(page.getByTestId('tool-undo')).toBeEnabled()
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => pixelColor(6, 4)).toEqual([243, 234, 216, 255])
  await expect.poll(() => pixelColor(4, 4)).toEqual([243, 234, 216, 255])
  await expect.poll(() => pixelColor(1, 1)).toEqual([239, 68, 68, 255])
  expect(errors).toEqual([])
})

test('lostpointercapture ends active stroke, ignores other pointers, and stops subsequent moves', async ({ page }) => {
  const { errors, canvas, point, pixelColor } = await dailyPlayingSetup(page)

  const p1 = point(2, 2)
  const p2 = point(3, 2)
  const p3 = point(5, 2)
  const other = point(9, 9)

  await canvas.dispatchEvent('pointerdown', { clientX: p1.x, clientY: p1.y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointermove', { clientX: p2.x, clientY: p2.y, pointerId: 1, pointerType: 'mouse', buttons: 1 })

  // Secondary pointer is ignored while pointer 1 is active
  await canvas.dispatchEvent('pointerdown', { clientX: other.x, clientY: other.y, pointerId: 2, pointerType: 'touch', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch' })
  await expect.poll(() => pixelColor(9, 9)).toEqual([243, 234, 216, 255])
  await expect(page.getByTestId('tool-undo')).toBeDisabled()

  // Losing pointer capture ends stroke 1 and re-enables Undo; further moves paint nothing
  await canvas.dispatchEvent('lostpointercapture', { pointerId: 1 })
  await expect(page.getByTestId('tool-undo')).toBeEnabled()
  await canvas.dispatchEvent('pointermove', { clientX: p3.x, clientY: p3.y, pointerId: 1, pointerType: 'mouse', buttons: 1 })
  await expect.poll(() => pixelColor(4, 2)).toEqual([243, 234, 216, 255])
  await expect.poll(() => pixelColor(5, 2)).toEqual([239, 227, 204, 255])
  await expect.poll(() => pixelColor(2, 2)).toEqual([239, 68, 68, 255])
  await expect.poll(() => pixelColor(3, 2)).toEqual([239, 68, 68, 255])

  await page.getByTestId('tool-undo').click()
  await expect.poll(() => pixelColor(2, 2)).toEqual([243, 234, 216, 255])
  expect(errors).toEqual([])
})
