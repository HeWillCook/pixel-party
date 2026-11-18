import { expect, test, type Page } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const user = { id: 'host', name: 'Offline host', email: 'host@example.test' }
const token = `fixture.${Buffer.from(JSON.stringify({ sub: user.id, name: user.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`

async function setup(page: Page, signedOut = false) {
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
      if (message.type === 'core.subscribe') socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId: message.payload.subscriptionId, records: [] } }))
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
  await expect(page.getByRole('dialog')).toBeVisible()
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

test('navigation artwork uses a substantial beam and mailbox', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page)
  await page.goto(`${origin}/party`)
  const beam = page.locator('.porch-nav__beam canvas').first()
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

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 375, height: 812 }]) {
  for (const state of ['landing', 'signed-out', 'not-started', 'ended'] as const) {
    test(`capture porch ${state} ${viewport.width}`, async ({ page }) => {
      test.skip(process.env.SCREENSHOTS !== '1')
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await setup(page, state === 'signed-out')
      if (state === 'ended') await page.route('**/api/daily/me', route => route.fulfill({ json: { day: '2026-11-17', status: 'ended', autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: true, best: 740, windows: [], nextAutoAt: null, serverNow: Date.now() } }))
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
