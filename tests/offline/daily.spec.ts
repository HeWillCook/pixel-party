import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DAILY } from '../../src/game/config'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')

async function playFixture(page: Page, initiallyPlaying = false) {
  await offlineClient(page, true)
  const now = Date.now()
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 150_000, serverNow: now }
  await page.route('**/api/daily/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/me') && !initiallyPlaying ? { ...playing, status: 'not_started' } : playing }))
}

test('a reload mid-attempt resumes on the easel: measurement reconnects and drawing works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-start-button')).toHaveCount(0)
  const canvas = page.getByTestId('pixel-canvas')
  await expect(canvas).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThanOrEqual(576)
  await page.getByTestId('swatch-7').click()
  await canvas.click({ position: { x: 10, y: 10 } })
  await expect(page.getByTestId('tool-undo')).toBeEnabled()
})

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

test('mobile tools form a single row of six 36px icon buttons with no scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  const canvasBox = (await page.getByTestId('pixel-canvas').boundingBox())!
  expect(canvasBox.width).toBeGreaterThanOrEqual(340)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(812)
  const boxes = await Promise.all(['paint', 'erase', 'fill', 'pick', 'undo', 'redo'].map(async name => (await page.getByTestId(`tool-${name}`).boundingBox())!))
  for (let i = 0; i < boxes.length; i++) {
    expect(boxes[i].width).toBe(36)
    expect(boxes[i].height).toBe(36)
    expect(boxes[i].y).toBe(boxes[0].y)
    if (i > 0) expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x)
  }
})

test('canvas restores its desktop size after opening mobile score sheet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(812)
  await page.getByTestId('daily-mobile-score-trigger').click()
  await expect(page.getByTestId('daily-auto-timeline')).toBeVisible()
  await page.getByRole('button', { name: 'Close score breakdown' }).click()
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
      const palette = (await page.getByTestId('palette').boundingBox())!
      expect(easelBox.y + easelBox.height + 9).toBeLessThanOrEqual(palette.y)
      // The HTML easel carries no thruster sprites of its own: the canvas easel's thrusters are the only ones.
      await expect(easel.locator('.porch-sprite')).toHaveCount(0)
    }
  })
}

