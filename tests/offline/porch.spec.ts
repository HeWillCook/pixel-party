import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const user = { id: 'host', name: 'Offline host', email: 'host@example.test' }
const token = `fixture.${Buffer.from(JSON.stringify({ sub: user.id, name: user.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`

type SubscribeQuery = { collection: string; where?: Record<string, unknown> }
type RecordSource = unknown[] | ((query: SubscribeQuery) => unknown[])

async function setup(page: Page, signedOut = false, records: RecordSource = []) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: signedOut ? null : { user, session: { id: 'offline', userId: user.id, expiresAt: '2096-01-01T00:00:00Z' } } })
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

test('porch objects are present and labelled', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/home`)
  // /home is per-user: crawlers are told to stay away (the landing is the public page).
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  const scene = page.locator('.porch-world')
  for (const name of ['Start Daily Challenge', "Today's scores", 'Basement studio', 'Account menu', 'Your gallery', 'Mute sounds', 'Scoring rules']) {
    await expect(scene.getByRole(name === "Today's scores" || name === 'Basement studio' || name === 'Your gallery' ? 'link' : 'button', { name, exact: true })).toBeVisible()
  }
  // The chalkboard carries the real Scores board, small and inert: the same object the Scores close-up zooms onto.
  const board = scene.locator('.board-face [data-testid="scores-chalkboard"]')
  await expect(board).toBeVisible()
  await expect(board).toContainText('Scores')
  await expect(scene.locator('.board-face')).toHaveAttribute('inert', '')
})

for (const viewport of [{ width: 375, height: 812 }, { width: 640, height: 360 }]) {
  test(`porch dialogs close and restore focus at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await setup(page)
    await page.goto(`${origin}/home`)
    const more = page.getByRole('navigation', { name: 'Porch shortcuts' }).getByRole('button', { name: 'More' })
    await more.click()
    const menu = page.getByRole('dialog', { name: 'More porch actions' })
    await expect(menu).toBeVisible()
    await expect(menu.locator(':focus')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(more).toBeFocused()
    await more.click()
    await page.mouse.click(4, 4)
    await expect(menu).toBeHidden()
    await expect(more).toBeFocused()
    const account = page.getByRole('navigation', { name: 'Porch shortcuts' }).getByRole('button', { name: 'Account' })
    await account.click()
    const dialog = page.getByRole('dialog', { name: 'Account menu' })
    await expect(dialog.locator(':focus')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(account).toBeFocused()
    await account.click()
    await page.mouse.click(4, 4)
    await expect(dialog).toBeHidden()
    await expect(account).toBeFocused()
  })
}

test('rules close with Escape and return focus', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/home`)
  const trigger = page.getByRole('button', { name: 'Scoring rules' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Daily scoring rules' })
  await expect(dialog.locator(':focus')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.mouse.click(4, 4)
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`floating scores remain inside the ${viewport.width}px viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await setup(page)
    await page.goto(`${origin}/home`)
    const board = page.getByRole('link', { name: "Today's scores" })
    await expect(board).toBeVisible()
    const bounds = await board.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
  })
}

test('daily cover and account name remain legible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.goto(`${origin}/home`)
  const cover = page.getByTestId('daily-start-button')
  await expect(cover).toContainText('Today’s prompt')
  await expect(cover).toContainText('5 minutes · your best grade counts')
  await expect(cover).toContainText('Start painting')
  const name = page.getByTestId('nav-user-name')
  await expect(name).toHaveText('Offline host')
  expect(await name.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
})

test('porch keyboard tour reaches objects with labels and focus rings', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/home`)
  const scene = page.locator('.porch-world')
  const names = ['Start Daily Challenge', "Today's scores", 'Basement studio', 'Account menu', 'Your gallery', 'Mute sounds', 'Scoring rules']
  await scene.getByRole('button', { name: names[0] }).focus()
  for (const [index, name] of names.entries()) {
    const focused = scene.locator(':focus')
    await expect(focused).toHaveAttribute('aria-label', name)
    await expect(focused.locator('.pixel-hotspot__label')).toBeVisible()
    expect(await focused.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none')
    if (index < names.length - 1) await page.keyboard.press('Tab')
  }
  await scene.getByRole('link', { name: 'Basement studio' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('vertical-scene-transition')).toBeVisible()
  await expect(page).toHaveURL(`${origin}/party`)
})

test('signed-out porch offers sign-in on easel and mailbox', async ({ page }) => {
  await setup(page, true)
  await page.goto(`${origin}/home`)
  const scene = page.locator('.porch-world')
  await expect(scene.getByRole('button', { name: 'Sign in to paint' })).toBeVisible()
  await expect(scene.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})

test('basement sign runs a vertical floor transition before navigating', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/home`)
  const startedAt = Date.now()
  await page.getByRole('link', { name: 'Basement studio' }).click()
  await expect(page.getByTestId('vertical-scene-transition')).toBeVisible()
  await expect(page.locator('.vertical-scene-transition__floor-art')).toBeVisible()
  await expect(page).toHaveURL(`${origin}/party`)
  await expect(page.getByTestId('vertical-scene-transition')).toHaveCount(0)
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(950)
})

/**
 * The stair is one column from the deck hatch, through the floor cutaway, to the basement stair. Measured on screen, frame by
 * frame, from the camera each section is really painted with (not from the layout rects, which agreed all along while the studio
 * sat at a fitted camera and the stair jogged): left edge and width of the stair in the porch, the cutaway and the basement.
 */
for (const [viewport, dsf] of [[{ width: 1980, height: 1240 }, 2], [{ width: 1440, height: 900 }, 2], [{ width: 375, height: 812 }, 3]] as const) {
  for (const direction of ['down', 'up'] as const) {
    test(`the hatch, the cutaway stair and the basement stair are one column through the floor pan ${direction} at ${viewport.width}x${viewport.height}@${dsf}x`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, deviceScaleFactor: dsf })
      const page = await context.newPage()
      await setup(page)
      await page.goto(`${origin}/${direction === 'down' ? 'home' : 'party'}`)
      await expect(page.locator(direction === 'down' ? '.porch-world .pixel-scene__canvas' : '.studio-world .pixel-scene__canvas')).toBeVisible()
      await page.waitForTimeout(500)
      await page.evaluate(() => {
        const opening = innerWidth >= innerHeight ? { x: 252, w: 40 } : { x: 108, w: 40 }
        const samples: { left: number; width: number; what: string }[][] = []
        const sample = () => {
          const frame: { left: number; width: number; what: string }[] = []
          for (const camera of Array.from(document.querySelectorAll<HTMLElement>('.pixel-scene__camera'))) {
            const scene = camera.closest<HTMLElement>('.pixel-scene')!
            const scale = parseFloat(scene.style.getPropertyValue('--px'))
            const box = camera.getBoundingClientRect() // the scene block, after the camera's own pan and zoom
            const zoom = new DOMMatrix(getComputedStyle(camera).transform).a
            frame.push({ left: box.left + opening.x * scale * zoom, width: opening.w * scale * zoom, what: scene.closest('.studio-world') ? 'basement' : 'porch' })
          }
          const floor = document.querySelector<HTMLElement>('.vertical-scene-transition__floor-art')
          if (floor) { const box = floor.getBoundingClientRect(); const scale = box.width / (innerWidth >= innerHeight ? 320 : 180); frame.push({ left: box.left + opening.x * scale, width: opening.w * scale, what: 'cutaway' }) }
          samples.push(frame)
          ;(window as unknown as { __stairSamples: typeof samples }).__stairSamples = samples
          requestAnimationFrame(sample)
        }
        sample()
      })
      if (direction === 'down') await page.getByRole('link', { name: 'Basement studio' }).click()
      else await page.getByRole('link', { name: 'Upstairs' }).first().click()
      await expect(page).toHaveURL(`${origin}/${direction === 'down' ? 'party' : 'home'}`)
      // Sample the whole move: wait for the floor cutaway to leave rather than a fixed delay (CI renders slower).
      await expect(page.locator('.vertical-scene-transition__floor-art')).toHaveCount(0, { timeout: 5000 })
      const frames = await page.evaluate(() => (window as unknown as { __stairSamples: { left: number; width: number; what: string }[][] }).__stairSamples)
      // Frames where the floor cutaway is on screen: the move itself. Every section painted in it shares the stair's column.
      const moving = frames.filter((frame) => frame.some((entry) => entry.what === 'cutaway'))
      // Enough frames to prove the move was sampled; the exact count depends on the machine's frame rate.
      expect(moving.length).toBeGreaterThan(8)
      const sections = new Set(moving.flat().map((entry) => entry.what))
      expect([...sections].sort()).toEqual(['basement', 'cutaway', 'porch'])
      const all = moving.flat()
      const left = all[0].left, width = all[0].width
      for (const entry of all) {
        expect(Math.abs(entry.left - left), `${entry.what} left`).toBeLessThan(0.75)
        expect(Math.abs(entry.width - width), `${entry.what} width`).toBeLessThan(0.75)
      }
      await context.close()
    })
  }
}

test('a stale route chunk reloads the tab once, then a scene-native card (not a bare screen) offers Reload', async ({ page }) => {
  await page.setViewportSize({ width: 1980, height: 1240 })
  await setup(page)
  let aborted = 0
  let loads = 0
  page.on('load', () => { loads += 1 })
  // The settings chunk is gone, as after a deploy: its idle prefetch fails quietly, the route import rejects.
  await page.route('**/assets/settings-*.js', (route) => { aborted += 1; return route.abort() })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-start-button')).toBeVisible()
  await page.evaluate(() => { history.pushState({ usr: null, key: 'stale', idx: 1 }, '', '/settings'); dispatchEvent(new PopStateEvent('popstate')) })
  const card = page.getByTestId('ds-error-boundary')
  await expect(card).toBeVisible({ timeout: 10_000 })
  expect(loads).toBe(2) // one reload, never a loop
  // The failing module is remembered for the tab session, so another failure of it cannot reload again.
  expect(await page.evaluate(() => sessionStorage.getItem('deepspace:stale-chunk-failed'))).toContain('/assets/settings-')
  await expect(card).toContainText('The porch just got repainted')
  // The card stands on the porch picture: a painted scene fills the screen behind it.
  const scene = await page.evaluate(() => { const el = document.querySelector('[data-testid="ds-error-boundary"] .pixel-scene')!.getBoundingClientRect(); return { w: el.width, h: el.height } })
  expect(scene.w).toBeGreaterThanOrEqual(1979)
  expect(scene.h).toBeGreaterThanOrEqual(1239)
  expect(aborted).toBeGreaterThan(0)
  // The chunk comes back: Reload walks onto the page.
  await page.unroute('**/assets/settings-*.js')
  await card.getByRole('button', { name: 'Reload' }).click()
  await expect(page.getByTestId('settings-letter')).toBeVisible({ timeout: 10_000 })
})

test('reduced motion enters party without waiting for the pan', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setup(page)
  await page.goto(`${origin}/home`)
  const start = Date.now()
  await page.getByRole('link', { name: 'Basement studio' }).click()
  await expect(page).toHaveURL(`${origin}/party`)
  expect(Date.now() - start).toBeLessThan(500)
})

