import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const screenshotsDir = resolve(import.meta.dirname, '../../docs/superpowers/screenshots/2026-11-21-feedback')
const user = { id: 'host', name: 'Offline host', email: 'host@example.test' }
const token = `fixture.${Buffer.from(JSON.stringify({ sub: user.id, name: user.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`

interface Profile {
  userId: string
  username: string
  onboardedAt: number
  usernameChangedAt: number
}

interface SetupOptions {
  signedOut?: boolean
  profile?: Profile | null
  taken?: string[]
  dailyStatus?: 'not_started' | 'playing'
}

async function setup(page: Page, options: SetupOptions = {}) {
  let profile = options.profile ?? null
  const taken = new Set((options.taken ?? []).map((name) => name.toLowerCase()))

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()

    if (url.pathname === '/api/auth/get-session') {
      return route.fulfill({ json: options.signedOut ? null : { user, session: { id: 'offline', userId: user.id, expiresAt: '2096-01-01T00:00:00Z' } } })
    }
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token: options.signedOut ? null : token } })
    if (url.pathname === '/api/daily/me') {
      const now = Date.now()
      const playing = options.dailyStatus === 'playing'
      return route.fulfill({
        json: {
          day: new Date(now).toISOString().slice(0, 10),
          status: playing ? 'playing' : 'not_started',
          autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: playing, best: 0,
          windows: [], nextAutoAt: playing ? now + 60_000 : null, serverNow: now, loaded: true,
          ...(playing ? { prompt: 'A lighthouse', startedAt: now - 30_000, endsAt: now + 270_000, lastCells: '' } : {}),
        },
      })
    }
    if (url.pathname === '/api/profile/me') {
      return route.fulfill({ json: { profile } })
    }
    if (url.pathname === '/api/profile/available') {
      const name = url.searchParams.get('name') ?? ''
      if (taken.has(name.toLowerCase())) {
        return route.fulfill({ json: { available: false, code: 'taken', message: "That name's taken" } })
      }
      return route.fulfill({ json: { available: true } })
    }
    if (url.pathname === '/api/profile' && route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as { username?: string }
      const username = body.username ?? ''
      if (taken.has(username.toLowerCase())) {
        return route.fulfill({ status: 409, json: { ok: false, code: 'taken', message: "That name's taken" } })
      }
      profile = { userId: user.id, username, onboardedAt: 0, usernameChangedAt: Date.now() }
      return route.fulfill({ json: { ok: true, profile } })
    }
    if (url.pathname === '/api/profile/onboarded' && route.request().method() === 'POST') {
      if (!profile) return route.fulfill({ status: 400, json: { ok: false, code: 'no_profile', message: 'Pick a username first' } })
      profile = { ...profile, onboardedAt: Date.now() }
      return route.fulfill({ json: { ok: true, profile } })
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} })

    const asset = url.pathname.startsWith('/assets/')
    const path = asset ? resolve(clientDir, `.${url.pathname}`) : resolve(clientDir, '_spa.html')
    const contentType = asset
      ? path.endsWith('.css') ? 'text/css' : path.endsWith('.woff2') ? 'font/woff2' : 'application/javascript'
      : 'text/html'
    return route.fulfill({ contentType, body: await readFile(path) })
  })

  await page.routeWebSocket('**/ws/**', (socket) => {
    if (socket.url().includes('/ws/presence/')) return
    socket.send(JSON.stringify({ type: 'user.info', payload: { role: 'member' } }))
    socket.onMessage((raw) => {
      if (raw === 'ping') return socket.send('pong')
      const message = JSON.parse(String(raw))
      if (message.type === 'user.list') socket.send(JSON.stringify({ type: 'user.list', payload: { users: [] } }))
      if (message.type !== 'core.subscribe') return
      const { subscriptionId } = message.payload
      socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId, records: [] } }))
    })
  })
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Welcome to Pixle' })

test('a first sign-in shows the username step and Escape cannot dismiss it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.goto(`${origin}/home`)

  const modal = dialog(page)
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('heading', { name: 'Pick a username' })).toBeVisible()
  await expect(page.getByTestId('username-input')).toHaveValue('Offlinehost')

  await page.keyboard.press('Escape')
  await expect(modal).toBeVisible()
})

test('keyboard focus stays trapped in the onboarding dialog', async ({ page }) => {
  await setup(page)
  await page.goto(`${origin}/home`)
  const modal = dialog(page)
  await expect(modal).toBeVisible()
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('Tab')
    // Base UI's trap keeps focus in the dialog or on one of its focus guards;
    // the porch behind it must never receive a tab stop.
    const focus = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      return {
        tag: active?.tagName,
        inDialog: Boolean(active?.closest('[data-testid="onboarding"]')),
        onGuard: Boolean(active?.hasAttribute('data-base-ui-focus-guard')),
        onPage: Boolean(active?.closest('.porch-shell')),
      }
    })
    // The porch is inert behind the dialog: no tab stop may land on it.
    expect(focus.onPage, JSON.stringify(focus)).toBe(false)
  }
  await expect(modal).toBeVisible()
})

test('signed-out visitors never see onboarding', async ({ page }) => {
  await setup(page, { signedOut: true })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('nav-sign-in-button')).toBeVisible()
  await expect(dialog(page)).toHaveCount(0)
})

test('a Daily attempt in progress is never covered', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await setup(page, { dailyStatus: 'playing' })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  await expect(dialog(page)).toHaveCount(0)
})