test('mobile painter tray and grading strip fit without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('painter-tray').getByTestId('toolbar')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(812)
  await expect.poll(async () => (await page.getByTestId('pixel-canvas').boundingBox())!.width).toBeGreaterThanOrEqual(340)
  const lastSwatch = page.getByTestId('swatch-15')
  const swatchBox = (await lastSwatch.boundingBox())!
  expect(swatchBox.width).toBeGreaterThanOrEqual(32)
  expect(swatchBox.height).toBeGreaterThanOrEqual(32)
  expect(swatchBox.y + swatchBox.height).toBeLessThanOrEqual(812)
  await lastSwatch.click()
  await expect(lastSwatch).toHaveAttribute('aria-pressed', 'true')
  const haikuBox = (await page.getByTestId('daily-mobile-haiku').boundingBox())!
  const scoreBox = (await page.getByTestId('daily-mobile-score-trigger').boundingBox())!
  const submitBox = (await page.getByTestId('daily-done-button').boundingBox())!
  expect(haikuBox.x + haikuBox.width).toBeLessThanOrEqual(scoreBox.x)
  expect(scoreBox.x + scoreBox.width).toBeLessThanOrEqual(submitBox.x)
  for (const bounds of [haikuBox, scoreBox, submitBox]) {
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(812)
  }
  // The strip holds Haiku, the score drawer and the early Submit; manual grades are gone.
  await expect(page.getByTestId('daily-done-button')).toBeVisible()
  await expect(page.getByTestId('daily-ask-button')).toHaveCount(0)
  await page.getByTestId('daily-mobile-score-trigger').click()
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
    for (const target of [page.getByTestId('pixel-canvas'), tray, page.getByTestId('grade-panel')]) {
      const bounds = (await target.boundingBox())!
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
    }
    if (viewport.width === 1440) await expect.poll(async () => (await page.getByTestId('pixel-canvas').boundingBox())!.width).toBeGreaterThanOrEqual(576)
  })
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`desktop Haiku, chalkboard and the halfway verdict fit ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
    await offlineClient(page, true)
    const now = Date.parse('2026-11-17T12:00:00Z')
    let releaseGrade!: () => void
    const gradeGate = new Promise<void>(resolve => { releaseGrade = resolve })
    const playing = { day: '2026-11-17', status: 'playing', prompt: 'A lighthouse', startedAt: now, endsAt: now + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 150_000, serverNow: now }
    await page.route('**/api/daily/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/me')) return route.fulfill({ json: playing })
      if (path.endsWith('/start')) return route.fulfill({ json: playing })
      if (path.endsWith('/grade')) {
        await gradeGate
        return route.fulfill({ json: { ok: true, grade: { guess: 'lighthouse', reason: 'A bright beacon above the waves.', match: 90, recognition: 80, quality: 70, matchPoints: 430, qualityBonus: 301, total: 731, elapsedMs: 150_000 }, state: { ...playing, autoUsed: 1, best: 731, nextAutoAt: null, windows: [{ index: 0, dueAt: now + 150_000, status: 'graded', score: 731, late: false }] } } })
      }
      return route.fulfill({ json: {} })
    })
    await page.goto(`${origin}/home`)
    await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
    await page.clock.fastForward(151_000)
    const haiku = page.getByTestId('haiku')
    const haikuBox = (await haiku.locator('canvas').boundingBox())!
    expect(haikuBox.height).toBeGreaterThanOrEqual(viewport.width === 1440 ? 72 : 64)
    expect(haikuBox.height).toBeLessThanOrEqual(96)
    await expect(page.getByTestId('daily-chalkboard-hint')).toBeVisible()
    await expect(page.locator('.daily-plaques__note')).toHaveCount(0)
    await expect(haiku).toHaveAttribute('data-haiku-state', 'thinking')
    await expect(page.getByTestId('haiku-bubble')).toHaveText('Hmm…')

    releaseGrade()
    await expect(page.getByTestId('daily-latest-reason')).toContainText('A bright beacon above the waves.')
    await expect(page.getByTestId('grade-total')).toHaveText('731 / 1000')
    await expect(page.getByTestId('grade-match')).toHaveText('430 / 500')
    await expect(page.getByTestId('grade-quality')).toHaveText('301 / 500')
    await expect(haiku).toHaveAttribute('data-haiku-state', 'correct')
    // The chalkboard hangs the early Submit plaque (no manual grades), and no thruster sprites sit under it.
    await expect(page.getByTestId('daily-ask-button')).toHaveCount(0)
    await expect(page.getByTestId('daily-done-button')).toBeVisible()
    await expect(page.getByTestId('daily-chalkboard-boosters')).toHaveCount(0)
    const panel = (await page.getByTestId('grade-panel').boundingBox())!
    expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height)
  })
}

test('mobile strip places Haiku on the left and shows a silent peek without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A lighthouse', startedAt: now, endsAt: now + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 150_000, serverNow: now }
  const peeks: unknown[] = []
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: playing })
    if (path.endsWith('/peek')) {
      peeks.push(route.request().postDataJSON())
      return route.fulfill({ json: { ok: true, line: 'Ooh, a lighthouse with attitude.' } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  const haikuButton = page.getByTestId('daily-mobile-haiku')
  const scoreButton = page.getByTestId('daily-mobile-score-trigger')
  const haikuBox = (await haikuButton.boundingBox())!
  const scoreBox = (await scoreButton.boundingBox())!
  expect(haikuBox.height).toBeGreaterThanOrEqual(40)
  expect(haikuBox.height).toBeLessThanOrEqual(48)
  expect(haikuBox.x + haikuBox.width).toBeLessThanOrEqual(scoreBox.x)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(812)

  // Haiku's first silent peek lands at 1:15 and is capped/non-scoring.
  await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
  await page.clock.fastForward(76_000)
  await expect.poll(() => peeks.length).toBe(1)
  await expect(haikuButton).toHaveAttribute('data-haiku-state', 'guess')
  await haikuButton.click()
  await expect(page.getByTestId('daily-mobile-haiku-popover')).toContainText('Ooh, a lighthouse with attitude.')
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(812)
  await page.getByRole('button', { name: 'Close Haiku message' }).click()
  await expect(page.getByTestId('daily-mobile-haiku-popover')).toHaveCount(0)
})

test('start zooms into the easel', async ({ page }) => {
  await playFixture(page)
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await expect(page.locator('[data-camera="easel"]')).toBeAttached()
})

test('easel camera zooms on entry with the board registered to the easel, never full size', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await playFixture(page)
  await page.goto(`${origin}/home`)
  // Every frame from the click, compare the board with where the porch easel's board really is under the live camera.
  await page.evaluate(() => {
    const samples: { error: number; width: number }[] = []
    ;(window as unknown as { __samples: typeof samples }).__samples = samples
    const sample = () => {
      const board = document.querySelector('[data-testid="pixel-canvas"]')
      const camera = document.querySelector('[data-camera="easel"] .pixel-scene__camera')
      if (board && camera) {
        const m = new DOMMatrix(getComputedStyle(camera).transform)
        const scale = Math.ceil(Math.max(innerWidth / 320, innerHeight / 180))
        const ox = (innerWidth - 320 * scale) / 2
        const oy = (innerHeight - 180 * scale) / 2
        // Landscape easel at (138, 40); its 32x32 art starts (18, 25) inside it.
        const x = ox + m.e + (138 + 18) * scale * m.a
        const y = oy + m.f + (40 + 25) * scale * m.a
        const w = 32 * scale * m.a
        const rect = board.getBoundingClientRect()
        samples.push({ width: rect.width, error: Math.max(Math.abs(rect.x - x), Math.abs(rect.y - y), Math.abs(rect.width - w)) })
      }
    }
    const tick = () => { requestAnimationFrame(() => { setTimeout(sample, 0); tick() }) }
    tick()
  })
  await page.getByTestId('daily-start-button').click()
  const backdrop = page.locator('[data-camera="easel"]')
  await expect(backdrop).toHaveAttribute('data-phase', 'entering')
  await expect(backdrop.locator('.pixel-scene__camera')).toHaveCSS('transition-duration', '0.8s')
  const camera = backdrop.locator('.pixel-scene__camera')
  const entryStart = await camera.evaluate(element => getComputedStyle(element).transform)
  await page.waitForTimeout(150)
  const entryMiddle = await camera.evaluate(element => getComputedStyle(element).transform)
  expect(entryMiddle).not.toBe(entryStart)
  await expect(backdrop).toHaveAttribute('data-phase', 'active')
  await expect(backdrop.locator('.play-scenery-layer')).toHaveCount(0)
  await expect(backdrop.locator('canvas')).toHaveCount(1)
  await page.waitForTimeout(100)
  const samples = await page.evaluate(() => (window as unknown as { __samples: { error: number; width: number }[] }).__samples)
  const entering = samples.filter(sample => sample.error > 0 || sample.width > 0)
  expect(entering.length).toBeGreaterThan(5)
  // Glued to the easel's board on every frame of the move (and exactly on it once it lands).
  expect(Math.max(...entering.map(sample => sample.error))).toBeLessThan(3)
  // It really did travel: it was drawn smaller than its final size at some frame, and lands at full size.
  const settled = entering[entering.length - 1].width
  expect(settled).toBeGreaterThanOrEqual(400)
  expect(Math.min(...entering.map(sample => sample.width))).toBeLessThan(settled * 0.9)
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
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  // The camera does not animate: reduced motion lands with a zero-duration move.
  await expect(page.locator('[data-camera="easel"] .pixel-scene__camera')).toHaveCSS('transition-duration', '0s')
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

test('camera centers the porch board on the measured drawing canvas with 1:1 proportions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await playFixture(page)
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  await expect.poll(async () => page.evaluate(() => {
    const scene = document.querySelector('[data-camera="easel"] canvas')!.getBoundingClientRect()
    const target = document.querySelector('[data-testid="pixel-canvas"]')!.getBoundingClientRect()
    const sceneCenterX = scene.left + (138 + 18 + 32 / 2) / 320 * scene.width
    const sceneCenterY = scene.top + (40 + 25 + 32 / 2) / 180 * scene.height
    const sceneBoardW = (32 / 320) * scene.width
    const sceneBoardH = (32 / 180) * scene.height
    return Math.max(
      Math.abs(sceneCenterX - target.left - target.width / 2),
      Math.abs(sceneCenterY - target.top - target.height / 2),
      Math.abs(sceneBoardW - target.width),
      Math.abs(sceneBoardH - target.height),
    )
  })).toBeLessThan(3)
})

test('reduced motion: clicking the scene around a graded result returns to the porch at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // The reduced-motion notice sits bottom-left, where this test clicks the scene; a player dismisses it once.
  await page.addInitScript(() => localStorage.setItem('pixle:reduced-motion-notice-dismissed', '1'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await endedFixture(page)
  await page.goto(`${origin}/home`)
  // "At once" = well inside the 800 ms camera move (SCENE_ZOOM_MS); a tighter bound measures the CI runner, not the app.
  await page.getByRole('button', { name: 'View result' }).click()
  await expect(page.getByTestId('daily-ended-porch-button')).toBeVisible({ timeout: 400 })
  await page.getByTestId('scene-dismiss').click({ position: { x: 60, y: 820 } })
  await expect(page.getByRole('button', { name: 'View result' })).toBeVisible({ timeout: 400 })
})

test('the halfway judgement fires once at 2:30 with the latest local canvas', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const startedAt = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt, endsAt: startedAt + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], serverNow: startedAt, nextAutoAt: startedAt + 150_000 }
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
      return route.fulfill({ status: 200, json: { ok: true, grade: { guess: 'tree', reason: 'A sturdy tree.', match: 70, recognition: 80, quality: 50, matchPoints: 290, qualityBonus: 145, total: 435, elapsedMs: 150_000 }, state: { ...playing, autoUsed: 1, nextAutoAt: null, best: 435, windows: [{ index: 0, dueAt: startedAt + 150_000, status: 'graded', score: 435, late: false }] } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
  await page.clock.fastForward(154_000)
  await expect.poll(() => grades.length).toBe(1)
  expect(grades[0]).toMatchObject({ body: { kind: 'auto', window: 0 }, status: 200 })
  await page.clock.fastForward(10_000)
  expect(grades.filter(grade => (grade.body as { kind: string }).kind === 'auto')).toHaveLength(1)
  await expect(page.getByTestId('daily-auto-timeline')).toContainText('5:00 in')
})

test('the final verdict fires automatically at 5:00 and ends the attempt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const startedAt = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt, endsAt: startedAt + 300_000, autoUsed: 1, finalUsed: false, best: 435, windows: [{ index: 0, dueAt: startedAt + 150_000, status: 'graded', score: 435, late: false }], serverNow: startedAt, nextAutoAt: null }
  const grades: string[] = []
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      const body = route.request().postDataJSON() as { kind: string }
      grades.push(body.kind)
      return route.fulfill({ json: { ok: true, grade: { guess: 'tree', reason: 'The tree stands, and so does the verdict.', match: 75, recognition: 80, quality: 60, matchPoints: 310, qualityBonus: 186, total: 496, elapsedMs: 300_000 }, state: { ...playing, status: 'ended', finalUsed: true, best: 496, nextAutoAt: null } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.clock.fastForward(300_500)
  await expect.poll(() => grades).toEqual(['final'])
  await expect(page.getByTestId('daily-ended')).toBeVisible()
  // Reduced motion skips the suspense beat: the score is already on the board.
  await expect(page.getByTestId('grade-total')).toHaveText('496 / 1000')
  await expect(page.getByTestId('daily-auto-timeline')).toContainText('5:00 · final verdict')
})

test('the final verdict plays a suspense beat, then the guess, then the score', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const startedAt = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt, endsAt: startedAt + 300_000, autoUsed: 1, finalUsed: false, best: 435, windows: [{ index: 0, dueAt: startedAt + 150_000, status: 'graded', score: 435, late: false }], serverNow: startedAt, nextAutoAt: null }
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      return route.fulfill({ json: { ok: true, grade: { guess: 'tree', reason: 'The tree stands, and so does the verdict.', match: 75, recognition: 80, quality: 60, matchPoints: 310, qualityBonus: 186, total: 496, elapsedMs: 300_000 }, state: { ...playing, status: 'ended', finalUsed: true, best: 496, nextAutoAt: null } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.clock.fastForward(300_500)
  await expect(page.getByTestId('daily-ended')).toBeVisible()
  // The paint is dry: a suspense line first, with no score in sight.
  await expect(page.getByTestId('haiku-bubble')).toContainText('The paint is dry. I have reached… a verdict.')
  await expect(page.getByTestId('grade-total')).toHaveCount(0)
  await page.clock.fastForward(2_600)
  await expect(page.getByTestId('daily-latest-guess')).toContainText('Haiku thinks: tree')
  await expect(page.getByTestId('grade-total')).toHaveCount(0)
  await page.clock.fastForward(1_500)
  await expect(page.getByTestId('grade-total')).toHaveText('496 / 1000')
})

test('Submit asks first, then runs the final verdict early and ends the attempt', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const startedAt = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt, endsAt: startedAt + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], serverNow: startedAt, nextAutoAt: startedAt + 150_000 }
  const kinds: string[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      const body = route.request().postDataJSON() as { kind: string }
      kinds.push(body.kind)
      await gate
      return route.fulfill({ json: { ok: true, grade: { guess: 'tree', reason: 'The tree stands, and so does the verdict.', match: 75, recognition: 80, quality: 60, matchPoints: 310, qualityBonus: 186, total: 496, elapsedMs: 60_000 }, state: { ...playing, status: 'ended', finalUsed: true, best: 496, nextAutoAt: null } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()

  await page.getByTestId('daily-done-button').click()
  const dialog = page.getByRole('dialog', { name: 'Submit your painting' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Submit now?')
  await expect(dialog).toContainText('Haiku will give the final verdict.')

  await page.getByTestId('daily-submit-confirm').click()
  // One final, and the button cannot fire a second while it is in flight.
  await expect.poll(() => kinds).toEqual(['final'])
  await expect(page.getByTestId('daily-done-button')).toBeDisabled()
  expect(kinds).toEqual(['final'])

  release()
  await expect(page.getByTestId('daily-ended')).toBeVisible()
  // The same choreography as the 5:00 final: suspense, a beat, the guess, then the score.
  await expect(page.getByTestId('haiku-bubble')).toContainText('The paint is dry. I have reached… a verdict.')
  await expect(page.getByTestId('grade-total')).toHaveCount(0)
  await page.clock.fastForward(2_600)
  await expect(page.getByTestId('daily-latest-guess')).toContainText('Haiku thinks: tree')
  await page.clock.fastForward(1_500)
  await expect(page.getByTestId('grade-total')).toHaveText('496 / 1000')
  // The halfway judgement never gets a turn: the attempt is over.
  await page.clock.fastForward(160_000)
  expect(kinds).toEqual(['final'])
})

test('Keep painting cancels an early submit, and Escape closes the confirm', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const startedAt = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt, endsAt: startedAt + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], serverNow: startedAt, nextAutoAt: startedAt + 150_000 }
  const kinds: string[] = []
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      kinds.push((route.request().postDataJSON() as { kind: string }).kind)
      return route.fulfill({ json: { ok: false, reason: 'busy', state: playing } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()

  // A real button: focus it and press Enter.
  await page.getByTestId('daily-done-button').focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Submit your painting' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // Keep painting closes it too, and nothing was graded.
  await page.getByTestId('daily-done-button').click()
  await expect(dialog).toBeVisible()
  await page.getByTestId('daily-submit-cancel').click()
  await expect(dialog).toHaveCount(0)
  await page.clock.fastForward(10_000)
  expect(kinds).toEqual([])
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.getByTestId('swatch-7').click()
  await page.getByTestId('pixel-canvas').click({ position: { x: 8, y: 8 } })
  await expect(page.getByTestId('tool-undo')).toBeEnabled()
})

test('ended user never sees start', async ({ page }) => {
  await offlineClient(page, true)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/daily/me', async route => {
    await gate
    const now = Date.now()
    await route.fulfill({ json: { day: new Date(now).toISOString().slice(0, 10), status: 'ended', startedAt: now - 300_000, endsAt: now, autoUsed: 0, finalUsed: true, best: 0, windows: [], nextAutoAt: null, serverNow: now } })
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
  await expect(page.getByTestId('daily-auto-timeline')).toContainText('5:00 · final verdict')
})

async function endedFixture(page: Page) {
  await offlineClient(page, true)
  const now = Date.now()
  const ended = {
    day: new Date(now).toISOString().slice(0, 10),
    status: 'ended',
    prompt: 'A lighthouse',
    startedAt: now - 300_000,
    endsAt: now,
    autoUsed: 1,
    finalUsed: true,
    best: 740,
    windows: [{ index: 0, dueAt: now - 150_000, status: 'graded', score: 740, late: false }],
    nextAutoAt: null,
    serverNow: now,
  }
  await page.route('**/api/daily/me', route => route.fulfill({ json: ended }))
}

test('a graded result zooms back out to the porch via its button and via the scene around it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await endedFixture(page)
  await page.goto(`${origin}/home`)
  await page.getByRole('button', { name: 'View result' }).click()
  await expect(page.getByTestId('daily-ended-porch-button')).toBeVisible()
  await page.getByTestId('daily-ended-porch-button').click()
  await expect(page.locator('[data-camera="easel"]')).toHaveAttribute('data-phase', 'leaving')
  await expect(page.getByRole('button', { name: 'View result' })).toBeVisible()

  await page.getByRole('button', { name: 'View result' }).click()
  await expect(page.getByTestId('daily-ended-porch-button')).toBeVisible()
  await expect(page.locator('[data-camera="easel"]')).toHaveAttribute('data-phase', 'active')
  // A click on a panel is not a background click.
  await page.getByTestId('grade-panel').click()
  await expect(page.locator('[data-camera="easel"]')).toHaveAttribute('data-phase', 'active')
  // The scene around the board is the way out.
  await expect(page.getByTestId('scene-dismiss')).toBeVisible()
  await page.getByTestId('scene-dismiss').click({ position: { x: 60, y: 820 } })
  await expect(page.locator('[data-camera="easel"]')).toHaveAttribute('data-phase', 'leaving')
  await expect(page.getByRole('button', { name: 'View result' })).toBeVisible()
})

test('a blank final renders a clean zero verdict', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const startedAt = Date.parse('2026-11-17T12:00:00Z')
  const playing = {
    day: '2026-11-17',
    status: 'playing',
    prompt: 'A lighthouse',
    startedAt,
    endsAt: startedAt + 300_000,
    autoUsed: 1,
    finalUsed: false,
    best: 0,
    windows: [{ index: 0, dueAt: startedAt + 150_000, status: 'skipped_blank', score: null, late: false }],
    nextAutoAt: null,
    serverNow: startedAt,
  }
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      return route.fulfill({
        json: {
          ok: true,
          grade: { guess: '', reason: 'Nothing is drawn yet — paint something first.', match: 0, recognition: 0, quality: 0, matchPoints: 0, qualityBonus: 0, total: 0, elapsedMs: 300_000 },
          state: { ...playing, status: 'ended', finalUsed: true, best: 0 },
        },
      })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.clock.fastForward(300_500)
  await expect(page.getByTestId('daily-ended')).toBeVisible()
  await expect(page.getByTestId('grade-total')).toHaveText('0 / 1000')
  await expect(page.getByTestId('daily-latest-guess')).toHaveText('Haiku thinks: —')
  await expect(page.getByTestId('grade-panel')).not.toContainText('Looks like a nothing')
})

test('reduced motion starts directly in the play view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await offlineClient(page, true)
  const now = Date.now()
  const playing = { day: new Date(now).toISOString().slice(0, 10), status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 150_000, serverNow: now }
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
    return route.fulfill({ json: { day: new Date(now).toISOString().slice(0, 10), status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 150_000, serverNow: now } })
  })
  await page.goto(`${origin}/home`)
  await expect.poll(() => calls).toBeGreaterThan(0)
  await expect(page.getByTestId('daily-loading')).toBeVisible()
  await expect(page.getByTestId('daily-start-button')).toHaveCount(0)
  release()
  await expect(page.getByTestId('daily-playing')).toBeVisible({ timeout: 12_000 })
})

test('no local canvas never fires the halfway auto, but the final still lands', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:02:10Z') })
  await offlineClient(page, true)
  let grades = 0
  const kinds: string[] = []
  let ends = 0
  const now = Date.parse('2026-11-17T12:02:10Z')
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/grade')) {
      grades++
      kinds.push(route.request().postDataJSON().kind)
      return route.fulfill({ json: { ok: true, grade: { guess: '', reason: 'Nothing is drawn yet.', match: 0, recognition: 0, quality: 0, matchPoints: 0, qualityBonus: 0, total: 0, elapsedMs: 300_000 }, state: { day: '2026-11-17', status: 'ended', prompt: 'A tree', startedAt: now - 170_000, endsAt: now + 130_000, autoUsed: 0, finalUsed: true, best: 0, windows: [], nextAutoAt: null, serverNow: now + 140_000 } } })
    }
    if (path.endsWith('/end')) ends++
    return route.fulfill({ json: { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now - 170_000, endsAt: now + 130_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: now - 10_000, serverNow: now } })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.clock.fastForward(10_000)
  expect(grades).toBe(0)
  await page.clock.fastForward(130_000)
  await expect.poll(() => kinds).toEqual(['final'])
  expect(ends).toBe(0)
})

test('starting without painting schedules a blank auto', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 150_000, serverNow: now }
  let auto: { kind: string; window: number; cells: string } | undefined
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: { ...playing, status: 'not_started' } })
    if (path.endsWith('/start')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      auto = route.request().postDataJSON()
      return route.fulfill({ json: { skipped: 'skipped_blank', window: 0, state: { ...playing, nextAutoAt: null } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.clock.fastForward(155_000)
  await expect.poll(() => auto?.kind).toBe('auto')
  expect(auto?.window).toBe(0)
  expect(Buffer.from(auto!.cells, 'base64').every(cell => cell === 0)).toBe(true)
  await expect(page.getByText('Skipped: nothing drawn yet')).toBeVisible()
})

test('timeout on party uses the latest stored canvas', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:04:58Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:04:58Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now - 298_000, endsAt: now + 2_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: now }
  let finalCells = ''
  let ends = 0
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/grade')) {
      const body = route.request().postDataJSON() as { kind: string; cells: string }
      if (body.kind === 'final') {
        finalCells = body.cells
        return route.fulfill({ json: { ok: true, grade: { guess: 'a tree', reason: 'The tree stands.', match: 60, recognition: 80, quality: 40, matchPoints: 260, qualityBonus: 104, total: 364, elapsedMs: 300_000 }, state: { ...playing, status: 'ended', finalUsed: true } } })
      }
      return route.fulfill({ json: { skipped: 'skipped_blank', window: 0, state: playing } })
    }
    if (path.endsWith('/end')) { ends++; return route.fulfill({ json: { ...playing, status: 'ended' } }) }
    return route.fulfill({ json: playing })
  })
  await page.goto(`${origin}/party`)
  await expect(page.getByRole('heading', { name: 'Open games' })).toBeVisible()
  const latest = await page.evaluate(() => {
    const cells = new Uint8Array(1024).fill(7)
    const encoded = btoa(String.fromCharCode(...cells))
    localStorage.setItem('daily:2026-11-17:host', encoded)
    return encoded
  })
  await page.clock.fastForward(4_000)
  await expect.poll(() => finalCells).toBe(latest)
  // The final verdict ends the attempt on its own: no separate end request.
  await expect.poll(() => ends).toBe(0)
})

test('timer uses server clock offset', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  await page.route('**/api/daily/**', route => route.fulfill({ json: { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now - 210_000, endsAt: now + 90_000, autoUsed: 1, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: now + 90_000 } }))
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-timer')).toHaveText('0:00')
})

test('auto-grade sends the latest local canvas, not the one from when the attempt started', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 150_000, serverNow: now }
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
      return route.fulfill({ json: { ok: true, grade: { guess: 'a tree', reason: 'A tree.', match: 50, recognition: 60, quality: 40, matchPoints: 230, qualityBonus: 92, total: 322, elapsedMs: 150_000 }, state: { ...playing, autoUsed: 1, nextAutoAt: null, best: 322 } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await page.getByTestId('daily-start-button').click()
  await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
  const latestCells = await page.evaluate(() => {
    const cells = new Uint8Array(1024)
    cells[50] = 7
    const encoded = btoa(String.fromCharCode(...cells))
    localStorage.setItem('daily:2026-11-17:host', encoded)
    return encoded
  })
  await page.clock.fastForward(155_000)
  await expect.poll(() => auto).toBe(1)
  expect(sentCells).toBe(latestCells)
})

test('a delayed state refresh cannot overwrite a later verdict', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  const initial = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 150_000, serverNow: now }
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
    if (path.endsWith('/grade')) {
      const body = route.request().postDataJSON() as { kind: string }
      if (body.kind === 'auto') return route.fulfill({ json: { ok: false, reason: 'judge_resting', state: { ...initial, serverNow: now + 151_000 } } })
      return route.fulfill({ json: { ok: true, grade: { guess: 'tree', reason: 'The verdict is in.', match: 70, recognition: 80, quality: 60, matchPoints: 290, qualityBonus: 174, total: 464, elapsedMs: 300_000 }, state: { ...initial, status: 'ended', finalUsed: true, best: 590, serverNow: now + 300_000 } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
  await page.clock.fastForward(151_000)
  await expect(page.getByTestId('daily-grade-error')).toContainText("Haiku's napping")

  // The missed window sends the tab to re-read the server state; hold that answer.
  hold = true
  await page.clock.fastForward(31_000)
  await expect.poll(() => pending).toBeGreaterThanOrEqual(1)

  // A later verdict lands while the stale refresh is still in flight.
  await page.clock.fastForward(120_000)
  await expect(page.getByTestId('daily-ended')).toBeVisible()
  await expect(page.getByTestId('daily-best-score')).toContainText('590')

  release()
  await page.waitForTimeout(100)
  await expect(page.getByTestId('daily-best-score')).toContainText('590')
})

test('the halfway judgement and the final verdict are separate, both automatic', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  const windows = [{ index: 0, dueAt: now + 150_000, status: 'pending', score: null, late: false }]
  const playing = { day: '2026-11-17', status: 'playing', prompt: 'A tree', startedAt: now, endsAt: now + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows, nextAutoAt: now + 150_000, serverNow: now }
  const kinds: string[] = []
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      const body = route.request().postDataJSON() as { kind: string }
      kinds.push(body.kind)
      if (body.kind === 'auto') return route.fulfill({ json: { ok: true, grade: { guess: 'tree', reason: 'recognisable tree', match: 70, recognition: 70, quality: 50, matchPoints: 280, qualityBonus: 140, total: 420, elapsedMs: 150_000 }, state: { ...playing, autoUsed: 1, best: 420, nextAutoAt: null, windows: [{ ...windows[0], status: 'graded', score: 420 }] } } })
      return route.fulfill({ json: { ok: true, grade: { guess: 'tree', reason: 'The verdict is in.', match: 70, recognition: 70, quality: 50, matchPoints: 280, qualityBonus: 140, total: 420, elapsedMs: 300_000 }, state: { ...playing, status: 'ended', finalUsed: true, best: 590, nextAutoAt: null } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
  await expect(page.getByTestId('daily-auto-timeline')).toContainText('2:30 in')
  await page.clock.fastForward(151_000)
  await expect.poll(() => kinds).toEqual(['auto'])
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await expect(page.getByTestId('daily-score-breakdown')).toContainText('Matches the prompt')
  await expect(page.getByTestId('daily-score-breakdown')).toContainText('Art quality bonus')
  await expect(page.getByTestId('grade-total')).toContainText('420 / 1000')
  await page.clock.fastForward(150_000)
  await expect.poll(() => kinds).toEqual(['auto', 'final'])
  await expect(page.getByTestId('daily-ended')).toBeVisible()
})

test('a running attempt owns the screen: no exits, back is a no-op, other routes redirect, a reload resumes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await playFixture(page)
  await page.goto(`${origin}/party`)
  await expect(page.getByRole('heading', { name: 'Open games' })).toBeVisible()
  await page.getByTestId('app-navigation').getByRole('link', { name: 'Daily' }).click()
  await page.getByTestId('daily-start-button').click()
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  // Every exit is gone from the bar and the board.
  const nav = page.getByTestId('app-navigation')
  await expect(nav.getByRole('link')).toHaveCount(0)
  await expect(nav.getByRole('button')).toHaveCount(0)
  await expect(page.getByTestId('daily-exit')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Back to porch' })).toHaveCount(0)
  // Browser back stays where it is.
  await page.goBack()
  await expect(page).toHaveURL(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  // A typed URL lands back on the easel.
  await page.evaluate(() => { window.history.pushState({}, '', '/scores'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await expect(page).toHaveURL(`${origin}/home`)
})

async function offlineClient(page: Page, signedIn = false) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: signedIn ? { user: { id: 'host', name: 'Will', email: 'will@example.test' }, session: { id: 'offline', userId: 'host', expiresAt: '2096-01-01T00:00:00Z' } } : null })
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token: signedIn ? `fixture.${Buffer.from(JSON.stringify({ sub: 'host', exp: 4_000_000_000 })).toString('base64url')}.unsigned` : null } })
    if (url.pathname === '/api/party/rooms') return route.fulfill({ json: { rooms: [] } })
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

test('signed-out home shows chalkboard hotspot and sign-in without revealing a prompt', async ({ page }) => {
  const errors = await offlineClient(page)
  let meRequests = 0
  await page.route('**/api/daily/me', async route => { meRequests++; await route.fulfill({ json: {} }) })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-sign-in-button')).toBeVisible()
  await expect(page.getByRole('link', { name: "Today's scores" })).toBeVisible()
  await expect(page.locator('.board-face [data-testid="scores-chalkboard"]')).toBeVisible()
  await expect(page.getByTestId('daily-prompt')).toHaveCount(0)
  expect(meRequests).toBe(0)
  expect(errors).toEqual([])
})

test('signed-out profile renders its heading and empty state without errors', async ({ page }) => {
  const errors = await offlineClient(page)
  await page.goto(`${origin}/u/offline-player`)
  await expect(page.getByRole('heading', { name: 'Gallery' })).toBeVisible()
  // Somebody else's bare wall: it never speaks to the viewer as if the wall were theirs.
  await expect(page.getByText("They haven't hung a painting yet")).toBeVisible()
  await expect(page.getByText('Your first painting hangs here')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('party route still renders the lobby, with no games until someone hosts one', async ({ page }) => {
  const errors = await offlineClient(page)
  await page.goto(`${origin}/party`)
  await expect(page.getByRole('heading', { name: 'Open games' })).toBeVisible()
  await expect(page.getByTestId('games-empty')).toHaveText('No games right now — host one!')
  expect(errors).toEqual([])
})

for (const todayStatus of ['not_started', 'playing', 'ended', 'unavailable'] as const) {
  test(`an invalid-day final verdict reloads ${todayStatus} without ending another day`, async ({ page }) => {
    await page.clock.install({ time: new Date() })
    const errors = await offlineClient(page, true)
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const initial = { day: yesterday, status: 'playing', prompt: 'Yesterday scene', startedAt: Date.now() - 299_000, endsAt: Date.now() + 1_000, autoUsed: 1, finalUsed: false, best: 123, windows: [], nextAutoAt: null, serverNow: Date.now() }
    const fresh = { ...initial, day: today, status: todayStatus, prompt: 'Today scene', best: 456 }
    let refreshes = 0
    let staleRejected = false
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
        staleRejected = true
        return route.fulfill({ json: { ok: false, reason: 'invalid_day', state: { ...fresh, status: 'not_started', best: 0 } } })
      }
      return route.fulfill({ json: {} })
    })
    await page.goto(`${origin}/home`)
    await expect(page.getByTestId('daily-prompt')).toHaveText('Yesterday scene')
    await page.clock.fastForward(3_000)
    await expect.poll(() => refreshes).toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('daily-prompt')).toHaveText('Yesterday scene')
    await expect(page.getByTestId('daily-grade-error')).toContainText('expired')
    expect(grades).toMatchObject([{ day: yesterday, kind: 'final' }])
    release()
    if (todayStatus === 'unavailable') {
      await expect(page.getByTestId('daily-grade-error')).toContainText('expired')
      await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } }).catch(() => {})
      await page.waitForTimeout(100)
      expect(await page.evaluate(day => localStorage.getItem(`daily:${day}:host`), today)).toBeNull()
    } else {
      await expect(page.getByTestId(`daily-${todayStatus.replace('_', '-')}`)).toBeVisible()
      if (todayStatus === 'not_started') {
        await page.waitForTimeout(300)
        expect(refreshes).toBe(1)
      }
      if (todayStatus === 'playing') {
        await expect(page.getByTestId('daily-prompt')).toHaveText('Today scene')
        await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
        await expect.poll(() => page.evaluate(day => localStorage.getItem(`daily:${day}:host`), today)).not.toBeNull()
      }
    }
    expect(errors).toEqual([])
  })
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
          endsAt: now + 300_000,
          autoUsed: 0,
      finalUsed: false,
          best: 0,
          windows: [],
          nextAutoAt: now + 60_000,
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

test('hung grade request times out, exits thinking state, and re-enables actions', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  const errors = await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  let releaseHang!: () => void
  const hangGate = new Promise<void>(resolve => { releaseHang = resolve })
  const playing = {
    day: '2026-11-17',
    status: 'playing',
    prompt: 'A lighthouse',
    startedAt: now,
    endsAt: now + 300_000,
    autoUsed: 0,
    finalUsed: false,
    best: 0,
    windows: [],
    nextAutoAt: now + 150_000,
    serverNow: now,
  }
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: playing })
    if (path.endsWith('/grade')) {
      await hangGate
      try {
        await route.abort()
      } catch {
        // Ignore if page closed cleanly after client abort
      }
      return
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })

  const haiku = page.getByTestId('haiku')

  await page.clock.fastForward(151_000)
  await expect(haiku).toHaveAttribute('data-haiku-state', 'thinking')
  await expect(page.getByTestId('haiku-bubble')).toHaveText('Hmm…')

  await page.clock.fastForward(25_500)

  await expect(haiku).toHaveAttribute('data-haiku-state', 'idle')
  await expect(page.getByTestId('daily-grade-error')).toContainText('Haiku took too long to answer — try again.')
  await expect(page.getByTestId('haiku-bubble')).toContainText('Haiku took too long to answer — try again.')
  // Painting is possible again after the timed-out judgement (no manual retry button exists).
  await page.getByTestId('pixel-canvas').click({ position: { x: 8, y: 8 } })
  await expect.poll(() => page.evaluate(() => localStorage.getItem('daily:2026-11-17:host'))).not.toBeNull()
  releaseHang()
  expect(errors).toEqual([])
})

test('mobile Haiku popover exposes dialog/status semantics and restores focus on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const errors = await offlineClient(page, true)
  const now = Date.now()
  const playing = {
    day: new Date(now).toISOString().slice(0, 10),
    status: 'playing',
    prompt: 'A lighthouse',
    startedAt: now - 30_000,
    endsAt: now + 270_000,
    autoUsed: 0,
    finalUsed: false,
    best: 0,
    windows: [],
    nextAutoAt: now + 150_000,
    serverNow: now,
  }
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: playing })
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/home`)

  const trigger = page.getByTestId('daily-mobile-haiku')
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).not.toHaveAttribute('aria-controls', /.+/)

  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(trigger).toHaveAttribute('aria-controls', 'daily-mobile-haiku-popover')

  const popover = page.getByTestId('daily-mobile-haiku-popover')
  await expect(popover).toHaveAttribute('id', 'daily-mobile-haiku-popover')
  await expect(popover).toHaveAttribute('role', 'dialog')
  await expect(popover).toHaveAttribute('aria-modal', 'false')
  await expect(popover).toHaveAttribute('aria-label', "Haiku's message")
  const liveRegion = popover.locator('.daily-mobile-haiku-popover__content')
  await expect(liveRegion).toHaveAttribute('role', 'status')
  await expect(liveRegion).toHaveAttribute('aria-live', 'polite')
  await expect(liveRegion).toHaveAttribute('aria-atomic', 'true')

  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(errors).toEqual([])
})