test('daily loading shows only the neutral view', async ({ page }) => {
  await setup(page)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/daily/me', async route => { await gate; await route.fulfill({ json: { day: '2026-11-17', status: 'not_started', windows: [], serverNow: Date.now() } }) })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-loading')).toHaveText('Setting up your easel…')
  await expect(page.locator('.pixel-hotspot')).toHaveCount(0)
  await expect(page.getByTestId('daily-start-button')).toHaveCount(0)
  release()
  await expect(page.getByTestId('daily-start-button')).toBeVisible()
})

test('landing is prerendered with porch calls to action', async () => {
  const html = await readFile(resolve(clientDir, 'index.html'), 'utf8')
  expect(html).toContain('data-testid="static-landing"')
  expect(html).toContain('data-testid="landing-play-now"')
  expect(html).toContain('data-testid="landing-browse-lobby"')
})

for (const path of ['/', '/home']) test(`no horizontal scroll at 375px on ${path}`, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await setup(page)
  await page.goto(`${origin}${path}`)
  await expect(page.locator('.porch-world')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  const more = (await page.getByRole('button', { name: 'More', exact: true }).boundingBox())!
  expect(more.y + more.height).toBeGreaterThan(760)
  expect(more.y + more.height).toBeLessThanOrEqual(812)
})

test('portrait porch keeps every object in view and tappable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await setup(page)
  await page.goto(`${origin}/home`)
  const hotspots = page.locator('.porch-world .pixel-hotspot')
  await expect(hotspots).toHaveCount(5)
  for (const hotspot of await hotspots.all()) {
    await expect(hotspot.locator('.pixel-hotspot__label')).toBeHidden()
    const box = await hotspot.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    const hit = await hotspot.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2))
    })
    expect(hit, await hotspot.getAttribute('aria-label') ?? '').toBe(true)
  }
  const dock = page.getByRole('navigation', { name: 'Porch shortcuts' })
  await expect(page.locator('.board-face [data-testid="scores-chalkboard"]')).toBeVisible()
  for (const name of ['Scores', 'Gallery', 'Party', 'Account', 'More']) await expect(dock.getByRole(name === 'Account' || name === 'More' ? 'button' : 'link', { name, exact: true })).toBeVisible()
  const more = page.getByRole('button', { name: 'More', exact: true })
  const moreBox = (await more.boundingBox())!
  expect(moreBox.y + moreBox.height).toBeGreaterThan(760)
  await expect(page.locator('.porch-nav__mail-art')).toBeHidden()
  await more.click()
  const menu = page.getByRole('group', { name: 'More porch actions' })
  for (const name of ['Public board', 'Mute sounds', 'Scoring rules']) {
    const item = menu.getByText(name, { exact: true })
    await expect(item).toBeVisible()
    const bounds = (await item.boundingBox())!
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(812)
  }
  await menu.getByRole('button', { name: 'Scoring rules' }).click()
  await expect(page.getByRole('dialog', { name: 'Daily scoring rules' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()
})

test('porch and navigation share the scene pixel scale', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-start-button')).toBeVisible()
  await expect.poll(() => page.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue('--px'), getComputedStyle(document.querySelector('.pixel-scene')!).getPropertyValue('--px')])).toEqual(['5px', '5px'])
  await page.locator('.porch-world').getByRole('link', { name: 'Basement studio' }).click()
  // The basement scene keeps the same integer scene scale as the porch (no document-wide
  // --px reset mid-move), so the nav and the arriving room agree on pixel size.
  await expect.poll(() => page.evaluate(() => {
    const scene = document.querySelector('.studio-world .pixel-scene')
    const pagePx = getComputedStyle(document.documentElement).getPropertyValue('--px').trim()
    const scenePx = scene ? getComputedStyle(scene).getPropertyValue('--px').trim() : ''
    return [pagePx, scenePx]
  })).toEqual(['5px', '5px'])
})

for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 812 }]) {
  test(`sign beam has four signs at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await setup(page)
    await page.goto(`${origin}/party`)
    if (viewport.width < 768) await page.getByRole('button', { name: 'Toggle menu' }).click()
    const nav = page.getByTestId('app-navigation')
    await expect(nav.locator('.porch-nav__sign:visible')).toHaveText(['Daily', 'Scores', 'Party', 'Gallery'])
    for (const label of ['Daily', 'Scores', 'Party', 'Gallery']) {
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

test('navigation artwork uses the scene roof and mailbox', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/party`)
  const beam = page.locator('.porch-nav__roof canvas').first()
  const mailbox = page.getByRole('button', { name: 'Account menu' }).locator('canvas').first()
  await expect(beam).toBeVisible()
  await expect(mailbox).toBeVisible()
  expect((await beam.boundingBox())!.height).toBeGreaterThanOrEqual(36)
  expect((await mailbox.boundingBox())!.height).toBeGreaterThanOrEqual(60)
  await expect(page.getByRole('link', { name: 'Party', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('sunset backdrop uses hard bands and a dithered seam', async ({ page }) => {
  await setup(page)
  await page.goto(`${origin}/party`)
  const backdrop = await page.evaluate(() => ({ background: getComputedStyle(document.body).backgroundImage, dither: getComputedStyle(document.body, '::before').backgroundImage }))
  expect(backdrop.background).toContain('linear-gradient')
  expect(backdrop.dither).toContain('conic-gradient')
})

test('signed-out mailbox raises its flag', async ({ page }) => {
  await setup(page, true)
  await page.goto(`${origin}/party`)
  // The letterbox is a canvas: its standing red flag paints detail pixels above the box, which a lowered flag leaves clear.
  const mailbox = page.getByTestId('nav-sign-in-button').locator('canvas.porch-sprite')
  await expect(mailbox).toBeVisible()
  const flagPixel = () => mailbox.evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(51, 8, 1, 1).data))
  await expect.poll(async () => (await flagPixel())[3]).toBe(255)
})

test('signed-out Gallery closes the mobile drawer before opening sign-in', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await setup(page, true)
  await page.goto(`${origin}/party`)
  const toggle = page.getByRole('button', { name: 'Toggle menu' })
  await toggle.click()
  await page.getByRole('link', { name: 'Gallery', exact: true }).click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('the logo has a 44px mobile target', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await setup(page)
  await page.goto(`${origin}/party`)
  const logo = page.getByRole('link', { name: 'Pixel Party, home', exact: true })
  expect((await logo.boundingBox())!.height).toBeGreaterThanOrEqual(44)
})

test('reduced motion keeps the focused sign still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setup(page)
  await page.goto(`${origin}/party`)
  const sign = page.getByRole('link', { name: 'Party', exact: true })
  await sign.focus()
  await expect(sign).toHaveCSS('transform', 'none')
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

  test(`capture party-rooms ${viewport.width}`, async ({ page }) => {
    test.skip(process.env.SCREENSHOTS !== '1')
    await page.setViewportSize(viewport)
    await setup(page, false, [
      { recordId: 'r-play', data: { name: 'Pixel Party', mode: 'coop', visibility: 'public', joinCode: 'play', hostId: 'system', status: 'playing', playerCount: 5, lastActiveAt: 5000, isDefaultBoard: true } },
      { recordId: 'r-1', data: { name: "Will's Studio", mode: 'coop', visibility: 'public', joinCode: 'QX3J', hostId: 'host', status: 'playing', playerCount: 3, lastActiveAt: 4000, isDefaultBoard: false } },
      { recordId: 'r-2', data: { name: 'Sunset Cove', mode: 'coop', visibility: 'public', joinCode: 'M9K2', hostId: 'other', status: 'lobby', playerCount: 2, lastActiveAt: 3000, isDefaultBoard: false } },
      { recordId: 'r-3', data: { name: 'Night Owls', mode: 'coop', visibility: 'public', joinCode: 'P4W8', hostId: 'other', status: 'playing', playerCount: 4, lastActiveAt: 2000, isDefaultBoard: false } },
      { recordId: 'r-4', data: { name: 'Extra Easel', mode: 'coop', visibility: 'public', joinCode: 'Z7T1', hostId: 'other', status: 'lobby', playerCount: 1, lastActiveAt: 1000, isDefaultBoard: false } },
    ])
    await page.goto(`${origin}/party`)
    await expect(page.getByTestId('app-navigation')).toBeVisible()
    await expect(page.getByTestId('room-card-QX3J')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const dir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-18-porch')
    await mkdir(dir, { recursive: true })
    await page.screenshot({ path: resolve(dir, `party-rooms-${viewport.width}x${viewport.height}.png`), fullPage: true })
  })
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`capture porch beam ${viewport.width}`, async ({ page }) => {
    test.skip(process.env.SCREENSHOTS !== '1')
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await setup(page)
    await page.goto(`${origin}/home`)
    await expect(page.getByTestId('daily-start-button')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const dir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-18-porch')
    await mkdir(dir, { recursive: true })
    await page.getByTestId('app-navigation').screenshot({ path: resolve(dir, `porch-beam-${viewport.width}x${viewport.height}.png`) })
  })
}

test('capture porch roof close-up 1440', async ({ page }) => {
  test.skip(process.env.SCREENSHOTS !== '1')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setup(page)
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-start-button')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const dir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-18-porch')
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: resolve(dir, 'porch-roof-1440x200.png'), clip: { x: 0, y: 0, width: 1440, height: 200 } })
})

test('capture home 1280', async ({ page }) => {
  test.skip(process.env.SCREENSHOTS !== '1')
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('app-navigation')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const dir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-18-porch')
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: resolve(dir, 'home-1280x720.png'), fullPage: true })
})

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
  set(25, 5, 15)
  set(20, 2, 15)
  fillRect(0, 24, 32, 8, 9)
  for (let i = 0; i < 32; i += 4) fillRect(i, 26, 2, 1, 10)
  fillRect(0, 21, 32, 3, 14)
  for (let r = 0; r < 14; r++) {
    const w = 6 + Math.floor(r / 3)
    const c = Math.floor(r / 3) % 2 ? 2 : 4
    fillRect(16 - Math.floor(w / 2), 8 + r, w, 1, c)
  }
  fillRect(13, 4, 6, 4, 1)
  fillRect(14, 5, 4, 2, 6)
  for (let x = 18; x < 32; x++) {
    const spread = Math.floor((x - 18) / 3) + 1
    fillRect(x, 5 - spread, 1, spread * 2 + 1, 15)
  }
  fillRect(12, 3, 8, 1, 4)
  fillRect(15, 2, 2, 1, 4)
  return Buffer.from(cells).toString('base64')
}