test('invalid, profane and taken names show specific messages', async ({ page }) => {
  await setup(page, { taken: ['TakenName'] })
  await page.goto(`${origin}/home`)
  const modal = dialog(page)
  const input = page.getByTestId('username-input')
  const status = page.getByTestId('username-status')
  const submit = page.getByTestId('username-submit')

  await input.fill('ab')
  await expect(status).toHaveText('At least 3 characters')
  await expect(submit).toHaveAttribute('aria-disabled', 'true')

  await input.fill('Will Cook')
  await expect(status).toHaveText('Letters, numbers, _ and - only')
  await expect(submit).toHaveAttribute('aria-disabled', 'true')

  await input.fill('sh1t')
  await expect(status).toHaveText("Let's pick something friendlier")
  await expect(submit).toHaveAttribute('aria-disabled', 'true')

  await input.fill('_will')
  await expect(status).toHaveText('Start with a letter or number')

  await input.fill('TakenName')
  await expect(status).toHaveText("That name's taken")
  await expect(submit).toHaveAttribute('aria-disabled', 'true')
  await expect(modal).toBeVisible()
})

test('a valid name advances into the tour, which can be stepped, skipped and remembered', async ({ page }) => {
  await setup(page)
  await page.goto(`${origin}/home`)
  const modal = dialog(page)

  await page.getByTestId('username-input').fill('PixelWill')
  await expect(page.getByTestId('username-status')).toHaveText('Available')
  await page.getByTestId('username-submit').click()

  await expect(modal.getByRole('heading', { name: 'Daily' })).toBeVisible()
  await expect(page.getByTestId('onboarding-step')).toBeVisible()
  await expect(page.getByText('Skip tour')).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(modal.getByRole('heading', { name: 'Leaderboard' })).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(modal.getByRole('heading', { name: 'Party' })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(modal.getByRole('heading', { name: 'Leaderboard' })).toBeVisible()

  // Step dots jump directly.
  await page.getByRole('button', { name: /Step 4 of 4: Gallery/ }).click()
  await expect(modal.getByRole('heading', { name: 'Gallery' })).toBeVisible()
  await page.getByRole('button', { name: 'Finish' }).click()

  await expect(modal).toHaveCount(0)
  await expect(page.getByTestId('nav-user-name')).toHaveText('PixelWill')

  await page.reload()
  await expect(page.getByTestId('nav-user-name')).toHaveText('PixelWill')
  await expect(dialog(page)).toHaveCount(0)
})

test('Skip tour marks the player onboarded', async ({ page }) => {
  await setup(page)
  await page.goto(`${origin}/home`)
  await page.getByTestId('username-input').fill('PixelWill')
  await expect(page.getByTestId('username-status')).toHaveText('Available')
  await page.getByTestId('username-submit').click()
  await expect(dialog(page).getByRole('heading', { name: 'Daily' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip tour' }).click()
  await expect(dialog(page)).toHaveCount(0)

  await page.reload()
  await expect(dialog(page)).toHaveCount(0)
})

test('Escape skips the tour', async ({ page }) => {
  await setup(page)
  await page.goto(`${origin}/home`)
  await page.getByTestId('username-input').fill('PixelWill')
  await expect(page.getByTestId('username-status')).toHaveText('Available')
  await page.getByTestId('username-submit').click()
  await expect(dialog(page).getByRole('heading', { name: 'Daily' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
})

test('a player who already finished onboarding is not interrupted', async ({ page }) => {
  await setup(page, { profile: { userId: user.id, username: 'PixelWill', onboardedAt: Date.now(), usernameChangedAt: Date.now() } })
  await page.goto(`${origin}/home`)
  await expect(page.getByTestId('daily-start-button')).toBeVisible()
  await expect(dialog(page)).toHaveCount(0)
})

test('Settings shows the current username once the profile loads, with nothing to save yet', async ({ page }) => {
  await setup(page, { profile: { userId: user.id, username: 'PixelWill', onboardedAt: Date.now(), usernameChangedAt: 0 } })
  await page.goto(`${origin}/settings`)
  const input = page.getByTestId('username-input')
  await expect(input).toHaveValue('PixelWill')
  await expect(page.getByTestId('username-status')).toHaveText('Your current name')
  await expect(input).not.toHaveAttribute('aria-invalid', 'true')
  await input.fill('PixelWill2')
  await expect(page.getByTestId('username-status')).toHaveText('Available')
})

test('the dialog stays inside a phone viewport without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await setup(page)
  await page.goto(`${origin}/home`)
  await expect(dialog(page)).toBeVisible()
  const box = await dialog(page).boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(375)
  expect(box!.y + box!.height).toBeLessThanOrEqual(812)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
  test(`onboarding screenshots at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.skip(process.env.SCREENSHOTS !== '1', 'Run with SCREENSHOTS=1 to capture onboarding screenshots')
    await mkdir(screenshotsDir, { recursive: true })
    await page.setViewportSize(viewport)
    await setup(page)

    // Step 1: the picker, pre-filled from the sign-in name.
    await page.goto(`${origin}/home`)
    await expect(dialog(page)).toBeVisible()
    await expect(page.getByTestId('username-status')).toHaveText('Available')
    await page.screenshot({ path: resolve(screenshotsDir, `onboarding-username-${viewport.width}x${viewport.height}.png`) })

    // A tour card.
    await page.getByTestId('username-input').fill('PixelWill')
    await expect(page.getByTestId('username-status')).toHaveText('Available')
    await page.getByTestId('username-submit').click()
    await expect(dialog(page).getByRole('heading', { name: 'Daily' })).toBeVisible()
    await page.screenshot({ path: resolve(screenshotsDir, `onboarding-tour-${viewport.width}x${viewport.height}.png`) })
  })
}