test('all bottom palette swatches share identical dimensions without white swatch offset', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await playFixture(page, true)
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('palette')).toBeVisible()
  const swatchBoxes = await page.getByTestId('palette').locator('button span[aria-hidden]').evaluateAll(
    els => els.map(el => {
      const r = el.getBoundingClientRect()
      return { width: r.width, height: r.height }
    }),
  )
  expect(swatchBoxes).toHaveLength(16)
  for (const box of swatchBoxes) {
    expect(Math.abs(box.width - swatchBoxes[0]!.width)).toBeLessThan(0.5)
    expect(Math.abs(box.height - swatchBoxes[0]!.height)).toBeLessThan(0.5)
  }
})

test('temporary retry daily debug button resets attempt with the same prompt', async ({ page }) => {
  const now = Date.now()
  let resetCalls = 0
  let status: 'ended' | 'not_started' | 'playing' = 'ended'
  const errors = await offlineClient(page, true)
  const makeState = (s: 'ended' | 'not_started' | 'playing') => (
    s === 'ended'
      ? { day: '2026-11-17', status: 'ended', prompt: 'A lighthouse', autoUsed: 0, finalUsed: true, best: 750, windows: [], nextAutoAt: null, serverNow: now }
      : s === 'not_started'
        ? { day: '2026-11-17', status: 'not_started', prompt: 'A lighthouse', autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: now }
        : { day: '2026-11-17', status: 'playing', prompt: 'A lighthouse', startedAt: now, endsAt: now + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 150_000, serverNow: now }
  )
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/me')) return route.fulfill({ json: makeState(status) })
    if (path.endsWith('/reset')) {
      resetCalls++
      status = 'not_started'
      return route.fulfill({ json: makeState('not_started') })
    }
    if (path.endsWith('/start')) {
      status = 'playing'
      return route.fulfill({ json: makeState('playing') })
    }
    return route.fulfill({ json: {} })
  })

  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('dev-retry-daily')).toBeVisible()
  await page.getByTestId('dev-retry-daily').click()
  await expect.poll(() => resetCalls).toBe(1)
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await expect(page.getByTestId('daily-prompt')).toHaveText('A lighthouse')
  expect(errors).toEqual([])
})