test('ended porch easel shows the player painting and score tag, and opens result view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setup(page)
  const cells = samplePaintingBase64()
  await page.route('**/api/daily/me', route => route.fulfill({ json: { day: '2026-11-17', status: 'ended', prompt: 'A lighthouse', startedAt: Date.now() - 300_000, endsAt: Date.now(), autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: true, best: 740, windows: [], nextAutoAt: null, serverNow: Date.now(), lastCells: cells } }))
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-ended')).toBeVisible()
  await expect(page.getByTestId('porch-easel-tag')).toHaveText("Today's painting · 740/1000")
  const centerPixel = await page.locator('.pixel-scene__canvas').evaluate((el) => {
    const canvas = el as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    // Easel at (138, 40), painting at (138 + 18, 40 + 25) = (156, 65), lighthouse tower at (15, 10) -> (171, 75)
    // The backing store now renders at CSS size x DPR from a 640x360 buffer, so map the
    // scene-space sample point into the canvas's own pixel grid.
    const scaleX = canvas.width / 320
    const scaleY = canvas.height / 180
    return Array.from(ctx.getImageData(
      Math.round((138 + 18 + 15) * scaleX),
      Math.round((40 + 25 + 10) * scaleY),
      1,
      1,
    ).data)
  })
  // Color 4 (#ef4444 = 239,68,68) or 16 (#ffffff = 255,255,255)
  expect([[239, 68, 68, 255], [255, 255, 255, 255]]).toContainEqual(centerPixel)
  await page.getByRole('button', { name: 'View result' }).click()
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 }]) {
  for (const state of ['landing', 'signed-out', 'not-started', 'ended'] as const) {
    test(`capture porch ${state} ${viewport.width}`, async ({ page }) => {
      test.skip(process.env.SCREENSHOTS !== '1')
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await setup(page, state === 'signed-out')
      if (state === 'ended') await page.route('**/api/daily/me', route => route.fulfill({ json: { day: '2026-11-17', status: 'ended', autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: true, best: 740, windows: [], nextAutoAt: null, serverNow: Date.now(), lastCells: samplePaintingBase64() } }))
      await page.goto(`${origin}${state === 'landing' ? '/' : '/home'}`)
      await expect(page.locator('.pixel-scene__canvas')).toBeVisible()
      if (state === 'not-started') await expect(page.getByTestId('daily-start-button')).toBeVisible()
      if (state === 'ended') await expect(page.getByTestId('daily-ended')).toBeVisible()
      if (state === 'signed-out') await expect(page.getByTestId('daily-sign-in-button')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const dir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-18-porch')
      await mkdir(dir, { recursive: true })
      await page.screenshot({ path: resolve(dir, `porch-${state}-${viewport.width}x${viewport.height}.png`) })
    })
  }
}

test('capture studio room states across viewports', async ({ page }) => {
  test.skip(process.env.SCREENSHOTS !== '1')
  const dir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-18-porch')
  await mkdir(dir, { recursive: true })
  const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 }]
  const cells = new Uint8Array(32 * 32)
  for (let y = 6; y < 22; y++) for (let x = 8; x < 24; x++) cells[y * 32 + x] = (x + y) % 2 === 0 ? 4 : 6
  const encodedCells = Buffer.from(cells).toString('base64')
  const now = Date.now()

  await setup(page, false, [
    { recordId: 'room', data: { name: "Will's Studio", mode: 'coop', visibility: 'private', joinCode: 'QX3J', hostId: 'host', status: 'playing', playerCount: 3, isDefaultBoard: false } },
  ])
  let server!: WebSocketRoute
  await page.routeWebSocket('**/api/pixel/**', (socket) => {
    server = socket
    socket.send(JSON.stringify({
      t: 'snapshot',
      mode: 'coop',
      width: 32,
      height: 32,
      cells: encodedCells,
      round: { id: 'r1', word: 'LIGHTHOUSE', state: 'playing', startedAt: now - 45_000, endsAt: now + 255_000, askAvailableAt: now - 1000 },
      you: { userId: 'host', cooldownUntil: 0 },
      players: 3,
      watching: 1,
      roster: [
        { userId: 'host', name: 'Will' },
        { userId: 'u2', name: 'Alex' },
        { userId: 'u3', name: 'Sam' },
      ],
      aiResting: false,
    }))
    socket.send(JSON.stringify({ t: 'judgement', zone: 'all', guesses: ['beacon', 'tower'], confidence: 0.55, matched: false }))
    socket.send(JSON.stringify({ t: 'judgement', zone: 'all', guesses: ['lighthouse', 'beacon'], confidence: 0.91, matched: false }))
  })

  await page.setViewportSize(viewports[0])
  await page.goto(`${origin}/r/QX3J`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  await expect(page.getByTestId('guess-list')).toContainText('lighthouse, beacon')
  await page.evaluate(() => document.fonts.ready)

  for (const vp of viewports) {
    await page.setViewportSize(vp)
    await page.waitForTimeout(160)
    await page.screenshot({ path: resolve(dir, `room-playing-${vp.width}x${vp.height}.png`) })
  }

  // Results overlay
  server.send(JSON.stringify({
    t: 'round',
    round: { id: 'r1', word: 'LIGHTHOUSE', state: 'intermission', startedAt: now - 60_000, endsAt: null, endedAt: now, askAvailableAt: 0, result: { outcome: 'won', score: 836, contributorCount: 3 } },
  }))
  await expect(page.getByTestId('round-overlay')).toBeVisible()
  for (const vp of viewports) {
    await page.setViewportSize(vp)
    await page.waitForTimeout(160)
    await page.screenshot({ path: resolve(dir, `room-overlay-${vp.width}x${vp.height}.png`) })
  }

  // Lobby
  server.send(JSON.stringify({
    t: 'round',
    round: { id: 'r-lobby', word: '', state: 'lobby', startedAt: now, endsAt: null, askAvailableAt: 0 },
  }))
  await expect(page.getByTestId('room-lobby')).toBeVisible()
  for (const vp of viewports) {
    await page.setViewportSize(vp)
    await page.waitForTimeout(160)
    await page.screenshot({ path: resolve(dir, `room-lobby-${vp.width}x${vp.height}.png`) })
  }

  // Error states (unauthorized, not_found, closed)
  for (const err of [
    { name: 'unauthorized', status: 401, testId: 'room-error-unauthorized' },
    { name: 'not_found', status: 404, testId: 'room-error-not-found' },
    { name: 'closed', status: 410, testId: 'room-error-closed' },
  ] as const) {
    await page.route('**/api/pixel/**', (route) => route.fulfill({ status: err.status, body: err.name }))
    await page.routeWebSocket('**/api/pixel/**', (socket) => socket.close({ code: 1008 }))
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(`${origin}/r/MISS`)
    await expect(page.getByTestId(err.testId)).toBeVisible()
    await page.screenshot({ path: resolve(dir, `room-error-${err.name}-1280x720.png`) })
  }
})

test('studio mailbox tag fits username and order form submit uses readable button sizing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.goto(`${origin}/party`)
  const tag = page.getByTestId('nav-user-name')
  await expect(tag).toHaveText('Offline host')
  const tagMetrics = await tag.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    right: el.getBoundingClientRect().right,
    viewportWidth: window.innerWidth,
  }))
  expect(tagMetrics.scrollWidth).toBeLessThanOrEqual(tagMetrics.clientWidth + 1)
  expect(tagMetrics.right).toBeLessThanOrEqual(tagMetrics.viewportWidth)

  const submit = page.getByTestId('create-room-submit')
  await expect(submit).toBeVisible()
  const submitStyle = await submit.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { fontSize: parseFloat(cs.fontSize), height: el.getBoundingClientRect().height }
  })
  expect(submitStyle.fontSize).toBeGreaterThanOrEqual(14)
  expect(submitStyle.height).toBeGreaterThanOrEqual(32)
})

// DEV ONLY (__DEBUG_TOOLS__): remove with the debug-room button
test('the debug-room button creates a generated room through the normal path and walks in, or opens the sign-in slip when signed out', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page, true)
  await page.goto(`${origin}/party`)
  await page.getByTestId('temp-debug-room').click()
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible()

  await setup(page)
  await page.route('**/api/actions/createRoom', route => route.fulfill({ json: { success: true, data: { roomId: 'r1', joinCode: 'ABCD' } } }))
  await page.goto(`${origin}/party`)
  const request = page.waitForRequest('**/api/actions/createRoom')
  await page.getByTestId('temp-debug-room').click()
  expect((await request).postDataJSON()).toMatchObject({ name: expect.stringMatching(/^Debug room [A-Z0-9]{4}$/), mode: 'coop', visibility: 'public' })
  await expect(page).toHaveURL(`${origin}/r/ABCD`)
})

