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
  const scene = page.locator('.porch-world')
  for (const name of ['Start Daily Challenge', "Today's scores", 'Party studio', 'Public board', 'Account menu', 'Your gallery', 'Mute sounds', 'Scoring rules']) {
    await expect(scene.getByRole(name === "Today's scores" || name === 'Party studio' || name === 'Public board' || name === 'Your gallery' ? 'link' : 'button', { name, exact: true })).toBeVisible()
  }
  await expect(scene.getByText("Today's top five")).toBeVisible()
  await expect(scene.getByText('See all scores')).toBeVisible()
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
  await expect(cover).toContainText('10 minutes · your best grade counts')
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
  const names = ['Start Daily Challenge', "Today's scores", 'Party studio', 'Public board', 'Account menu', 'Your gallery', 'Mute sounds', 'Scoring rules']
  await scene.getByRole('button', { name: names[0] }).focus()
  for (const [index, name] of names.entries()) {
    const focused = scene.locator(':focus')
    await expect(focused).toHaveAttribute('aria-label', name)
    await expect(focused.locator('.pixel-hotspot__label')).toBeVisible()
    expect(await focused.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none')
    if (index < names.length - 1) await page.keyboard.press('Tab')
  }
  await scene.getByRole('link', { name: 'Party studio' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(`${origin}/party`)
})

test('signed-out porch offers sign-in on easel and mailbox', async ({ page }) => {
  await setup(page, true)
  await page.goto(`${origin}/home`)
  const scene = page.locator('.porch-world')
  await expect(scene.getByRole('button', { name: 'Sign in to paint' })).toBeVisible()
  await expect(scene.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})

test('party hatch pans down before navigating', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/home`)
  await page.getByRole('link', { name: 'Party studio' }).click()
  await expect(page.locator('.pixel-scene__camera')).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  await expect(page).toHaveURL(`${origin}/party`)
})

test('reduced motion enters party without waiting for the pan', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setup(page)
  await page.goto(`${origin}/home`)
  const start = Date.now()
  await page.getByRole('link', { name: 'Party studio' }).click()
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
  await expect(page.getByText("Today's top three")).toBeVisible()
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
  await page.locator('.porch-world').getByRole('link', { name: 'Party studio' }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--px'))).toBe('')
})

for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 812 }]) {
  test(`sign beam has four signs at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await setup(page)
    await page.goto(`${origin}/party`)
    if (viewport.width < 768) await page.getByRole('button', { name: 'Toggle menu' }).click()
    const nav = page.getByTestId('app-navigation')
    for (const label of ['Daily', 'Party', 'Scores', 'Gallery']) {
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
  const flag = page.getByTestId('nav-sign-in-button').locator('.porch-nav__flag')
  await expect(flag).toHaveAttribute('width', '5')
  await expect(flag).toHaveAttribute('height', '7')
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
  await page.route('**/api/daily/me', route => route.fulfill({ json: { day: '2026-11-17', status: 'ended', prompt: 'A lighthouse', startedAt: Date.now() - 600_000, endsAt: Date.now(), autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: true, best: 740, windows: [], nextAutoAt: null, serverNow: Date.now(), lastCells: cells } }))
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-ended')).toBeVisible()
  await expect(page.getByTestId('porch-easel-tag')).toHaveText("Today's painting · 740/1000")
  const centerPixel = await page.locator('.pixel-scene__canvas').evaluate((el) => {
    const ctx = (el as HTMLCanvasElement).getContext('2d')!
    // Easel at (138, 40), painting at (138 + 18, 40 + 25) = (156, 65), lighthouse tower at (15, 10) -> (171, 75)
    return Array.from(ctx.getImageData(138 + 18 + 15, 40 + 25 + 10, 1, 1).data)
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

test('remaining screens use porch-wood panels, letter settings, and empty beach 404', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/settings`)
  await expect(page.getByTestId('settings-letter')).toContainText('From the porch mailbox')
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  await page.goto(`${origin}/does-not-exist`)
  await expect(page.getByTestId('not-found-page')).toContainText('You wandered off the porch')
  await expect(page.getByTestId('not-found-home')).toHaveAttribute('href', '/home')
  await expect(page.locator('.pixel-scene__canvas')).toBeVisible()

  await setup(page, true)
  await page.goto(`${origin}/settings`)
  await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible()
  await expect(page.locator('.pp-wood-panel')).toBeVisible()
})

test('non-scene pages render porch roof overhang immediately without flat dark slab below beam', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.route('**/api/integrations', (route) =>
    route.fulfill({ json: { success: true, data: { integrations: { anthropic: {}, deepgram: {} } } } }),
  )
  for (const [path, signedOut] of [['/settings', false], ['/settings', true], ['/api-status', false]] as const) {
    if (signedOut) await setup(page, true)
    await page.goto(`${origin}${path}`)
    const roofCanvas = page.locator('.porch-nav__roof canvas').first()
    await expect(roofCanvas).toBeVisible()
    const metrics = await roofCanvas.evaluate((el) => {
      const canvas = el as HTMLCanvasElement
      const ctx = canvas.getContext('2d')!
      const beamHighlight = ctx.getImageData(0, 12, 1, 1).data
      const belowBeam = ctx.getImageData(0, 18, 1, 1).data
      return {
        height: canvas.height,
        beamHighlight: Array.from(beamHighlight),
        belowBeamAlpha: belowBeam[3],
      }
    })
    // Row 12 in drawPorchRoof is P.wood[4] (#ecae7d = 236,174,125,255); rows >= 18 are transparent
    expect(metrics.height).toBeGreaterThanOrEqual(18)
    expect(metrics.beamHighlight).toEqual([236, 174, 125, 255])
    expect(metrics.belowBeamAlpha).toBe(0)
  }
})

test('capture Task 6 remaining screens across viewports', async ({ page }) => {
  test.skip(process.env.SCREENSHOTS !== '1')
  const dir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-18-porch')
  await mkdir(dir, { recursive: true })
  const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 }]

  // 404 empty beach at dusk
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

  // Protected signed-out panel (porch-wood panel)
  await setup(page, true)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`${origin}/settings`)
  await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: resolve(dir, 'signed-out-1280x720.png') })

  // API status (porch-wood panel)
  await setup(page)
  await page.route('**/api/integrations', (route) =>
    route.fulfill({ json: { success: true, data: { integrations: { anthropic: {}, deepgram: {} } } } }),
  )
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`${origin}/api-status`)
  await expect(page.getByText('Integration catalog ready')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: resolve(dir, 'api-status-1280x720.png') })
})

test('StaticPorchNav renders landing signs without false aria-current and fits tablet 768px nav without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page, true)
  await page.goto(`${origin}/`)
  const landingNav = page.getByTestId('app-navigation')
  await expect(landingNav.locator('.porch-nav__sign[aria-current="page"]')).toHaveCount(0)
  for (const label of ['Daily', 'Party', 'Scores', 'Gallery']) {
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
        endsAt: Date.now() + 570_000,
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
  await expect(page.getByTestId('scores-boosters').locator('canvas')).toHaveCount(3)

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
    const booster = el.parentElement?.querySelector('.scores-boosters canvas') as HTMLCanvasElement
    const haiku = el.parentElement?.querySelector('.haiku__canvas') as HTMLCanvasElement
    const rowLink = el.querySelector('.scores-row-link') as HTMLElement
    return {
      px,
      thumbRatio: thumb.clientWidth / thumb.width,
      trophyRatio: trophy.clientWidth / trophy.width,
      medalRatio: medal.clientWidth / medal.width,
      boosterRatio: booster.clientWidth / booster.width,
      haikuRatio: haiku.clientWidth / haiku.width,
      rowLinkHeight: rowLink.getBoundingClientRect().height,
    }
  })
  expect(scoreScaleMetrics.px).toBe(3)
  expect(scoreScaleMetrics.thumbRatio).toBe(3)
  expect(scoreScaleMetrics.trophyRatio).toBe(3)
  expect(scoreScaleMetrics.medalRatio).toBe(3)
  expect(scoreScaleMetrics.boosterRatio).toBe(3)
  expect(scoreScaleMetrics.haikuRatio).toBe(3)
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
  const bounds = (await board.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(375)

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
  await expect(page.getByTestId('gallery-wall')).toBeVisible()
  await expect(page.getByRole('heading', { name: "Alice's gallery" })).toBeVisible()

  const frames = page.locator('[data-testid^="gallery-frame-"]')
  await expect(frames).toHaveCount(4)
  await expect(frames.nth(0)).toHaveAttribute('data-testid', 'gallery-frame-2026-11-17')
  await expect(frames.nth(0)).toHaveAttribute('data-frame-kind', 'gilt')
  await expect(frames.nth(0)).toContainText('A lighthouse')
  await expect(frames.nth(0)).toContainText('2026-11-17')
  await expect(frames.nth(0)).toContainText('912 / 1000')
  await expect(frames.nth(0)).toContainText('Haiku guessed: lighthouse')
  await expect(frames.nth(0)).toContainText('#1 Gold')
  await expect(frames.nth(0).getByLabel('Gold medal')).toBeVisible()
  const galleryMetrics = await frames.nth(0).evaluate((el) => {
    const thumb = el.querySelector('.gallery-frame__thumb') as HTMLCanvasElement
    const medal = el.querySelector('.gallery-plaque__medal') as HTMLCanvasElement
    const px = parseFloat(getComputedStyle(thumb).getPropertyValue('--px')) || 3
    return {
      px,
      thumbRatio: thumb.clientWidth / thumb.width,
      medalRatio: medal.clientWidth / medal.width,
    }
  })
  expect(galleryMetrics).toEqual({ px: 3, thumbRatio: 6, medalRatio: 3 })

  await expect(frames.nth(1)).toHaveAttribute('data-testid', 'gallery-frame-2026-11-15')
  await expect(frames.nth(1)).toHaveAttribute('data-frame-kind', 'wood')
  await expect(frames.nth(1)).toContainText('An anchor')
  await expect(page.getByText('A windmill')).toHaveCount(0)

  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(vp)
    await expect.poll(async () => {
      const layout = await page.evaluate(() => {
        const main = document.querySelector('main')!
        const pageEl = document.querySelector('.gallery-page') as HTMLElement
        const backdropCanvas = document.querySelector('.gallery-backdrop__canvas') as HTMLElement
        return {
          docScrollW: document.documentElement.scrollWidth,
          mainScrollW: main.scrollWidth,
          mainClientW: main.clientWidth,
          pageH: pageEl.getBoundingClientRect().height,
          canvasH: backdropCanvas.getBoundingClientRect().height,
        }
      })
      return layout.docScrollW <= vp.width
        && layout.mainScrollW <= layout.mainClientW
        && layout.canvasH >= Math.floor(layout.pageH)
    }).toBe(true)
  }

  // Mobile 375x812: single column stacking check
  await page.setViewportSize({ width: 375, height: 812 })
  const firstBox = (await frames.nth(0).boundingBox())!
  const secondBox = (await frames.nth(1).boundingBox())!
  expect(secondBox.y).toBeGreaterThanOrEqual(firstBox.y + firstBox.height)
})

test('empty gallery shows single empty frame and Paint today prompt link to /home', async ({ page }) => {
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
  await expect(empty).toContainText('No drawings to show yet.')
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