// A maximum-length reason made of the widest glyphs must fit every box that shows it, at every viewport.
function clipProbe(list: string[]) {
  const bad: string[] = []
  for (const selector of list) {
    const elements = [...document.querySelectorAll<HTMLElement>(selector)]
    if (!elements.length) bad.push(`${selector}: missing`)
    for (const el of elements) {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) bad.push(`${selector}: scroll ${el.scrollWidth}x${el.scrollHeight} > client ${el.clientWidth}x${el.clientHeight}`)
      const box = el.getBoundingClientRect()
      for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
        const clip = parent.getBoundingClientRect()
        if (box.top < clip.top - 1 || box.bottom > clip.bottom + 1 || box.left < clip.left - 1 || box.right > clip.right + 1) bad.push(`${selector}: outside ${parent.className}`)
      }
    }
  }
  return bad
}

for (const [name, viewport] of [['1980x1240', { width: 1980, height: 1240 }], ['1440x900', { width: 1440, height: 900 }], ['375x812', { width: 375, height: 812 }]] as const) {
  test(`a maximum-length judge reason of wide characters is never clipped at ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
    await offlineClient(page, true)
    const now = Date.parse('2026-11-17T12:00:00Z')
    const reason = Array.from({ length: DAILY.reasonMaxChars }, (_, index) => (index % 9 === 8 ? ' ' : index % 2 ? 'M' : 'W')).join('')
    expect(reason).toHaveLength(DAILY.reasonMaxChars)
    const playing = { day: '2026-11-17', status: 'playing', prompt: 'A lighthouse', startedAt: now, endsAt: now + 300_000, autoUsed: 0, finalUsed: false, best: 0, windows: [], nextAutoAt: now + 150_000, serverNow: now }
    await page.route('**/api/daily/**', route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/grade')) return route.fulfill({ json: { ok: true, grade: { guess: 'a lighthouse by the sea at dusk', reason, match: 90, recognition: 75, quality: 60, matchPoints: 420, qualityBonus: 252, total: 672, elapsedMs: 150_000 }, state: { ...playing, autoUsed: 1, best: 672, nextAutoAt: null } } })
      return route.fulfill({ json: playing })
    })
    await page.goto(`${origin}/home`)
    await expect(page.getByTestId('daily-playing')).toBeVisible()
    await page.getByTestId('pixel-canvas').click({ position: { x: 5, y: 5 } })
    await page.clock.fastForward(151_000)
    const check = (selectors: string[]) => page.evaluate(clipProbe, selectors)
    if (viewport.width < 600) {
      await page.getByTestId('daily-mobile-haiku').click()
      await expect(page.getByTestId('daily-mobile-haiku-popover')).toContainText('WMWM')
      expect(await check(['.daily-mobile-haiku-popover__content'])).toEqual([])
      await page.getByTestId('daily-mobile-haiku').click()
      await page.getByTestId('daily-mobile-score-trigger').click()
      await expect(page.getByTestId('daily-latest-reason')).toContainText('WMWM')
      expect(await check(['[data-testid=daily-latest-reason]', '.daily-chalk-sheet'])).toEqual([])
    } else {
      await expect(page.getByTestId('daily-latest-reason')).toContainText('WMWM')
      expect(await check(['.daily-haiku__reason', '.haiku__bubble', '[data-testid=daily-latest-reason]'])).toEqual([])
      // The stage holding the bubble and chalkboard grows to fit them instead of scrolling or clipping.
      expect(await page.locator('.daily-right-stage').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
    }
  })
}

// Review finding: Back from an ended Daily close-up (compact 52 px nav) to Scores framed the board from that compact bar and pinned it ~56 px high.
test('Back from an ended Daily to Scores frames the board like a fresh Scores page', async ({ page }) => {
  await page.setViewportSize({ width: 1980, height: 1240 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date('2026-11-17T12:00:00Z') })
  await offlineClient(page, true)
  const now = Date.parse('2026-11-17T12:00:00Z')
  const day = '2026-11-17'
  let status: 'not_started' | 'playing' | 'ended' = 'not_started'
  const state = () => ({ day, status, prompt: 'A tree', startedAt: now, endsAt: now + 300_000, autoUsed: 0, finalUsed: status === 'ended', best: 0, windows: [], nextAutoAt: status === 'playing' ? now + 150_000 : null, serverNow: Date.now() })
  await page.route('**/api/daily/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/start')) status = 'playing'
    if (path.endsWith('/grade')) {
      status = 'ended'
      return route.fulfill({ json: { ok: true, grade: { guess: 'a tree', reason: 'The tree stands.', match: 60, recognition: 80, quality: 50, matchPoints: 260, qualityBonus: 130, total: 390, elapsedMs: 300_000 }, state: state() } })
    }
    return route.fulfill({ json: state() })
  })
  await page.goto(`${origin}/scores`)
  await expect(page.getByTestId('scores-chalkboard')).toBeVisible()
  await page.getByTestId('app-navigation').getByRole('link', { name: 'Daily' }).click()
  await page.getByTestId('daily-start-button').click()
  await expect(page.getByTestId('daily-playing')).toBeVisible()
  await page.clock.fastForward(300_500)
  await expect(page.getByTestId('daily-ended')).toBeVisible()
  await expect.poll(async () => (await page.getByTestId('app-navigation').boundingBox())!.height).toBeLessThan(60)
  await page.goBack()
  await expect(page).toHaveURL(`${origin}/scores`)
  const board = page.getByTestId('scores-chalkboard')
  const settled = async () => {
    let last = ''
    await expect.poll(async () => { const box = JSON.stringify(await board.boundingBox()); const same = box === last; last = box; return same }, { timeout: 5000, intervals: [400] }).toBe(true)
    return (await board.boundingBox())!
  }
  const afterBack = await settled()
  await page.reload()
  const fresh = await settled()
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(afterBack[key] - fresh[key]), `board ${key}`).toBeLessThan(2)
})