test('remaining screens use porch-wood panels, letter settings, and Haiku\'s 404', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/settings`)
  await expect(page.getByTestId('settings-letter')).toContainText('From the porch mailbox')
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')

  await page.goto(`${origin}/does-not-exist`)
  await expect(page.getByTestId('not-found-bubble')).toContainText("Oops — this page doesn't exist.")
  await expect(page.getByTestId('not-found-bubble')).toContainText('I may have spilled it.')
  await expect(page.getByTestId('not-found-porch-sign')).toHaveAttribute('href', '/home')
  await expect(page.getByTestId('not-found-porch-sign')).toHaveText('← Back to the porch')
  await expect(page.locator('.pixel-scene__canvas')).toBeVisible()

  await setup(page, true)
  await page.goto(`${origin}/settings`)
  await expect(page.getByTestId('settings-letter').getByTestId('sign-in-card')).toBeVisible()
})

test('non-scene pages render porch roof overhang immediately without flat dark slab below beam', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.route('**/api/integrations', (route) =>
    route.fulfill({ json: { success: true, data: { integrations: { anthropic: {}, deepgram: {} } } } }),
  )
  for (const [path, signedOut] of [['/settings', false], ['/settings', true]] as const) {
    if (signedOut) await setup(page, true)
    await page.goto(`${origin}${path}`)
    const roofCanvas = page.locator('.porch-nav__roof canvas').first()
    await expect(roofCanvas).toBeVisible()
    const metrics = await roofCanvas.evaluate((el) => {
      const canvas = el as HTMLCanvasElement
      const ctx = canvas.getContext('2d')!
      // The roof canvas is backed at 2x detail, so scene row N is canvas row N * 2.
      const beamHighlight = ctx.getImageData(0, 12 * 2, 1, 1).data
      const belowBeam = ctx.getImageData(0, 18 * 2, 1, 1).data
      return {
        height: canvas.height,
        beamHighlight: Array.from(beamHighlight),
        belowBeamAlpha: belowBeam[3],
      }
    })
    // Scene row 12 in drawPorchRoof is P.wood[4] (#ecae7d = 236,174,125,255); rows >= 18 are transparent
    expect(metrics.height).toBeGreaterThanOrEqual(18 * 2)
    expect(metrics.beamHighlight).toEqual([236, 174, 125, 255])
    expect(metrics.belowBeamAlpha).toBe(0)
  }
})

test('capture Task 6 remaining screens across viewports', async ({ page }) => {
  test.skip(process.env.SCREENSHOTS !== '1')
  const dir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-18-porch')
  await mkdir(dir, { recursive: true })
  const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 }]

  // 404: Haiku among the paint he spilled
  await setup(page)
  for (const vp of viewports) {
    await page.setViewportSize(vp)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${origin}/no-such-page`)
    await expect(page.getByTestId('not-found-page')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(120)
    await page.screenshot({ path: resolve(dir, `not-found-${vp.width}x${vp.height}.png`) })
  }

  // Studio overflow at 1366x768 and portrait tablet at 1024x1366
  await setup(page, false, [
    { recordId: 'r-play', data: { name: 'Pixel Party', mode: 'coop', visibility: 'public', joinCode: 'play', hostId: 'system', status: 'playing', playerCount: 5, lastActiveAt: 5000, isDefaultBoard: true } },
    { recordId: 'r-1', data: { name: "Will's Studio", mode: 'coop', visibility: 'public', joinCode: 'QX3J', hostId: 'host', status: 'playing', playerCount: 3, lastActiveAt: 4000, isDefaultBoard: false } },
    { recordId: 'r-2', data: { name: 'Sunset Cove', mode: 'coop', visibility: 'public', joinCode: 'M9K2', hostId: 'other', status: 'lobby', playerCount: 2, lastActiveAt: 3000, isDefaultBoard: false } },
    { recordId: 'r-3', data: { name: 'Night Owls', mode: 'coop', visibility: 'public', joinCode: 'P4W8', hostId: 'other', status: 'playing', playerCount: 4, lastActiveAt: 2000, isDefaultBoard: false } },
    { recordId: 'r-4', data: { name: 'Extra Easel', mode: 'coop', visibility: 'public', joinCode: 'Z7T1', hostId: 'other', status: 'lobby', playerCount: 1, lastActiveAt: 1000, isDefaultBoard: false } },
  ])
  for (const vp of [{ width: 1366, height: 768 }, { width: 1024, height: 1366 }]) {
    await page.setViewportSize(vp)
    await page.goto(`${origin}/party`)
    await expect(page.getByTestId('room-card-QX3J')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: resolve(dir, `party-rooms-${vp.width}x${vp.height}.png`), fullPage: true })
  }

  // Magic Easel live preview (1440x900 & 375x812) and puff of smoke (1280x720)
  const easelCells = new Uint8Array(32 * 32)
  for (let y = 6; y < 22; y++) for (let x = 8; x < 24; x++) easelCells[y * 32 + x] = (x + y) % 2 === 0 ? 4 : 6
  const easelEncoded = Buffer.from(easelCells).toString('base64')
  const easelNow = Date.now()
  await page.routeWebSocket('**/api/pixel/**', (socket) => {
    socket.send(JSON.stringify({
      t: 'snapshot',
      mode: 'coop',
      width: 32,
      height: 32,
      cells: easelEncoded,
      round: { id: 'r1', word: 'LIGHTHOUSE', state: 'playing', startedAt: easelNow - 30_000, endsAt: easelNow + 270_000, askAvailableAt: easelNow - 1000 },
      you: { userId: null, cooldownUntil: 0 },
      players: 3,
      watching: 1,
      roster: [{ userId: 'host', name: 'Will' }],
      aiResting: false,
    }))
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(`${origin}/party`)
  await page.evaluate(() => document.fonts.ready)
  await page.getByTestId('room-card-QX3J').click()
  await expect(page.getByTestId('magic-easel-flash')).toBeVisible()
  await page.waitForTimeout(260)
  await expect(page.locator('.studio-magic-easel--transforming')).toBeVisible()
  await page.screenshot({ path: resolve(dir, 'party-easel-transform-1440x900.png') })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${origin}/party`)
  await page.getByTestId('room-card-QX3J').click()
  await expect(page.getByTestId('magic-easel-canvas')).toBeVisible()
  await expect(page.getByTestId('magic-easel-word')).toHaveText('_ _ _ _ _ _ _ _ _ _')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: resolve(dir, 'party-easel-preview-1440x900.png') })

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${origin}/party`)
  await expect(page.getByTestId('room-card-QX3J')).toHaveCount(1)
  await page.getByTestId('room-card-QX3J').click()
  await expect(page.getByTestId('magic-easel-canvas')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: resolve(dir, 'party-easel-preview-375x812.png') })

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`${origin}/party`)
  await page.getByTestId('join-code-input').fill('NOPE')
  await page.getByTestId('join-code-submit').click()
  await expect(page.getByTestId('magic-easel-smoke')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: resolve(dir, 'party-easel-smoke-1280x720.png') })
})

test('StaticPorchNav renders landing signs without false aria-current and fits tablet 768px nav without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page, true)
  await page.goto(`${origin}/`)
  const landingNav = page.getByTestId('app-navigation')
  await expect(landingNav.locator('.porch-nav__sign[aria-current="page"]')).toHaveCount(0)
  for (const label of ['Daily', 'Scores', 'Party', 'Gallery']) {
    await expect(landingNav.getByRole('link', { name: label, exact: true })).toBeVisible()
  }

  for (const path of ['/party', '/settings']) {
    await page.setViewportSize({ width: 768, height: 1024 })
    await setup(page)
    await page.goto(`${origin}${path}`)
    const nav = page.getByTestId('app-navigation')
    await expect(nav.getByRole('link', { name: 'Gallery', exact: true })).toBeVisible()
    const tag = page.getByTestId('nav-user-name')
    await expect(tag).toBeVisible()
    const metrics = await tag.evaluate((el) => ({
      navScrollWidth: document.documentElement.scrollWidth,
      tagRight: el.getBoundingClientRect().right,
      innerWidth: window.innerWidth,
    }))
    expect(metrics.navScrollWidth).toBeLessThanOrEqual(768)
    expect(metrics.tagRight).toBeLessThanOrEqual(metrics.innerWidth)
  }
})

test('play pages show CompactRoof with integer-scaled compact logo and clean 375x667 mobile tray', async ({ page }) => {
  await setup(page)
  await page.route('**/api/daily/me', (route) =>
    route.fulfill({
      json: {
        day: '2026-11-17',
        status: 'playing',
        prompt: 'A lighthouse',
        startedAt: Date.now() - 30_000,
        endsAt: Date.now() + 270_000,
        autoUsed: 0,
        asksUsed: 0,
        asksLeft: 3,
        finalUsed: false,
        best: 0,
        windows: [],
        nextAutoAt: null,
        serverNow: Date.now(),
      },
    }),
  )
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`${origin}/home`)
  await expect(page.locator('.daily-play')).toBeVisible()
  await expect(page.locator('.porch-nav__compact-roof')).toBeVisible()
  await expect(page.locator('.porch-nav__roof')).toBeHidden()
  const compactLogo = page.locator('.porch-nav__logo-compact')
  await expect(compactLogo).toBeVisible()
  const logoBox = (await compactLogo.boundingBox())!
  expect(Math.round(logoBox.width)).toBe(86)
  expect(Math.round(logoBox.height)).toBe(40)

  const cells = Buffer.from(new Uint8Array(32 * 32)).toString('base64')
  const now = Date.now()
  await page.routeWebSocket('**/api/pixel/**', (socket) => {
    socket.send(JSON.stringify({
      t: 'snapshot',
      mode: 'coop',
      width: 32,
      height: 32,
      cells,
      round: { id: 'r1', word: 'LIGHTHOUSE', state: 'playing', startedAt: now - 45_000, endsAt: now + 255_000, askAvailableAt: now - 1000 },
      you: { userId: 'host', cooldownUntil: 0 },
      players: 2,
      watching: 0,
      roster: [{ userId: 'host', name: 'Will' }],
      aiResting: false,
    }))
  })
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto(`${origin}/r/QX3J`)
  await expect(page.locator('.room-play')).toBeVisible()
  await expect(page.locator('.porch-nav__compact-roof')).toBeVisible()
  await expect(page.locator('.porch-nav__roof')).toBeHidden()
  await expect(page.locator('.porch-nav__logo-compact')).toBeVisible()
  await expect(page.locator('.play-layout__mobile-actions')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

test('scores page lists today', async ({ page }) => {
  const cells = samplePaintingBase64()
  const todayScores = [
    { recordId: 's1', data: { day: '2026-11-17', userId: 'u1', displayName: 'Alice', avatarUrl: '', score: 912, fit: 460, recognition: 350, speed: 102, bestElapsedMs: 28000, ended: 1, medal: 1 } },
    { recordId: 's2', data: { day: '2026-11-17', userId: 'u2', displayName: 'Bob', avatarUrl: '', score: 740, fit: 380, recognition: 280, speed: 80, bestElapsedMs: 41000, ended: 1, medal: 2 } },
    { recordId: 's3', data: { day: '2026-11-17', userId: 'u3', displayName: 'Cara', avatarUrl: '', score: 580, fit: 300, recognition: 220, speed: 60, bestElapsedMs: 55000, ended: 1, medal: 3 } },
  ]
  await setup(page, false, (query) => {
    if (query.collection === 'dailyScores' && query.where?.day === '2026-11-17') return todayScores
    return []
  })
  await page.route('**/api/daily/me', route => route.fulfill({
    json: { day: '2026-11-17', status: 'ended', autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: true, best: 740, windows: [], nextAutoAt: null, serverNow: Date.now(), lastCells: cells },
  }))
  await page.route('**/api/daily/today/drawings', route => route.fulfill({
    json: {
      drawings: [
        { data: { userId: 'u1', cells, guess: 'lighthouse' } },
        { data: { userId: 'u2', cells, guess: 'sailboat' } },
      ],
    },
  }))

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`${origin}/scores`)
  await expect(page.getByTestId('scores-page')).toBeVisible()
  await expect(page.getByTestId('scores-chalkboard')).toBeVisible()
  await expect(page.getByTestId('scores-ledge')).toBeVisible()
  await expect(page.getByTestId('scores-haiku')).toBeVisible()
  // No dark deck band: the real porch (the whole chalkboard, thrusters included) shows under the board at the same scale.
  await expect(page.getByTestId('scores-deck')).toHaveCount(0)
  const boardBox = (await page.getByTestId('scores-chalkboard').boundingBox())!
  const sceneBox = (await page.locator('.scores-backdrop .pixel-scene__canvas').boundingBox())!
  expect(sceneBox.y + sceneBox.height).toBeGreaterThan(boardBox.y + boardBox.height + 40)
  expect(boardBox.y + boardBox.height).toBeLessThan(720 - 40)
  // The chalkboard's thrusters are the porch canvas's own, registered to this board, so no DOM copies are drawn here.
  await expect(page.getByTestId('scores-boosters')).toHaveCount(0)

  const board = page.getByTestId('scores-chalkboard')
  await expect(board.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/u/u1')
  await expect(board).toContainText('912')
  await expect(board).toContainText('740')
  await expect(board).toContainText('580')
  await expect(board.getByLabel(/Gold medal/)).toBeVisible()
  await expect(board.getByLabel(/Silver medal/)).toBeVisible()
  await expect(board.getByLabel(/Bronze medal/)).toBeVisible()
  await expect(board.getByRole('img', { name: 'Pixel drawing' })).toHaveCount(2)
  const scoreScaleMetrics = await board.evaluate((el) => {
    const px = parseFloat(getComputedStyle(el).getPropertyValue('--px')) || 3
    const thumb = el.querySelector('.scores-thumb') as HTMLCanvasElement
    const trophy = el.querySelector('.scores-board-title canvas') as HTMLCanvasElement
    const medal = el.querySelector('.scores-medal') as HTMLCanvasElement
    const haiku = el.parentElement?.querySelector('.haiku__canvas') as HTMLCanvasElement
    const rowLink = el.querySelector('.scores-row-link') as HTMLElement
    return {
      px,
      thumbRatio: thumb.clientWidth / thumb.width,
      trophyRatio: trophy.clientWidth / trophy.width,
      medalRatio: medal.clientWidth / medal.width,
      haikuRatio: haiku.clientWidth / haiku.width,
      rowLinkHeight: rowLink.getBoundingClientRect().height,
    }
  })
  expect(scoreScaleMetrics.px).toBe(3)
  expect(scoreScaleMetrics.thumbRatio).toBe(3)
  expect(scoreScaleMetrics.trophyRatio).toBe(1.5) // medals and the trophy hold 2x detail
  expect(scoreScaleMetrics.medalRatio).toBe(1.5)
  expect(scoreScaleMetrics.haikuRatio).toBe(1.5) // Haiku holds 2x detail too: 3px per scene unit is 1.5px per canvas pixel
  expect(scoreScaleMetrics.rowLinkHeight).toBeGreaterThanOrEqual(44)
  await expect(page.getByTestId('haiku-bubble')).toContainText("Haiku's favourite today:")
  await expect(page.getByTestId('haiku-bubble')).toContainText('lighthouse')

  // Chalkboard remains still (no bob animation)
  await expect(board).toHaveCSS('animation-name', 'none')

  // Mobile 375x812: chalkboard fills width cleanly without horizontal overflow in <main> or document
  await page.setViewportSize({ width: 375, height: 812 })
  const mobileMetrics = await page.evaluate(() => {
    const main = document.querySelector('main')!
    const thumb = document.querySelector('.scores-thumb') as HTMLCanvasElement
    const px = parseFloat(getComputedStyle(thumb).getPropertyValue('--px')) || 2
    return {
      docScrollW: document.documentElement.scrollWidth,
      mainScrollW: main.scrollWidth,
      mainClientW: main.clientWidth,
      px,
      thumbRatio: thumb.clientWidth / thumb.width,
    }
  })
  expect(mobileMetrics.docScrollW).toBeLessThanOrEqual(375)
  expect(mobileMetrics.mainScrollW).toBeLessThanOrEqual(mobileMetrics.mainClientW)
  expect(mobileMetrics.px).toBe(2)
  expect(mobileMetrics.thumbRatio).toBe(2)
  // The board re-frames on the resize (its scene and camera each measure the window), so it lands inside the phone's width.
  await expect.poll(async () => { const bounds = (await board.boundingBox())!; return bounds.x >= 0 && bounds.x + bounds.width <= 375 }).toBe(true)

  // Clicking anywhere on a row (even on the rank badge) navigates via stretched row link
  await board.locator('ol > li').first().locator('.scores-rank').click()
  await expect(page).toHaveURL(`${origin}/u/u1`)
})

test('day paging works on scores chalkboard', async ({ page }) => {
  const cells = samplePaintingBase64()
  await setup(page, false, (query) => {
    if (query.collection === 'dailyScores' && query.where?.day === '2026-11-17') {
      return [{ recordId: 't1', data: { day: '2026-11-17', userId: 'u-today', displayName: 'Alice', avatarUrl: '', score: 888, bestElapsedMs: 25000, medal: 1 } }]
    }
    if (query.collection === 'dailyScores' && query.where?.day === '2026-11-16') {
      return [{ recordId: 'y1', data: { day: '2026-11-16', userId: 'u-prev', displayName: 'Bob', avatarUrl: '', score: 950, bestElapsedMs: 20000, medal: 1 } }]
    }
    if (query.collection === 'dailyDrawings' && query.where?.day === '2026-11-16') {
      return [{ recordId: 'd1', data: { day: '2026-11-16', userId: 'u-prev', cells, guess: 'windmill', score: 950 } }]
    }
    return []
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${origin}/scores`)
  const board = page.getByTestId('scores-chalkboard')
  await expect(board).toContainText('Today')
  await expect(board).toContainText('Alice')
  await expect(board).toContainText('888')
  await expect(board.getByRole('button', { name: 'Next day' })).toBeDisabled()

  await board.getByRole('button', { name: 'Previous day' }).click()
  await expect(board).toContainText('2026-11-16')
  await expect(board).toContainText('Bob')
  await expect(board).toContainText('950')
  await expect(board.getByLabel('Gold medal')).toBeVisible()
  await expect(board.getByRole('img', { name: 'Pixel drawing' })).toHaveCount(1)

  await board.getByRole('button', { name: 'Next day' }).click()
  await expect(board).toContainText('Today')
  await expect(board).toContainText('Alice')
})

test('never-graded attempts are hidden on scores chalkboard', async ({ page }) => {
  const cells = samplePaintingBase64()
  await setup(page, false, (query) => {
    if (query.collection === 'dailyScores') {
      return [
        { recordId: 's0', data: { day: '2026-11-17', userId: 'u-empty', displayName: 'Unpainted', avatarUrl: '', score: 0, bestElapsedMs: null, medal: 0 } },
        { recordId: 's1', data: { day: '2026-11-17', userId: 'u-zero-guess', displayName: 'GuessedZero', avatarUrl: '', score: 0, bestElapsedMs: 12000, medal: 0 } },
        { recordId: 's2', data: { day: '2026-11-17', userId: 'u-top', displayName: 'TopPainter', avatarUrl: '', score: 850, bestElapsedMs: 30000, medal: 1 } },
      ]
    }
    if (query.collection === 'dailyDrawings') {
      return [
        { recordId: 'd0', data: { day: '2026-11-17', userId: 'u-empty', cells, guess: '' } },
        { recordId: 'd1', data: { day: '2026-11-17', userId: 'u-zero-guess', cells, guess: 'apple', score: 0 } },
        { recordId: 'd2', data: { day: '2026-11-17', userId: 'u-top', cells, guess: 'lighthouse', score: 850 } },
      ]
    }
    return []
  })
  await page.route('**/api/daily/me', route => route.fulfill({
    json: { day: '2026-11-17', status: 'ended', autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: true, best: 850, windows: [], nextAutoAt: null, serverNow: Date.now(), lastCells: cells },
  }))
  await page.route('**/api/daily/today/drawings', route => route.fulfill({
    json: {
      drawings: [
        { data: { userId: 'u-empty', cells, guess: '' } },
        { data: { userId: 'u-zero-guess', cells, guess: 'apple' } },
        { data: { userId: 'u-top', cells, guess: 'lighthouse' } },
      ],
    },
  }))

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`${origin}/scores`)
  const board = page.getByTestId('scores-chalkboard')
  await expect(board.getByRole('link', { name: 'TopPainter' })).toBeVisible()
  await expect(board.getByRole('link', { name: 'GuessedZero' })).toBeVisible()
  await expect(board.getByText('Unpainted')).toHaveCount(0)
  await expect(board.locator('ol > li')).toHaveCount(2)
})

test('scores handles long unbreakable names, HTML names, ties, and corrupt cells on mobile without overflow', async ({ page }) => {
  const longName = 'SupercalifragilisticexpialidociousUnbreakableNameSixtyChars1234'
  const cells = samplePaintingBase64()
  await setup(page, false, (query) => {
    if (query.collection === 'dailyScores') {
      return [
        { recordId: 's1', data: { day: '2026-11-17', userId: 'u-long', displayName: longName, avatarUrl: '', score: 900, bestElapsedMs: 22000, medal: 1 } },
        { recordId: 's2', data: { day: '2026-11-17', userId: 'u-tie', displayName: '<img src=x onerror=alert(1)>', avatarUrl: '', score: 900, bestElapsedMs: 22000, medal: 2 } },
      ]
    }
    return []
  })
  await page.route('**/api/daily/me', route => route.fulfill({
    json: { day: '2026-11-17', status: 'ended', autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: true, best: 900, windows: [], nextAutoAt: null, serverNow: Date.now(), lastCells: cells },
  }))
  await page.route('**/api/daily/today/drawings', route => route.fulfill({
    json: {
      drawings: [
        { data: { userId: 'u-long', cells: 'not-valid-base64!!!', guess: 'lighthouse' } },
        { data: { userId: 'u-tie', cells, guess: 'sailboat' } },
      ],
    },
  }))

  for (const vp of [{ width: 375, height: 812 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(vp)
    await page.goto(`${origin}/scores`)
    await expect(page.getByRole('img', { name: 'Drawing unavailable' })).toBeVisible()
    await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main')!
      return {
        docScrollW: document.documentElement.scrollWidth,
        mainScrollW: main.scrollWidth,
        mainClientW: main.clientWidth,
      }
    })
    expect(overflow.docScrollW).toBeLessThanOrEqual(375)
    expect(overflow.mainScrollW).toBeLessThanOrEqual(overflow.mainClientW)
  }
})

test('capture Task 7 scores chalkboard across viewports', async ({ page }) => {
  test.skip(process.env.SCREENSHOTS !== '1')
  const cells = samplePaintingBase64()
  const todayScores = [
    { recordId: 's1', data: { day: '2026-11-17', userId: 'u1', displayName: 'Alice', avatarUrl: '', score: 912, bestElapsedMs: 28000, medal: 1 } },
    { recordId: 's2', data: { day: '2026-11-17', userId: 'u2', displayName: 'Will', avatarUrl: '', score: 840, bestElapsedMs: 36000, medal: 2 } },
    { recordId: 's3', data: { day: '2026-11-17', userId: 'u3', displayName: 'Sam', avatarUrl: '', score: 695, bestElapsedMs: 52000, medal: 3 } },
    { recordId: 's4', data: { day: '2026-11-17', userId: 'u4', displayName: 'Alex', avatarUrl: '', score: 510, bestElapsedMs: 65000, medal: 0 } },
  ]
  await setup(page, false, (query) => (query.collection === 'dailyScores' ? todayScores : []))
  await page.route('**/api/daily/me', route => route.fulfill({
    json: { day: '2026-11-17', status: 'ended', autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: true, best: 840, windows: [], nextAutoAt: null, serverNow: Date.now(), lastCells: cells },
  }))
  await page.route('**/api/daily/today/drawings', route => route.fulfill({
    json: {
      drawings: [
        { data: { userId: 'u1', cells, guess: 'lighthouse' } },
        { data: { userId: 'u2', cells, guess: 'sailboat' } },
        { data: { userId: 'u3', cells, guess: 'sunset cove' } },
        { data: { userId: 'u4', cells, guess: 'campfire' } },
      ],
    },
  }))

  const dir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-18-porch')
  await mkdir(dir, { recursive: true })
  for (const vp of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(vp)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${origin}/scores`)
    await expect(page.getByTestId('scores-chalkboard')).toBeVisible()
    await expect(page.getByTestId('haiku-bubble')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(120)
    await page.screenshot({ path: resolve(dir, `scores-${vp.width}x${vp.height}.png`), fullPage: true })
  }
})

test('gallery shows framed dailies newest first with scene-scaled art and multi-viewport clearance', async ({ page }) => {
  const cells = samplePaintingBase64()
  await setup(page, false, (query) => {
    if (query.collection === 'dailyDrawings' && query.where?.userId === 'alice') {
      return [
        { recordId: 'd1', data: { day: '2026-11-15', userId: 'alice', displayName: 'Alice', prompt: 'An anchor', cells, score: 610, guess: 'anchor' } },
        { recordId: 'd2', data: { day: '2026-11-17', userId: 'alice', displayName: 'Alice', prompt: 'A lighthouse', cells, score: 912, guess: 'lighthouse' } },
        { recordId: 'd3', data: { day: '2026-11-16', userId: 'alice', displayName: 'Alice', prompt: 'A windmill', cells, score: 0, guess: '' } },
        { recordId: 'd4', data: { day: '2026-11-14', userId: 'alice', displayName: 'Alice', prompt: 'A harbor', cells, score: 750, guess: 'harbor' } },
        { recordId: 'd5', data: { day: '2026-11-13', userId: 'alice', displayName: 'Alice', prompt: 'A lantern', cells, score: 640, guess: 'lantern' } },
      ]
    }
    if (query.collection === 'dailyScores' && query.where?.userId === 'alice') {
      return [
        { recordId: 's1', data: { day: '2026-11-15', userId: 'alice', displayName: 'Alice', medal: 0 } },
        { recordId: 's2a', data: { day: '2026-11-17', userId: 'alice', displayName: 'Alice', medal: 3 } },
        { recordId: 's2b', data: { day: '2026-11-17', userId: 'alice', displayName: 'Alice', medal: 1 } },
      ]
    }
    return []
  })

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`${origin}/u/alice`)
  await expect(page.getByTestId('gallery-page')).toBeVisible()
  await expect(page.getByTestId('gallery-wall')).toBeAttached()
  await expect(page.getByRole('heading', { name: "Alice's gallery" })).toBeVisible()

  const frames = page.locator('[data-testid^="gallery-frame-"]')
  await expect(frames).toHaveCount(4)
  await expect(frames.nth(0)).toHaveAttribute('data-testid', 'gallery-frame-2026-11-17')
  await expect(frames.nth(0)).toHaveAttribute('data-frame-kind', 'gilt')
  await expect(frames.nth(0)).toContainText('A lighthouse')
  await expect(frames.nth(0)).toContainText('Nov 17, 2026')
  await expect(frames.nth(0)).toContainText('912 / 1000')
  await expect(frames.nth(0).getByLabel('Gold medal')).toBeVisible()
  const galleryMetrics = await frames.nth(0).evaluate((el) => {
    const thumb = el.querySelector('.wall-frame__thumb') as HTMLCanvasElement
    const medal = el.querySelector('.wall-card__medal') as HTMLCanvasElement
    const px = parseFloat(getComputedStyle(thumb).getPropertyValue('--px'))
    return { px, thumbRatio: thumb.clientWidth / thumb.width, medalRatio: medal.clientWidth / medal.width }
  })
  expect(Number.isInteger(galleryMetrics.thumbRatio)).toBe(true) // every painting cell is a whole number of pixels
  expect(galleryMetrics.thumbRatio).toBeGreaterThanOrEqual(2)
  expect(galleryMetrics.medalRatio).toBe(galleryMetrics.px / 2) // medals hold 2x detail

  await expect(frames.nth(1)).toHaveAttribute('data-testid', 'gallery-frame-2026-11-15')
  await expect(frames.nth(1)).toHaveAttribute('data-frame-kind', 'wood')
  await expect(frames.nth(1)).toContainText('An anchor')
  await expect(page.getByText('A windmill')).toHaveCount(0) // an ungraded, unguessed day never hangs

  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(vp)
    // The newest painting is wholly in view below the nav, and the page itself never scrolls sideways.
    await expect.poll(async () => page.evaluate(() => {
      const frame = document.querySelector('[data-testid="gallery-frame-2026-11-17"] .wall-frame')!.getBoundingClientRect()
      const nav = document.querySelector('[data-testid="app-navigation"]')?.getBoundingClientRect().bottom ?? 0
      return document.documentElement.scrollWidth <= window.innerWidth && frame.left >= 0 && frame.right <= window.innerWidth && frame.top >= nav - 1 && frame.bottom <= window.innerHeight && frame.width > 60
    })).toBe(true)
  }

  // Phone: two columns, so the next painting hangs beside the first and the third under it.
  await page.setViewportSize({ width: 375, height: 812 })
  const box = async (index: number) => (await frames.nth(index).locator('.wall-frame').boundingBox())!
  const [first, second, third] = [await box(0), await box(1), await box(2)]
  expect(second.x).toBeGreaterThanOrEqual(first.x + first.width)
  expect(second.y).toBe(first.y)
  expect(third.y).toBeGreaterThanOrEqual(first.y + first.height)
})

const framesOn = (page: Page) => page.locator('[data-testid^="gallery-frame-"]')
const wallOf = (page: Page) => page.getByTestId('gallery-wall')
const settled = (page: Page) => expect(wallOf(page)).not.toHaveAttribute('data-turning', 'true')
const dayOf = (index: number) => new Date(Date.UTC(2026, 10, 17 - index)).toISOString().slice(0, 10)
async function setupWall(page: Page, count: number, viewport = { width: 1440, height: 900 }) {
  const cells = samplePaintingBase64()
  await setup(page, false, (query) => query.collection === 'dailyDrawings' && query.where?.userId === 'host'
    ? Array.from({ length: count }, (_, index) => ({ recordId: `d${index}`, data: { day: dayOf(index), userId: 'host', displayName: 'Offline host', prompt: `Painting ${index}`, cells, score: 300 + index, guess: 'thing' } }))
    : [])
  await page.setViewportSize(viewport)
  await page.goto(`${origin}/u/host`)
  await expect(framesOn(page).first()).toBeVisible()
}

test('the wall is a wheel of pages: arrows, keys, swipe and one wheel gesture each turn one page, round and round', async ({ page }) => {
  test.setTimeout(60_000)
  await setupWall(page, 47)
  const wall = wallOf(page)
  const plank = page.getByTestId('gallery-plank')
  const perPage = Number(await wall.getAttribute('data-per-page'))
  const pages = Math.ceil(47 / perPage)
  expect(perPage).toBeGreaterThanOrEqual(8)
  await expect(wall).toHaveAttribute('data-pages', String(pages))
  await expect(plank).toHaveText(`1 / ${pages}`)
  // Page 1 holds the newest paintings, newest first, and only that page is in the DOM.
  await expect(framesOn(page)).toHaveCount(perPage)
  await expect(framesOn(page).first()).toHaveAttribute('data-testid', `gallery-frame-${dayOf(0)}`)
  // Right goes older, page by page, to the last (a short page), then wraps to page 1.
  for (let next = 2; next <= pages; next++) {
    await page.getByTestId('gallery-next').click()
    await settled(page)
    await expect(plank).toHaveText(`${next} / ${pages}`)
    await expect(framesOn(page).first()).toHaveAttribute('data-testid', `gallery-frame-${dayOf((next - 1) * perPage)}`)
  }
  await expect(framesOn(page)).toHaveCount(47 - (pages - 1) * perPage)
  await page.getByTestId('gallery-next').click()
  await settled(page)
  await expect(plank).toHaveText(`1 / ${pages}`)
  // Left from page 1 wraps to the last page.
  await page.getByTestId('gallery-prev').click()
  await settled(page)
  await expect(plank).toHaveText(`${pages} / ${pages}`)
  // The keys.
  await page.keyboard.press('ArrowRight')
  await settled(page)
  await expect(plank).toHaveText(`1 / ${pages}`)
  await page.keyboard.press('ArrowLeft')
  await settled(page)
  await expect(plank).toHaveText(`${pages} / ${pages}`)
  await page.keyboard.press('ArrowRight')
  await settled(page)
  // One wheel gesture made of many small deltas (an inertial flick) turns exactly one page.
  await page.mouse.move(700, 450)
  for (let step = 0; step < 40; step++) await page.mouse.wheel(step % 2 ? 3 : 0, step % 2 ? 0 : 4)
  await page.waitForTimeout(900)
  await settled(page)
  await expect(plank).toHaveText(`2 / ${pages}`)
  // The next gesture, after it ended, turns one more (a horizontal one the other way).
  for (let step = 0; step < 30; step++) await page.mouse.wheel(-5, 0)
  await page.waitForTimeout(900)
  await settled(page)
  await expect(plank).toHaveText(`1 / ${pages}`)
  // A touch swipe: left turns to the next page, right to the previous.
  const swipe = (dx: number) => page.getByTestId('scene-dismiss').evaluate((el, delta) => {
    const fire = (type: string, x: number) => el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', clientX: x, clientY: 400, bubbles: true }))
    fire('pointerdown', 700); fire('pointermove', 700 + delta / 2); fire('pointerup', 700 + delta)
  }, dx)
  await swipe(-150)
  await settled(page)
  await expect(plank).toHaveText(`2 / ${pages}`)
  await swipe(150)
  await settled(page)
  await expect(plank).toHaveText(`1 / ${pages}`)
  await expect(page).toHaveURL(`${origin}/u/host`) // a swipe is never a click on the wall
  // Input during a turn queues at most one further turn: three quick presses are two pages.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(1500)
  await settled(page)
  await expect(plank).toHaveText(`3 / ${pages}`)
  // Mid-turn the incoming page is in the DOM beside the outgoing one, and nothing else.
  await page.keyboard.press('ArrowRight')
  await expect(wall).toHaveAttribute('data-turning', 'true')
  expect(await framesOn(page).count()).toBeLessThanOrEqual(2 * perPage)
  await settled(page)
  await expect(framesOn(page)).toHaveCount(47 - (pages - 1) * perPage)
  // Escape is still the way back.
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(`${origin}/home`)
})

test('reduced motion swaps pages at once; a wall of one page has no arrows and no plank', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setupWall(page, 30)
  const wall = wallOf(page)
  await page.keyboard.press('ArrowRight')
  await expect(wall).toHaveAttribute('data-page', '2')
  await expect(wall).not.toHaveAttribute('data-turning', 'true')
  const second = await framesOn(page).first().getAttribute('data-testid')
  expect(second).toBe(`gallery-frame-${dayOf(Number(await wall.getAttribute('data-per-page')))}`)
  await setupWall(page, 3)
  await expect(framesOn(page)).toHaveCount(3)
  await expect(page.getByTestId('gallery-plank')).toHaveCount(0)
  await expect(page.getByTestId('gallery-next')).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await expect(wall).toHaveAttribute('data-page', '1')
})

test.describe('captions never clip', () => {
  const viewports = [{ width: 1980, height: 1240 }, { width: 1440, height: 900 }, { width: 375, height: 812 }]
  for (const viewport of viewports) {
    test(`every caption holds its longest prompt, date and grade at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      test.setTimeout(60_000)
      const cells = samplePaintingBase64()
      // Every real prompt, longest first, each on the widest dates and a four-digit grade; one gold medal.
      const { DAILY_PROMPTS } = await import('../../src/game/daily/prompts')
      const prompts = [...DAILY_PROMPTS].map((entry) => entry.prompt).sort((a, b) => b.length - a.length)
      const days = ['2026-09-28', '2026-05-30', '2026-11-30', '2026-08-29']
      const day = (index: number) => { const base = new Date(`${days[index % days.length]}T00:00:00Z`); base.setUTCFullYear(2026 - Math.floor(index / days.length)); return base.toISOString().slice(0, 10) }
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await setup(page, false, (query) => query.collection === 'dailyDrawings' && query.where?.userId === 'host'
        ? prompts.map((prompt, index) => ({ recordId: `d${index}`, data: { day: day(index), userId: 'host', displayName: 'Offline host', prompt, cells, score: 1000, guess: 'thing' } }))
        : query.collection === 'dailyScores' && query.where?.userId === 'host' ? [{ recordId: 's0', data: { day: day(0), userId: 'host', medal: 1 } }] : [])
      await page.setViewportSize(viewport)
      await page.goto(`${origin}/u/host`)
      await expect(framesOn(page).first()).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const wall = wallOf(page)
      const pages = Number(await wall.getAttribute('data-pages'))
      for (let current = 1; current <= pages; current++) {
        await expect(wall).toHaveAttribute('data-page', String(current))
        const bad = await page.evaluate(() => {
          const problems: string[] = []
          const captions = document.querySelectorAll('[data-testid="gallery-caption"]')
          for (const card of captions) {
            const box = card.getBoundingClientRect()
            for (const el of [card, ...card.querySelectorAll('*')]) {
              if (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) problems.push(`${el.className} scroll ${el.scrollWidth}x${el.scrollHeight} > client ${el.clientWidth}x${el.clientHeight}: ${card.textContent}`)
              const inner = el.getBoundingClientRect()
              if (inner.right > box.right + 0.5 || inner.bottom > box.bottom + 0.5 || inner.left < box.left - 0.5 || inner.top < box.top - 0.5) problems.push(`${el.className} outside its card: ${card.textContent}`)
            }
          }
          return { count: captions.length, problems }
        })
        expect(bad.count).toBeGreaterThan(0)
        expect(bad.problems).toEqual([])
        await page.keyboard.press('ArrowRight')
      }
    })
  }
})

test('empty gallery shows the empty rack with its first-painting card and a Paint today prompt link to /home', async ({ page }) => {
  const cells = samplePaintingBase64()
  await setup(page, false, (query) => {
    if (query.collection === 'dailyDrawings' && query.where?.userId === 'host') {
      return [{ recordId: 'd0', data: { day: '2026-11-17', userId: 'host', displayName: 'Offline host', prompt: 'Skipped', cells, score: 0, guess: '' } }]
    }
    return []
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`${origin}/u/host`)
  await expect(page.getByRole('heading', { name: 'Your gallery' })).toBeVisible()
  const empty = page.getByTestId('gallery-empty')
  await expect(empty).toBeVisible()
  await expect(empty).toContainText('Your first painting hangs here')
  const cta = empty.getByRole('link', { name: "Paint today's prompt" })
  await expect(cta).toHaveAttribute('href', '/home')
  await cta.click()
  await expect(page).toHaveURL(`${origin}/home`)
})

test('door opens own gallery from porch canvases and mailbox menu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/home`)
  const header = page.getByTestId('app-navigation')
  await header.getByRole('button', { name: /Account menu:/ }).click()
  await expect(page.getByRole('menuitem', { name: 'My gallery' })).toBeVisible()
  await page.keyboard.press('Escape')
  await header.getByRole('link', { name: 'Scores', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/scores`)

  await page.goto(`${origin}/home`)
  await page.locator('.porch-world').getByRole('link', { name: 'Your gallery' }).click()
  await expect(page).toHaveURL(`${origin}/u/host`)
  await expect(page.getByRole('heading', { name: 'Your gallery' })).toBeVisible()

  await page.goto(`${origin}/party`)
  await page.getByRole('button', { name: /Account menu/ }).click()
  await page.getByRole('menuitem', { name: 'My gallery' }).click()
  await expect(page).toHaveURL(`${origin}/u/host`)
  await expect(page.getByRole('heading', { name: 'Your gallery' })).toBeVisible()
})

test('capture Task 8 gallery wall across viewports', async ({ page }) => {
  test.skip(process.env.SCREENSHOTS !== '1')
  const cells = samplePaintingBase64()
  const dir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-18-porch')
  await mkdir(dir, { recursive: true })

  // Owner gallery with 3 paintings (Gold, Silver, and plain wood frame)
  await setup(page, false, (query) => {
    if (query.collection === 'dailyDrawings' && query.where?.userId === 'host') {
      return [
        { recordId: 'd1', data: { day: '2026-11-17', userId: 'host', displayName: 'Offline host', prompt: 'A lighthouse', cells, score: 912, guess: 'lighthouse' } },
        { recordId: 'd2', data: { day: '2026-11-16', userId: 'host', displayName: 'Offline host', prompt: 'Sunset sailboat', cells, score: 825, guess: 'sailboat' } },
        { recordId: 'd3', data: { day: '2026-11-15', userId: 'host', displayName: 'Offline host', prompt: 'Harbor lantern', cells, score: 610, guess: 'lantern' } },
      ]
    }
    if (query.collection === 'dailyScores' && query.where?.userId === 'host') {
      return [
        { recordId: 's1', data: { day: '2026-11-17', userId: 'host', displayName: 'Offline host', medal: 1 } },
        { recordId: 's2', data: { day: '2026-11-16', userId: 'host', displayName: 'Offline host', medal: 2 } },
        { recordId: 's3', data: { day: '2026-11-15', userId: 'host', displayName: 'Offline host', medal: 0 } },
      ]
    }
    return []
  })
  for (const vp of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(vp)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${origin}/u/host`)
    await expect(page.getByTestId('gallery-frame-2026-11-17')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(120)
    await page.screenshot({ path: resolve(dir, `gallery-owner-${vp.width}x${vp.height}.png`), fullPage: true })
  }

  // Empty gallery state
  await setup(page)
  for (const vp of [{ width: 1280, height: 720 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(vp)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${origin}/u/host`)
    await expect(page.getByTestId('gallery-empty')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(120)
    await page.screenshot({ path: resolve(dir, `gallery-empty-${vp.width}x${vp.height}.png`), fullPage: true })
  }
})

test('porch zooms and pans smoothly when navigating to scores and gallery', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/home`)

  const camera = page.locator('.porch-world .pixel-scene__camera')
  await expect(camera).toBeVisible()
  const initialTransform = await camera.evaluate(el => getComputedStyle(el).transform)

  await page.getByTestId('app-navigation').getByRole('link', { name: 'Scores', exact: true }).click()
  await expect(page.locator('.porch-world')).toHaveClass(/porch-world--transitioning/)
  await expect.poll(() => camera.evaluate(el => getComputedStyle(el).transform)).not.toBe(initialTransform)
  await expect(page).toHaveURL(`${origin}/scores`)
  await expect(page.getByTestId('scores-page')).toBeVisible()

  await page.goto(`${origin}/home`)
  await page.locator('.porch-world').getByRole('link', { name: 'Your gallery' }).click()
  await expect(page.locator('.porch-world')).toHaveClass(/porch-world--transitioning/)
  await expect(page).toHaveURL(`${origin}/u/host`)
  await expect(page.getByTestId('gallery-page')).toBeVisible()
})

test('porch to scores maps chalkboard frame 1:1 without size jump and returns smoothly', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/home`)

  const homeNavBox = await page.getByTestId('app-navigation').boundingBox()
  expect(homeNavBox).not.toBeNull()

  await page.getByTestId('app-navigation').getByRole('link', { name: 'Scores', exact: true }).click()
  await expect(page.locator('.porch-world')).toHaveClass(/porch-world--to-scores/)
  // Nothing covers the Porch sunset/sea during the direct chalkboard zoom: no veil, no dissolve.
  const veil = await page.locator('.porch-world').evaluate(el => getComputedStyle(el, '::after').content)
  expect(['none', 'normal']).toContain(veil)

  await expect(page).toHaveURL(`${origin}/scores`)
  const scoresNavBox = await page.getByTestId('app-navigation').boundingBox()
  expect(scoresNavBox!.height).toBe(homeNavBox!.height)

  const board = page.getByTestId('scores-chalkboard')
  await expect(board).toBeVisible()
  const boardBox = await board.boundingBox()
  expect(boardBox).not.toBeNull()
  // Porch chalkboard slate proportion is 50:35 (~1.428)
  const ratio = boardBox!.width / boardBox!.height
  expect(ratio).toBeGreaterThan(1.38)
  expect(ratio).toBeLessThan(1.48)

  // Backdrop camera on /scores matches the zoomed Porch chalkboard 1:1
  const backdropScale = await page.locator('.scores-backdrop .pixel-scene__camera').evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform)
    return m.a
  })
  expect(backdropScale).toBeGreaterThan(2)
  // 50 scene px * scale 4 * backdropScale === boardBox.width
  expect(Math.abs(50 * 4 * backdropScale - boardBox!.width)).toBeLessThanOrEqual(4)

  // Returning via ← Porch zooms back out to /home cleanly
  await page.getByTestId('scores-porch-button').click()
  await expect(page.getByTestId('scores-page')).toHaveClass(/scores-page--leaving/)
  await expect(page).toHaveURL(`${origin}/home`)
  await expect(page.locator('.porch-world')).toBeVisible()
})

test('switching to scores from basement (/party) pans up through the floor before zooming into the board', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.addInitScript(() => {
    const win = window as unknown as { __spaRoutes?: string[] }
    win.__spaRoutes = []
    const orig = history.pushState.bind(history)
    history.pushState = (...args) => {
      orig(...args)
      win.__spaRoutes!.push(location.pathname)
    }
  })
  await setup(page)
  await page.goto(`${origin}/party`)
  await expect(page.getByTestId('lobby-page')).toBeVisible()

  await page.getByTestId('app-navigation').getByRole('link', { name: 'Scores', exact: true }).click()
  await expect(page.getByTestId('vertical-scene-transition')).toBeVisible()
  // First pans up to /home, then uses the porch's existing chalkboard zoom into /scores.
  await expect(page).toHaveURL(`${origin}/scores`, { timeout: 6000 })
  await expect(page.getByTestId('scores-chalkboard')).toBeVisible()
  const routes = await page.evaluate(() => (window as unknown as { __spaRoutes: string[] }).__spaRoutes)
  expect(routes).toEqual(['/home', '/scores'])
})

test('switching from a graded result zooms back out to the porch first before entering party', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.route('**/api/daily/me', (route) => route.fulfill({
    json: {
      day: '2026-11-17',
      status: 'ended',
      prompt: 'rocket',
      startedAt: Date.now() - 300_000,
      endsAt: Date.now() - 5_000,
      autoUsed: 0,
      asksUsed: 1,
      asksLeft: 2,
      finalUsed: true,
      best: 640,
      windows: [],
      nextAutoAt: null,
      serverNow: Date.now(),
    },
  }))
  await page.goto(`${origin}/home`)
  await page.getByRole('button', { name: 'View result' }).click()
  await expect(page.getByTestId('daily-ended')).toBeVisible()

  await page.getByRole('button', { name: /Account menu:/ }).click()
  await page.getByRole('menuitem', { name: 'Party' }).click()
  await expect(page.locator('[data-camera="easel"]')).toHaveAttribute('data-phase', 'leaving')
  await expect(page).toHaveURL(`${origin}/party`, { timeout: 8000 })
  await expect(page.locator('main').getByTestId('lobby-page')).toBeVisible()
})

test('party room exits upstairs through stairwell to porch and scores', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.addInitScript(() => {
    const win = window as unknown as { __spaRoutes?: string[] }
    win.__spaRoutes = []
    const orig = history.pushState.bind(history)
    history.pushState = (...args) => {
      orig(...args)
      win.__spaRoutes!.push(location.pathname)
    }
  })
  await setup(page)
  await page.route('**/api/pixel/AB2Z', (route) => route.fulfill({ json: { ok: true, joinCode: 'AB2Z', name: 'Offline party' } }))
  await page.routeWebSocket('**/api/pixel/**', (socket) => {
    socket.send(JSON.stringify({
      t: 'snapshot',
      mode: 'coop',
      width: 32,
      height: 32,
      cells: Buffer.alloc(1024).toString('base64'),
      players: 1,
      watching: 0,
      roster: [{ userId: 'host', name: 'Offline host' }],
      you: { userId: 'host', cooldownUntil: 0 },
      round: { id: 'playing', state: 'playing', word: 'cat', startedAt: Date.now() - 1000, endsAt: Date.now() + 60_000, askAvailableAt: 0 },
      aiResting: false,
    }))
  })
  await page.goto(`${origin}/r/AB2Z`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()

  await page.getByRole('button', { name: /Account menu:/ }).click()
  await page.getByRole('menuitem', { name: 'Scores' }).click()
  await expect(page).toHaveURL(`${origin}/scores`, { timeout: 6000 })
  const routes = await page.evaluate(() => (window as unknown as { __spaRoutes: string[] }).__spaRoutes)
  expect(routes).toEqual(['/home', '/scores'])
})

test('the scene around a close-up is the way back out: scores, gallery, settings, rules and the mailbox', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  // Scores: a click on the board is not a background click; a click on the porch around it zooms out.
  await page.goto(`${origin}/scores`)
  await expect(page.getByTestId('scores-chalkboard')).toBeVisible()
  await page.getByTestId('scores-chalkboard').click({ position: { x: 20, y: 20 } })
  await expect(page).toHaveURL(`${origin}/scores`)
  await page.getByTestId('scene-dismiss').click({ position: { x: 40, y: 500 } })
  await expect(page).toHaveURL(`${origin}/home`)
  // Gallery: the wall of the house, not a room of its own; the wall around the paintings pans back.
  await page.goto(`${origin}/u/host`)
  await expect(page.getByTestId('gallery-empty')).toBeVisible()
  await expect(page.locator('.gallery-backdrop .pixel-scene__canvas')).toHaveCount(1)
  await page.getByTestId('gallery-empty').click({ position: { x: 20, y: 20 } })
  await expect(page).toHaveURL(`${origin}/u/host`)
  await page.getByTestId('scene-dismiss').click({ position: { x: 600, y: 700 } })
  await expect(page).toHaveURL(`${origin}/home`)
  // Settings: the porch around the mailbox.
  await page.goto(`${origin}/settings`)
  await expect(page.getByTestId('settings-letter')).toBeVisible()
  await page.getByTestId('scene-dismiss').click({ position: { x: 700, y: 820 } })
  await expect(page).toHaveURL(`${origin}/home`)
  // Rules: the camera goes onto the note itself (no modal), and the scene around it puts it away.
  await page.getByRole('button', { name: 'Scoring rules' }).click()
  const paper = page.getByRole('dialog', { name: 'Daily scoring rules' })
  await expect(paper).toBeVisible()
  await expect(paper).not.toHaveAttribute('aria-modal', 'true')
  await expect.poll(() => page.locator('.porch-world .pixel-scene__camera').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBeGreaterThan(3)
  await page.getByTestId('scene-dismiss').click({ position: { x: 700, y: 840 } })
  await expect(paper).toHaveCount(0)
  // Mailbox: the account menu is a card that comes out of the mailbox; Settings flies on to the mailbox close-up.
  await page.locator('.porch-world').getByRole('button', { name: 'Account menu', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Account menu' })
  for (const name of ['My gallery', 'Settings']) await expect(menu.getByRole('link', { name })).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await menu.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(`${origin}/settings`)
  await expect(page.getByTestId('settings-letter')).toBeVisible()
})

test('the gallery is a pan along the porch onto the house wall: wall sign, one scene, paintings hung on the siding', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const cells = samplePaintingBase64()
  await setup(page, false, (query) => {
    if (query.collection === 'dailyDrawings' && query.where?.userId === 'host') {
      return [{ recordId: 'd1', data: { day: '2026-11-17', userId: 'host', displayName: 'Offline host', prompt: 'A lighthouse', cells, score: 912, guess: 'lighthouse' } }]
    }
    return []
  })
  await page.goto(`${origin}/home`)
  // At rest the wall (and the painting already hung on it) is off-screen, left of the porch.
  await expect(page.getByTestId('gallery-frame-2026-11-17')).toBeAttached()
  const offscreen = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="gallery-frame-2026-11-17"] .wall-frame')!.getBoundingClientRect()
    const wall = document.querySelector('[data-testid="porch-wall"]')!.getBoundingClientRect()
    return { frameRight: frame.right, wallRight: wall.right }
  })
  expect(offscreen.frameRight).toBeLessThanOrEqual(0)
  expect(offscreen.wallRight).toBeLessThanOrEqual(0.5)
  await page.locator('.porch-world').getByRole('link', { name: 'Your gallery' }).click()
  await expect(page).toHaveURL(`${origin}/u/host`)
  await expect(page.getByTestId('gallery-frame-2026-11-17')).toBeVisible()
  await expect(page.getByTestId('vertical-scene-transition')).toHaveCount(0)
  // Once landed it is a pure pan: the rest zoom, the camera moved sideways only, and the frame is exactly on its wall slot.
  await expect.poll(async () => page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('.gallery-backdrop .pixel-scene__camera')!).transform)
    return [m.a, m.d, m.f].join()
  })).toBe('1,1,0')
  const error = await page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('.gallery-backdrop .pixel-scene__camera')!).transform)
    const scale = Math.ceil(Math.max(innerWidth / 320, innerHeight / 180))
    const ox = (innerWidth - 320 * scale) / 2, oy = (innerHeight - 180 * scale) / 2
    // The one painting hangs on the scene's whole-unit grid, in a whole number of units, below the nav.
    const frame = document.querySelector('[data-testid="gallery-frame-2026-11-17"] .wall-frame')!.getBoundingClientRect()
    const nav = document.querySelector('[data-testid="app-navigation"]')!.getBoundingClientRect().bottom
    const frac = (value: number) => { const part = Math.abs(value) % 1; return Math.min(part, 1 - part) }
    return { x: frac((frame.x - ox - m.e) / scale), y: frac((frame.y - oy) / scale), below: frame.y >= nav, w: frac(frame.width / scale), inside: frame.left >= 0 && frame.right <= innerWidth, pan: m.e }
  })
  expect(error.x).toBeLessThan(0.02)
  expect(error.inside).toBe(true)
  expect(error.y).toBeLessThan(0.02)
  expect(error.below).toBe(true)
  expect(error.w).toBeLessThan(0.02)
  expect(error.pan).toBeGreaterThan(900)
})

const zoomOf = (page: Page, selector: string) => page.locator(`${selector} .pixel-scene__camera`).evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)

test('sign-in is the SDK form on the mailbox letter: no pop-up, Escape and the porch around it reverse the zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page, true)
  await page.goto(`${origin}/home`)
  await page.getByTestId('nav-sign-in-button').click()
  const letter = page.getByRole('dialog', { name: 'Account menu' })
  await expect(letter.getByTestId('sign-in-card')).toBeVisible()
  await expect(letter.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible()
  // The SDK wrapper is not a full-screen layer (no backdrop, no dim), and the camera is on the mailbox.
  expect(await letter.getByTestId('auth-overlay').evaluate(el => getComputedStyle(el).position)).not.toBe('fixed')
  await expect.poll(() => zoomOf(page, '.porch-world')).toBeGreaterThan(2)
  await page.keyboard.press('Escape')
  await expect(letter).toHaveCount(0)
  await expect.poll(() => zoomOf(page, '.porch-world')).toBeLessThan(1.05)
  // The scene around the letter puts it away too.
  await page.getByTestId('nav-sign-in-button').click()
  await expect(letter).toBeVisible()
  await page.getByTestId('scene-dismiss').click({ position: { x: 700, y: 840 } })
  await expect(letter).toHaveCount(0)
})

test('signing in from another porch scene flies to the mailbox letter', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page, true)
  await page.goto(`${origin}/scores`)
  await page.getByTestId('nav-sign-in-button').click()
  await expect(page).toHaveURL(`${origin}/settings`)
  await expect(page.getByTestId('settings-letter').getByTestId('sign-in-card')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(`${origin}/home`)
})

test('the 404 is the porch camera on Haiku, sad among his spilled paint: it flies there, and every way out flies back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-start-button')).toBeVisible()
  // An unknown path reached from inside the app: the camera moves, it does not cut.
  await page.evaluate(() => { history.pushState({ usr: null, key: 'in-app', idx: 1 }, '', '/no-such-place'); dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByTestId('not-found-bubble')).toContainText("Oops — this page doesn't exist.")
  const early = await zoomOf(page, '.lost-backdrop')
  expect(early).toBeLessThan(1.3)
  await expect.poll(() => zoomOf(page, '.lost-backdrop'), { timeout: 3000 }).toBeGreaterThan(1.5)
  // The button is the way back.
  await page.getByTestId('not-found-porch-sign').click()
  await expect(page).toHaveURL(`${origin}/home`)
  await expect(page.getByTestId('daily-start-button')).toBeVisible()
  // A cold load is simply there; the porch around Haiku (and Escape) zooms back out.
  await page.goto(`${origin}/no-such-place`)
  await expect(page.getByTestId('not-found-bubble')).toBeVisible()
  expect(await zoomOf(page, '.lost-backdrop')).toBeGreaterThan(1.5)
  await page.getByTestId('scene-dismiss').click({ position: { x: 700, y: 860 } })
  await expect(page).toHaveURL(`${origin}/home`)
  await page.goto(`${origin}/no-such-place`)
  await expect(page.getByTestId('not-found-bubble')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(`${origin}/home`)
  // The beach notice board is gone from the porch.
  await expect(page.getByTestId('not-found-board')).toHaveCount(0)
})
