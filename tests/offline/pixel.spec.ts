import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ServerMsg } from '../../src/game/protocol'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const fixtureUser = { id: 'host', name: 'Offline host', email: 'host@example.test' }
// Deliberately unsigned fixture, consumed only by the intercepted client APIs.
const fixtureToken = `fixture.${Buffer.from(JSON.stringify({ sub: fixtureUser.id, name: fixtureUser.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`

async function clientFixture(page: Page, options: { signedIn?: boolean; hostId?: string; preflight?: () => Promise<void>; rooms?: { recordId: string; data: Record<string, unknown> }[] } = {}) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: options.signedIn ? {
      user: fixtureUser, session: { id: 'offline-session', userId: 'host', expiresAt: '2096-01-01T00:00:00Z' },
    } : null })
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token: fixtureToken } })
    if (url.pathname === '/api/daily/me') {
      const now = Date.now()
      return route.fulfill({ json: { day: new Date(now).toISOString().slice(0, 10), status: 'not_started', autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: now } })
    }
    if (url.pathname.startsWith('/api/pixel/')) {
      await options.preflight?.()
      return route.fulfill({ status: 401, body: 'Unauthorized' })
    }
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
      if (raw === 'ping') { socket.send('pong'); return }
      const message = JSON.parse(String(raw))
      if (message.type === 'user.list') socket.send(JSON.stringify({ type: 'user.list', payload: { users: [] } }))
      if (message.type !== 'core.subscribe') return
      const { subscriptionId, query } = message.payload
      const records = query.collection === 'rooms' ? (options.rooms ?? [{ recordId: 'room', data: {
        name: 'Offline party', mode: 'coop', visibility: 'private', joinCode: 'AB2Z', hostId: options.hostId ?? 'host', status: 'lobby', isDefaultBoard: false,
      } }]) : []
      socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId, records } }))
    })
  })
  return errors
}

function snapshot(state: 'playing' | 'lobby'): Extract<ServerMsg, { t: 'snapshot' }> {
  return {
    t: 'snapshot', mode: 'coop', width: 32, height: 32, cells: Buffer.alloc(1024).toString('base64'),
    round: { id: state, word: state === 'playing' ? 'sun' : '', state, startedAt: Date.now(), endsAt: state === 'playing' ? Date.now() + 300000 : null, askAvailableAt: Date.now() + 10000 },
    you: { userId: 'host', cooldownUntil: 0 }, players: 1, watching: 0, roster: [{ userId: 'host', name: 'Offline host' }], aiResting: false,
  }
}

async function pixelColor(page: Page, x: number, y: number) {
  return page.getByTestId('pixel-canvas').evaluate((canvas: HTMLCanvasElement, point) =>
    [...canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data], { x, y })
}

for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 720 }]) {
  test(`intermission controls remain reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await clientFixture(page, { signedIn: true })
    let server!: WebSocketRoute
    const messages: string[] = []
    await page.routeWebSocket('**/api/pixel/**', socket => {
      server = socket
      socket.send(JSON.stringify(snapshot('playing')))
      socket.onMessage(raw => messages.push(String(raw)))
    })
    await page.goto(`${origin}/r/AB2Z`)
    await expect(page.getByTestId('pixel-canvas')).toBeVisible()
    const round = { ...snapshot('playing').round, state: 'intermission', endsAt: null, endedAt: Date.now(), result: { outcome: 'won', score: 1 } }
    server.send(JSON.stringify({ t: 'round', round }))
    const overlay = page.getByTestId('round-overlay')
    const next = overlay.getByRole('button', { name: 'New game' })
    await expect(next).toBeVisible()
    const frame = await page.getByTestId('pixel-canvas').boundingBox()
    const dismiss = page.getByTestId('overlay-dismiss')
    for (const control of [dismiss, next]) {
      const bounds = await control.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(Math.max(0, frame!.x))
      expect(bounds!.y).toBeGreaterThanOrEqual(Math.max(0, frame!.y))
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(Math.min(viewport.width, frame!.x + frame!.width))
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(Math.min(viewport.height, frame!.y + frame!.height))
    }
    await next.click()
    await expect.poll(() => messages.some(message => JSON.parse(message).t === 'next')).toBe(true)
    await dismiss.click()
    await expect(overlay).toHaveCount(0)
  })
}

test('selected swatch displays a separate keyboard focus outline', async ({ page }) => {
  await clientFixture(page, { signedIn: true })
  await page.routeWebSocket('**/api/pixel/**', socket => socket.send(JSON.stringify(snapshot('playing'))))
  await page.goto(`${origin}/r/AB2Z`)
  const selected = page.locator('[data-testid="palette"] button[aria-pressed="true"]')
  await expect(selected).toBeVisible()
  const before = await selected.evaluate(element => getComputedStyle(element).outlineOffset)
  await page.keyboard.press('Shift')
  await selected.focus()
  await expect(selected).toHaveCSS('outline-offset', '3px')
  expect(before).not.toBe('3px')
})

test('navigation, logo and home visibility controls use the palette focus outline', async ({ page }) => {
  await clientFixture(page, { signedIn: true })
  await page.goto(`${origin}/party`)
  const input = page.getByTestId('join-code-input')
  await expect(input).toHaveAttribute('placeholder', 'Enter 4-char code')
  await expect(input).toHaveAttribute('maxlength', '64')
  await page.keyboard.press('Shift')
  const controls = [
    ...await page.getByTestId('app-navigation').getByRole('link').all(),
    page.getByTestId('visibility-public'), page.getByTestId('visibility-private'),
  ]
  for (const control of controls) {
    if (!await control.isVisible()) continue
    await control.focus()
    await expect(control).toHaveCSS('outline-width', '3px')
    await expect(control).toHaveCSS('outline-style', 'solid')
    await expect(control).toHaveCSS('outline-color', 'rgb(57, 42, 69)')
    await expect(control).toHaveCSS('outline-offset', '3px')
  }
})

test('mobile navigation toggle uses the shared palette outline without a second focus ring', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await clientFixture(page, { signedIn: true })
  await page.goto(`${origin}/party`)
  const toggle = page.getByRole('button', { name: 'Toggle menu' })
  await expect(toggle).toBeVisible()
  await page.keyboard.press('Shift')
  await toggle.focus()
  await expect(toggle).toHaveCSS('outline-width', '2px')
  await expect(toggle).toHaveCSS('outline-style', 'solid')
  await expect(toggle).toHaveCSS('outline-color', 'rgb(57, 42, 69)')
  await expect(toggle).toHaveCSS('outline-offset', '2px')
  await expect(toggle).toHaveCSS('box-shadow', 'none')
})

test('canvas sizing stays stable when the room scroll container is scrolled before remeasurement', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await clientFixture(page, { signedIn: true })
  await page.routeWebSocket('**/api/pixel/**', socket => socket.send(JSON.stringify(snapshot('playing'))))
  await page.goto(`${origin}/r/AB2Z`)
  const canvas = page.getByTestId('pixel-canvas')
  await expect(canvas).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const originalWidth = (await canvas.boundingBox())!.width
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-testid="room-page"]')!.style.minHeight = '2000px'
    document.querySelector('main')!.scrollTop = 100
    window.dispatchEvent(new Event('resize'))
  })
  expect(await page.evaluate(() => document.querySelector('main')!.scrollTop)).toBe(100)
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(originalWidth)
})

test('countdown hook shares one tick per second between state effects and the interval', async ({ page }) => {
  const epoch = new Date('2026-11-17T17:00:00Z')
  await page.clock.install({ time: epoch })
  await page.addInitScript(() => {
    const state = window as unknown as { tickOscillators: number; audioContexts: number; AudioContext: unknown }
    state.tickOscillators = 0
    state.audioContexts = 0
    state.AudioContext = class {
      state = 'running'
      destination = {}
      constructor() { state.audioContexts++ }
      get currentTime() { return Date.now() / 1000 }
      createGain() {
        return {
          gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {},
        }
      }
      createOscillator() {
        let frequency = 0
        const oscillator = {
          type: 'sine',
          frequency: { setValueAtTime(value: number) { frequency = value } },
          connect() {},
          start() { if (oscillator.type === 'triangle' && frequency === 1046.5) state.tickOscillators++ },
          stop() {},
        }
        return oscillator
      }
    }
  })
  const errors = await clientFixture(page, { signedIn: true })
  const state = snapshot('playing')
  state.round.endsAt = epoch.getTime() + 300000
  let server!: WebSocketRoute
  await page.routeWebSocket('**/api/pixel/**', socket => {
    server = socket
    socket.send(JSON.stringify(state))
  })
  await page.goto(`${origin}/r/AB2Z`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  await page.clock.pauseAt(new Date(epoch.getTime() + 60000))
  await page.keyboard.press('Shift')
  await expect.poll(() => page.evaluate(() => (window as unknown as { audioContexts: number }).audioContexts)).toBe(1)
  const ticks = () => page.evaluate(() => (window as unknown as { tickOscillators: number }).tickOscillators)
  expect(await ticks()).toBe(0)
  const now = await page.evaluate(() => Date.now())
  server.send(JSON.stringify({ t: 'round', round: { ...state.round, endsAt: now + 6000 } }))
  await expect(page.getByTestId('round-timer')).toHaveText('0:06')
  await page.clock.setSystemTime(new Date(now + 1000))
  server.send(JSON.stringify({ t: 'players', count: 2, watching: 0, roster: state.roster }))
  await expect(page.getByTestId('round-players')).toHaveText('2 painters')
  await expect.poll(ticks).toBe(1)
  await page.clock.runFor(250)
  expect(await ticks()).toBe(1)
  await page.clock.runFor(1000)
  expect(await ticks()).toBe(2)
  server.send(JSON.stringify({ t: 'players', count: 3, watching: 0, roster: state.roster }))
  await expect(page.getByTestId('round-players')).toHaveText('3 painters')
  expect(await ticks()).toBe(2)
  await page.clock.runFor(500)
  expect(await ticks()).toBe(2)
  expect(errors).toEqual([])
})

test('audio unlock retries on a later interaction until the context runs', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { unlockAttempts: number; AudioContext: unknown }
    state.unlockAttempts = 0
    state.AudioContext = class {
      state = 'suspended'
      destination = {}
      createGain() { return { gain: { value: 0 }, connect() {} } }
      async resume() {
        state.unlockAttempts++
        if (state.unlockAttempts > 1) this.state = 'running'
      }
    }
  })
  await clientFixture(page, { signedIn: true })
  await page.routeWebSocket('**/api/pixel/**', socket => socket.send(JSON.stringify(snapshot('playing'))))
  await page.goto(`${origin}/r/AB2Z`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  await page.keyboard.press('Shift')
  await expect.poll(() => page.evaluate(() => (window as unknown as { unlockAttempts: number }).unlockAttempts)).toBe(1)
  await page.keyboard.press('Shift')
  await expect.poll(() => page.evaluate(() => (window as unknown as { unlockAttempts: number }).unlockAttempts)).toBe(2)
  await page.keyboard.press('Shift')
  expect(await page.evaluate(() => (window as unknown as { unlockAttempts: number }).unlockAttempts)).toBe(2)
})

test('room shells expose the sunset background', async ({ page }) => {
  await clientFixture(page, { signedIn: true })
  await page.routeWebSocket('**/api/pixel/**', socket => socket.send(JSON.stringify(snapshot('playing'))))
  await page.goto(`${origin}/r/AB2Z`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  const backgrounds = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="app-root"]')!
    const shell = root.querySelector('.h-screen')!
    return [getComputedStyle(document.body).backgroundImage, getComputedStyle(root).backgroundColor, getComputedStyle(shell).backgroundColor]
  })
  expect(backgrounds[0]).toContain('linear-gradient')
  expect(backgrounds.slice(1)).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'])
})

for (const entry of ['direct', 'home-join'] as const) {
  test(`signed-out private ${entry} and reload never attach a board before access is denied`, async ({ page }) => {
    let release!: () => void
    const preflight = new Promise<void>(resolve => { release = resolve })
    const errors = await clientFixture(page, { preflight: () => preflight })
    await page.addInitScript(() => {
      const state = window as unknown as { roomContentInsertions: string[] }
      state.roomContentInsertions = []
      const selector = 'canvas:not(.porch-sprite):not(.pixel-scene__canvas), [role="grid"], .grid-cols-10, [data-testid*="canvas"], [data-testid*="board"], [data-testid="round-players"], [data-testid="room-lobby"]'
      new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue
            const board = node.matches(selector) ? node : node.querySelector(selector)
            const grid = [node, ...node.querySelectorAll('[class*="grid"]')].find(element =>
              element.className.includes('grid') && element.children.length >= 25)
            if (board || grid) state.roomContentInsertions.push(`${location.pathname}: ${(board ?? grid)!.outerHTML.slice(0, 200)}`)
          }
        }
      }).observe(document, { childList: true, subtree: true })
    })
    await page.routeWebSocket('**/api/pixel/**', socket => socket.close({ code: 1008 }))
    const response = await page.goto(`${origin}/${entry === 'direct' ? 'r/AB2Z' : 'party'}`)
    expect(await response!.text()).not.toMatch(/<canvas|grid-cols-10|pixel-canvas-frame/)
    if (entry === 'home-join') {
      await page.getByTestId('join-code-input').fill('ab2z')
      await page.getByTestId('join-code-submit').click()
      await expect(page).toHaveURL(`${origin}/r/AB2Z`)
    }
    await expect(page.getByTestId('room-loading')).toBeVisible()
    await expect(page.getByTestId('pixel-canvas')).toHaveCount(0)
    release()
    await expect(page.getByTestId('room-error-unauthorized')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { roomContentInsertions: string[] }).roomContentInsertions)).toEqual([])

    // A full navigation gets another empty shell and a fresh observer before any app code.
    const reload = await page.reload()
    expect(await reload!.text()).not.toMatch(/<canvas|grid-cols-10|pixel-canvas-frame/)
    await expect(page.getByTestId('room-error-unauthorized')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { roomContentInsertions: string[] }).roomContentInsertions)).toEqual([])
    expect(errors).toEqual([])
  })
}

test('fast solo drag paints a solid optimistic stroke and sends a frame batch with targeted rollback', async ({ page }) => {
  const errors = await clientFixture(page, { signedIn: true })
  const sent: { x: number; y: number; c: number }[][] = []
  let server!: WebSocketRoute
  await page.routeWebSocket('**/api/pixel/**', socket => {
    server = socket
    socket.send(JSON.stringify(snapshot('playing')))
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw))
      if (message.t === 'place') sent.push(message.cells)
    })
  })
  await page.goto(`${origin}/r/AB2Z`)
  const canvas = page.getByTestId('pixel-canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const point = (x: number, y: number) => ({ x: box.x + box.width * (x + 0.5) / 32, y: box.y + box.height * (y + 0.5) / 32 })
  await canvas.dispatchEvent('pointerdown', { clientX: point(1, 1).x, clientY: point(1, 1).y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointermove', { clientX: point(20, 1).x, clientY: point(20, 1).y, pointerId: 1, pointerType: 'mouse', buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect.poll(() => sent.flat().length).toBe(20)
  expect(sent.some(cells => cells.length > 1)).toBe(true)
  expect(sent.flat().map(cell => cell.x)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  // The fixture has sent no acceptance yet: these are all optimistic pixels.
  for (let x = 1; x <= 20; x++) expect(await pixelColor(page, x, 1)).toEqual([239, 68, 68, 255])
  server.send(JSON.stringify({ t: 'reject', reason: 'rate_limited', x: 10, y: 1, retryAt: Date.now() + 17 }))
  await expect.poll(() => pixelColor(page, 10, 1)).toEqual([239, 227, 204, 255])
  expect(await pixelColor(page, 11, 1)).toEqual([239, 68, 68, 255])
  expect(errors).toEqual([])
})

test('private lobby shows code and roster, copies full link, and host can start solo', async ({ page }) => {
  const errors = await clientFixture(page, { signedIn: true })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as unknown as { copiedLink: string }).copiedLink = text } } })
  })
  await page.routeWebSocket('**/api/pixel/**', socket => {
    socket.send(JSON.stringify(snapshot('lobby')))
    socket.onMessage(raw => { if (JSON.parse(String(raw)).t === 'next') socket.send(JSON.stringify(snapshot('playing'))) })
  })
  await page.goto(`${origin}/r/ab2z`)
  await expect(page.getByTestId('room-lobby')).toBeVisible()
  await expect(page.getByTestId('room-code')).toHaveText('AB2Z')
  await expect(page.getByRole('list', { name: 'Connected players' })).toContainText('Offline host')
  await expect(page.getByTestId('pixel-canvas')).toHaveCount(0)
  await page.getByTestId('copy-room-link').click()
  expect(await page.evaluate(() => (window as unknown as { copiedLink: string }).copiedLink)).toBe(`${origin}/r/AB2Z`)
  await page.getByTestId('host-start-button').click()
  await expect(page.getByTestId('room-lobby')).toHaveCount(0)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  expect(errors).toEqual([])
})

test('public spectators retain click-to-sign-in and never send placements', async ({ page }) => {
  const errors = await clientFixture(page)
  const placements: unknown[] = []
  await page.routeWebSocket('**/api/pixel/**', socket => {
    const state = snapshot('playing')
    socket.send(JSON.stringify({ ...state, you: { userId: null, cooldownUntil: 0 }, players: 0, roster: [] }))
    socket.onMessage(raw => { if (JSON.parse(String(raw)).t === 'place') placements.push(raw) })
  })
  await page.goto(`${origin}/r/play`)
  await page.getByTestId('pixel-canvas').click()
  await expect(page.getByRole('heading', { name: 'Sign in to DeepSpace' })).toBeVisible()
  expect(placements).toEqual([])
  expect(errors).toEqual([])
})

test('switching from a public board to a private invite clears the previous room before effects resolve', async ({ page }) => {
  let release!: () => void
  const preflight = new Promise<void>(resolve => { release = resolve })
  const errors = await clientFixture(page, { preflight: () => preflight })
  await page.routeWebSocket('**/api/pixel/**', socket => {
    if (new URL(socket.url()).pathname.includes('/play/')) {
      socket.send(JSON.stringify({ ...snapshot('playing'), you: { userId: null, cooldownUntil: 0 } }))
    } else socket.close({ code: 1008 })
  })
  await page.goto(`${origin}/r/play`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  // Same mounted route component: exercise its identity/scope reset without reloading the app.
  await page.evaluate(() => {
    history.pushState({}, '', '/r/AB2Z')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByTestId('room-loading')).toBeVisible()
  await expect(page.getByTestId('pixel-canvas')).toHaveCount(0)
  release()
  await expect(page.getByTestId('room-error-unauthorized')).toBeVisible()
  expect(errors).toEqual([])
})

test('host deletion asks for confirmation, closes the board, and never reconnects', async ({ page }) => {
  const errors = await clientFixture(page, { signedIn: true })
  await page.clock.install()
  let socket!: WebSocketRoute
  let connections = 0
  let deletes = 0
  await page.routeWebSocket('**/api/pixel/**', connection => {
    connections++
    socket = connection
    connection.send(JSON.stringify(snapshot('playing')))
  })
  await page.route('**/api/actions/deleteRoom', async route => {
    deletes++
    expect(route.request().postDataJSON()).toEqual({ joinCode: 'AB2Z' })
    socket.send(JSON.stringify({ t: 'closed' }))
    socket.close({ code: 4001 })
    await route.fulfill({ json: { success: true, data: { roomId: 'room' } } })
  })
  await page.goto(`${origin}/r/AB2Z`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  const trigger = page.getByRole('button', { name: 'Delete room', exact: true })
  await expect(trigger).toHaveCSS('color', 'rgb(169, 73, 88)')
  await expect(trigger).toHaveCSS('border-color', 'rgb(169, 73, 88)')
  await trigger.click()
  await expect(page.getByRole('dialog')).toContainText('This ends the room for everyone.')
  await expect(page.getByRole('dialog')).toHaveClass(/pp-panel/)
  await expect(page.getByRole('dialog')).toHaveCSS('border-radius', '0px')
  const confirm = page.getByRole('button', { name: 'End room', exact: true })
  await expect(confirm).toHaveCSS('background-image', 'none')
  await expect(confirm).toHaveCSS('background-color', 'rgb(169, 73, 88)')
  await expect(confirm).toHaveCSS('color', 'rgb(255, 240, 204)')
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveClass(/pp-chip/)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(deletes).toBe(0)
  await page.getByRole('button', { name: 'Delete room', exact: true }).click()
  await page.getByRole('button', { name: 'End room', exact: true }).click()
  await expect(page.getByTestId('room-error-closed')).toContainText('This room was closed by the host')
  await expect(page.getByTestId('pixel-canvas')).toHaveCount(0)
  await page.clock.fastForward(30000)
  expect(deletes).toBe(1)
  expect(connections).toBe(1)
  expect(errors).toEqual([])
})

for (const code of ['AB2Z', 'play']) {
  test(`results in ${code} wait for explicit New game, with the host absent`, async ({ page }) => {
    const errors = await clientFixture(page, { signedIn: true, hostId: 'absent-host' })
    await page.clock.install()
    const commands: string[] = []
    await page.routeWebSocket('**/api/pixel/**', socket => {
      const state = snapshot('playing')
      socket.send(JSON.stringify({ ...state, round: { ...state.round, state: 'intermission', endedAt: Date.now(), result: { outcome: 'timeout' } } }))
      socket.onMessage(raw => {
        const command = JSON.parse(String(raw)).t
        commands.push(command)
        if (command === 'next') socket.send(JSON.stringify({ ...state, round: { ...state.round, id: 'next-round' } }))
      })
    })
    await page.goto(`${origin}/r/${code}`)
    await expect(page.getByRole('button', { name: 'New game', exact: true }).last()).toBeVisible()
    await page.clock.fastForward(60000)
    await expect(page.getByRole('button', { name: 'New game', exact: true }).last()).toBeVisible()
    expect(commands).toEqual([])
    await page.getByRole('button', { name: 'New game', exact: true }).last().click()
    await expect(page.getByTestId('round-word')).toContainText('sun')
    expect(commands).toEqual(['next'])
    expect(errors).toEqual([])
  })
}

for (const hostConnected of [true, false]) {
  test(`non-host cannot skip a live round and ${hostConnected ? 'cannot' : 'can'} start results when host is ${hostConnected ? 'present' : 'absent'}`, async ({ page }) => {
    const errors = await clientFixture(page, { signedIn: true, hostId: 'other-host' })
    let server!: WebSocketRoute
    const commands: string[] = []
    await page.routeWebSocket('**/api/pixel/**', socket => {
      server = socket
      socket.onMessage(raw => commands.push(JSON.parse(String(raw)).t))
      const state = snapshot('playing')
      socket.send(JSON.stringify({ ...state, roster: [
        ...state.roster!, ...(hostConnected ? [{ userId: 'other-host', name: 'Other host' }] : []),
      ] }))
    })
    await page.goto(`${origin}/r/AB2Z`)
    await expect(page.getByTestId('pixel-canvas')).toBeVisible()
    await expect(page.getByTestId('host-next-button')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Delete room', exact: true })).toHaveCount(0)
    server.send(JSON.stringify({ t: 'round', round: { ...snapshot('playing').round, state: 'intermission', endedAt: Date.now(), result: { outcome: 'timeout' } } }))
    await expect(page.getByTestId('round-timer')).toHaveText('ROUND OVER')
    await expect(page.getByTestId('round-overlay')).toBeVisible()
    await expect(page.getByTestId('overlay-next')).toHaveCount(hostConnected ? 0 : 1)
    await expect(page.getByTestId('host-next-button')).toHaveCount(hostConnected ? 0 : 1)
    if (!hostConnected) {
      await page.getByTestId('host-next-button').click()
      await expect.poll(() => commands).toEqual(['next'])
    }
    if (hostConnected) await expect(page.getByTestId('round-overlay')).toContainText('Waiting for the host to start a new game.')
    expect(errors).toEqual([])
  })
}

test('banner-aware canvas sizing keeps palette inside 1280x720 with spectator banner and reject notice, and renders room name', async ({ page }) => {
  const errors = await clientFixture(page)
  let server!: WebSocketRoute
  await page.routeWebSocket('**/api/pixel/**', socket => {
    server = socket
    const state = snapshot('playing')
    socket.send(JSON.stringify({ ...state, you: { userId: null, cooldownUntil: 0 }, players: 1, watching: 2, roster: [{ userId: 'host', name: 'Offline host' }] }))
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`${origin}/r/AB2Z`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  await expect(page.getByTestId('room-name')).toHaveText('Offline party')
  await expect(page.getByTestId('spectator-banner')).toBeVisible()

  server.send(JSON.stringify({ t: 'reject', reason: 'not_signed_in' }))
  await expect(page.getByTestId('reject-notice')).toBeVisible()

  await expect.poll(async () => {
    return page.evaluate(() => {
      const palette = document.querySelector('[data-testid="palette"]')!.getBoundingClientRect()
      return palette.bottom
    })
  }).toBeLessThanOrEqual(720)

  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="pixel-canvas"]')!.getBoundingClientRect()
    const palette = document.querySelector('[data-testid="palette"]')!.getBoundingClientRect()
    return { canvasWidth: canvas.width, canvasBottom: canvas.bottom, paletteBottom: palette.bottom }
  })
  console.log('1280x720 banner-case metrics:', JSON.stringify(metrics))
  expect(metrics.canvasBottom).toBeLessThanOrEqual(720)
  expect(metrics.paletteBottom).toBeLessThanOrEqual(720)
  expect(errors).toEqual([])
})

test('room shows Paint, Erase and Pick colour; no Fill, Undo or Redo', async ({ page }) => {
  const errors = await clientFixture(page, { signedIn: true })
  const sent: { x: number; y: number; c: number }[][] = []
  await page.routeWebSocket('**/api/pixel/**', socket => {
    const state = snapshot('playing')
    const cells = Buffer.alloc(1024)
    cells[2 * 32 + 2] = 9
    socket.send(JSON.stringify({ ...state, cells: cells.toString('base64') }))
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw))
      if (message.t === 'place') sent.push(message.cells)
    })
  })
  await page.goto(`${origin}/r/AB2Z`)
  const canvas = page.getByTestId('pixel-canvas')
  await expect(canvas).toBeVisible()

  const toolbar = page.getByTestId('toolbar')
  await expect(toolbar).toBeVisible()
  await expect(page.getByTestId('tool-paint')).toHaveText('Paint')
  await expect(page.getByTestId('tool-paint')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('tool-erase')).toHaveText('Erase')
  await expect(page.getByTestId('tool-pick')).toHaveText('Pick')
  await expect(page.getByTestId('tool-pick')).toHaveAttribute('aria-label', 'Pick colour')
  await expect(page.getByTestId('tool-fill')).toHaveCount(0)
  await expect(page.getByTestId('tool-undo')).toHaveCount(0)
  await expect(page.getByTestId('tool-redo')).toHaveCount(0)
  expect(await toolbar.innerText()).not.toMatch(/⌘|Ctrl|\b[BEFI]\b/)

  const box = (await canvas.boundingBox())!
  const point = (x: number, y: number) => ({ x: box.x + box.width * (x + 0.5) / 32, y: box.y + box.height * (y + 0.5) / 32 })

  // Pick colour from painted pixel (2, 2) -> selects color 9 and returns to Paint
  await page.getByTestId('tool-pick').click()
  await expect(page.getByTestId('tool-pick')).toHaveAttribute('aria-pressed', 'true')
  await canvas.dispatchEvent('pointerdown', { clientX: point(2, 2).x, clientY: point(2, 2).y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect(page.getByTestId('tool-paint')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('swatch-9')).toHaveAttribute('aria-pressed', 'true')

  // Switch to Erase and clear (2, 2) -> sends c: 0
  await page.getByTestId('tool-erase').click()
  await expect(page.getByTestId('tool-erase')).toHaveAttribute('aria-pressed', 'true')
  await canvas.dispatchEvent('pointerdown', { clientX: point(2, 2).x, clientY: point(2, 2).y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect.poll(() => sent.flat()).toContainEqual({ x: 2, y: 2, c: 0, id: 1 })
  await expect.poll(() => pixelColor(page, 2, 2)).toEqual([243, 234, 216, 255])

  // Pick colour on empty pixel (3, 3) -> switches to Erase
  await page.getByTestId('tool-pick').click()
  await canvas.dispatchEvent('pointerdown', { clientX: point(3, 3).x, clientY: point(3, 3).y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect(page.getByTestId('tool-erase')).toHaveAttribute('aria-pressed', 'true')

  expect(errors).toEqual([])
})

test('party noop clears provisional cooldown so next paint sends immediately', async ({ page }) => {
  const errors = await clientFixture(page, { signedIn: true })
  const sent: { x: number; y: number; c: number; id?: number }[][] = []
  let serverSocket!: WebSocketRoute
  await page.routeWebSocket('**/api/pixel/**', socket => {
    serverSocket = socket
    const state = snapshot('playing')
    const cells = Buffer.alloc(1024)
    cells[2 * 32 + 2] = 9
    socket.send(JSON.stringify({ ...state, players: 2, cells: cells.toString('base64') }))
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw))
      if (message.t !== 'place') return
      sent.push(message.cells)
      for (const cell of message.cells as { x: number; y: number; c: number; id?: number }[]) {
        if (cell.c === 0) {
          socket.send(JSON.stringify({ t: 'noop', x: cell.x, y: cell.y, ...(cell.id === undefined ? {} : { id: cell.id }) }))
        } else {
          socket.send(JSON.stringify({ t: 'pixel', x: cell.x, y: cell.y, c: cell.c, by: 'host' }))
        }
      }
    })
  })
  await page.goto(`${origin}/r/AB2Z`)
  const canvas = page.getByTestId('pixel-canvas')
  await expect(canvas).toBeVisible()

  const box = (await canvas.boundingBox())!
  const point = (x: number, y: number) => ({ x: box.x + box.width * (x + 0.5) / 32, y: box.y + box.height * (y + 0.5) / 32 })

  // Erase (2, 2); client starts provisional 2s cooldown, server echoes placement id in noop
  await page.getByTestId('tool-erase').click()
  await canvas.dispatchEvent('pointerdown', { clientX: point(2, 2).x, clientY: point(2, 2).y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect.poll(() => sent.flat()).toContainEqual({ x: 2, y: 2, c: 0, id: 1 })
  await expect.poll(() => pixelColor(page, 2, 2)).toEqual([243, 234, 216, 255])

  // Immediately paint (4, 4) without waiting 2s; succeeds because matching noop cleared provisional cooldown
  await page.getByTestId('tool-paint').click()
  await page.getByTestId('swatch-4').click()
  await canvas.dispatchEvent('pointerdown', { clientX: point(4, 4).x, clientY: point(4, 4).y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect.poll(() => sent.flat()).toContainEqual({ x: 4, y: 4, c: 4, id: 2 })
  await expect.poll(() => pixelColor(page, 4, 4)).toEqual([239, 68, 68, 255])

  // Stale noop with old id=1 must NOT clear the active cooldown from placement id=2
  serverSocket.send(JSON.stringify({ t: 'noop', x: 2, y: 2, id: 1 }))
  await canvas.dispatchEvent('pointerdown', { clientX: point(6, 6).x, clientY: point(6, 6).y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await page.waitForTimeout(100)
  expect(sent.flat().some(cell => cell.x === 6 && cell.y === 6)).toBe(false)
  expect(errors).toEqual([])
})

test('party reject with id settles provisional cooldown after peer pixel and respects retryAt', async ({ page }) => {
  const errors = await clientFixture(page, { signedIn: true })
  const sent: { x: number; y: number; c: number; id?: number }[][] = []
  await page.routeWebSocket('**/api/pixel/**', socket => {
    socket.send(JSON.stringify({ ...snapshot('playing'), players: 2 }))
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw))
      if (message.t !== 'place') return
      sent.push(message.cells)
      const [first] = message.cells as { x: number; y: number; c: number; id?: number }[]
      if (first?.id === 1) {
        socket.send(JSON.stringify({ t: 'pixel', x: first.x, y: first.y, c: 9, by: 'peer' }))
        socket.send(JSON.stringify({ t: 'reject', reason: 'cooldown', x: first.x, y: first.y, id: first.id, retryAt: Date.now() - 10 }))
      } else if (first) {
        socket.send(JSON.stringify({ t: 'pixel', x: first.x, y: first.y, c: first.c, by: 'host' }))
      }
    })
  })
  await page.goto(`${origin}/r/AB2Z`)
  const canvas = page.getByTestId('pixel-canvas')
  await expect(canvas).toBeVisible()

  const box = (await canvas.boundingBox())!
  const point = (x: number, y: number) => ({ x: box.x + box.width * (x + 0.5) / 32, y: box.y + box.height * (y + 0.5) / 32 })

  // Paint (2, 2) starting 2s provisional cooldown; peer supersedes cell before reject(id=1) arrives
  await canvas.dispatchEvent('pointerdown', { clientX: point(2, 2).x, clientY: point(2, 2).y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect.poll(() => sent.flat()).toContainEqual({ x: 2, y: 2, c: 4, id: 1 })
  await expect.poll(() => pixelColor(page, 2, 2)).toEqual([6, 182, 212, 255])

  // Wait for reject handling (banner triggers resize), then paint (4, 4) immediately without waiting 2s
  await expect(page.getByTestId('reject-notice')).toBeVisible()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const updatedBox = (await canvas.boundingBox())!
  const updatedPoint = (x: number, y: number) => ({ x: updatedBox.x + updatedBox.width * (x + 0.5) / 32, y: updatedBox.y + updatedBox.height * (y + 0.5) / 32 })
  await canvas.dispatchEvent('pointerdown', { clientX: updatedPoint(4, 4).x, clientY: updatedPoint(4, 4).y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 })
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse' })
  await expect.poll(() => sent.flat()).toContainEqual({ x: 4, y: 4, c: 4, id: 2 })
  await expect.poll(() => pixelColor(page, 4, 4)).toEqual([239, 68, 68, 255])
  expect(errors).toEqual([])
})

test('lobby easels link to rooms and overflow into More easels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const errors = await clientFixture(page, {
    signedIn: true,
    rooms: [
      { recordId: 'r-play', data: { name: 'Pixel Party', mode: 'coop', visibility: 'public', joinCode: 'play', hostId: 'system', status: 'playing', playerCount: 4, lastActiveAt: 5000, isDefaultBoard: true } },
      { recordId: 'r-1', data: { name: "Will's Studio", mode: 'coop', visibility: 'public', joinCode: 'QX3J', hostId: 'host', status: 'playing', playerCount: 3, lastActiveAt: 4000, isDefaultBoard: false } },
      { recordId: 'r-2', data: { name: 'Sunset Sketch', mode: 'coop', visibility: 'public', joinCode: 'M9K2', hostId: 'other', status: 'lobby', playerCount: 2, lastActiveAt: 3000, isDefaultBoard: false } },
      { recordId: 'r-3', data: { name: 'Late Night', mode: 'coop', visibility: 'public', joinCode: 'P4W8', hostId: 'other', status: 'playing', playerCount: 1, lastActiveAt: 2000, isDefaultBoard: false } },
      { recordId: 'r-4', data: { name: 'Overflow Easel', mode: 'coop', visibility: 'public', joinCode: 'Z7T1', hostId: 'other', status: 'lobby', playerCount: 1, lastActiveAt: 1000, isDefaultBoard: false } },
    ],
  })
  await page.goto(`${origin}/party`)
  await expect(page.locator('.studio-world .pixel-scene__canvas')).toBeVisible()
  const list = page.getByTestId('public-rooms-list')
  await expect(list.getByTestId('room-card-QX3J')).toHaveAttribute('href', '/r/QX3J')
  await expect(list.getByTestId('room-card-QX3J')).toContainText("Will's Studio")
  await expect(page.getByRole('button', { name: 'Pack up easel', exact: true })).toBeVisible()
  await expect(page.getByText('More easels')).toBeVisible()
  await expect(page.getByTestId('room-card-Z7T1')).toHaveAttribute('href', '/r/Z7T1')
  expect(errors).toEqual([])
})

test('public board frame opens play room', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await clientFixture(page, { signedIn: true })
  await page.goto(`${origin}/party`)
  await expect(page.locator('.studio-world .pixel-scene__canvas')).toBeVisible()
  await expect(page.getByTestId('room-card-play')).toHaveAttribute('href', '/r/play')
  await expect(page.getByTestId('lobby-play-now')).toHaveAttribute('href', '/r/play')
  await page.getByTestId('room-card-play').click()
  await expect(page).toHaveURL(`${origin}/r/play`)
})

test('ticket booth joins by code', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await clientFixture(page, { signedIn: true })
  let joinedCode = ''
  await page.route('**/api/actions/joinRoom', async route => {
    joinedCode = (route.request().postDataJSON() as { joinCode: string }).joinCode
    await route.fulfill({ json: { success: true } })
  })
  await page.goto(`${origin}/party`)
  await expect(page.getByTestId('join-room-form')).toContainText('Got a code?')
  await page.getByTestId('join-code-input').fill('ab2z')
  await page.getByTestId('join-code-submit').click()
  await expect.poll(() => joinedCode).toBe('AB2Z')
  await expect(page).toHaveURL(`${origin}/r/AB2Z`)
})

test('workbench sign creates room', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await clientFixture(page, { signedIn: true })
  let body: Record<string, unknown> | null = null
  await page.route('**/api/actions/createRoom', async route => {
    body = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ json: { success: true, data: { roomId: 'room-new', joinCode: 'N3W1' } } })
  })
  await page.goto(`${origin}/party`)
  await expect(page.getByTestId('create-room-form')).toContainText('Set up an easel')
  await page.getByTestId('create-room-name').fill('Basement Club')
  await page.getByTestId('visibility-private').click()
  await page.getByTestId('create-room-submit').click()
  await expect.poll(() => body).toEqual({ name: 'Basement Club', mode: 'coop', visibility: 'private' })
  await expect(page).toHaveURL(`${origin}/r/N3W1`)
})

test('upstairs stairs return home with pan transition and reduced motion is instant', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await clientFixture(page, { signedIn: true })
  await page.goto(`${origin}/party`)
  const upstairs = page.locator('.studio-world').getByRole('link', { name: 'Upstairs', exact: true })
  await expect(upstairs).toBeVisible()
  await upstairs.click()
  await expect(page).toHaveURL(`${origin}/home`)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${origin}/party`)
  const start = Date.now()
  await page.locator('.studio-world').getByRole('link', { name: 'Upstairs', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/home`)
  expect(Date.now() - start).toBeLessThan(300)
})

test('375 lobby no horizontal scroll and primary controls stay reachable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const errors = await clientFixture(page, {
    signedIn: true,
    rooms: [
      { recordId: 'r-play', data: { name: 'Pixel Party', mode: 'coop', visibility: 'public', joinCode: 'play', hostId: 'system', status: 'playing', playerCount: 4, lastActiveAt: 5000, isDefaultBoard: true } },
      { recordId: 'r-1', data: { name: 'A Very Long Studio Room Name That Must Truncate Cleanly', mode: 'coop', visibility: 'public', joinCode: 'QX3J', hostId: 'host', status: 'playing', playerCount: 3, lastActiveAt: 4000, isDefaultBoard: false } },
    ],
  })
  await page.goto(`${origin}/party`)
  await expect(page.locator('.studio-world .pixel-scene__canvas')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await expect(page.getByTestId('room-card-play')).toBeVisible()
  await expect(page.getByTestId('lobby-play-now')).toBeVisible()
  const card = page.getByTestId('room-card-QX3J')
  const roomName = card.locator('.truncate')
  await expect(roomName).toBeVisible()
  const cardBox = (await card.boundingBox())!
  const nameBox = (await roomName.boundingBox())!
  expect(nameBox.width).toBeLessThanOrEqual(cardBox.width)
  await page.getByTestId('join-room-form').scrollIntoViewIfNeeded()
  await expect(page.getByTestId('join-room-form')).toBeVisible()
  await expect(page.getByTestId('create-room-form')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  expect(errors).toEqual([])
})

test('signed-out studio lobby shows sign-in button for hosting', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const errors = await clientFixture(page, { signedIn: false })
  await page.goto(`${origin}/party`)
  await expect(page.getByTestId('create-room-signin')).toBeVisible()
  await expect(page.getByTestId('create-room-submit')).toHaveCount(0)
  await page.getByTestId('create-room-signin').click()
  await expect(page.getByRole('heading', { name: 'Sign in to DeepSpace' })).toBeVisible()
  expect(errors).toEqual([])
})

test('arriving from porch settles cleanly into the studio', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const errors = await clientFixture(page, { signedIn: true })
  await page.goto(`${origin}/home`)
  await page.locator('.porch-world').getByRole('link', { name: 'Party studio', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/party`)
  await expect(page.getByTestId('lobby-page')).toBeVisible()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('studio-from-porch'))).toBeNull()
  await expect.poll(() => page.locator('.studio-world .pixel-scene').evaluate(el => getComputedStyle(el).transform)).toMatch(/matrix\(1, 0, 0, 1, 0, 0\)|none/)
  expect(errors).toEqual([])
})

test('room exit returns to studio', async ({ page }) => {
  const errors = await clientFixture(page, { signedIn: true })
  await page.routeWebSocket('**/api/pixel/**', socket => socket.send(JSON.stringify(snapshot('playing'))))
  await page.goto(`${origin}/r/AB2Z`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  await expect(page.getByTestId('critic-bubble')).toBeVisible()
  await expect(page.getByTestId('party-score-note')).toHaveText('Fewer pixels and a faster guess score higher. The round ends when the critic guesses the word.')
  const exit = page.getByTestId('room-exit')
  await expect(exit).toBeVisible()
  await expect(exit).toHaveText(/Back downstairs to the studio/)
  await expect(exit).toHaveAttribute('href', '/party')
  await exit.click()
  await expect(page).toHaveURL(`${origin}/party`)
  await expect(page.getByTestId('lobby-page')).toBeVisible()
  expect(errors).toEqual([])
})

test('lobby shows stools per painter', async ({ page }) => {
  const errors = await clientFixture(page, { signedIn: true })
  await page.routeWebSocket('**/api/pixel/**', socket => {
    const state = snapshot('lobby')
    socket.send(JSON.stringify({
      ...state,
      players: 3,
      watching: 1,
      roster: [
        { userId: 'host', name: 'Offline host' },
        { userId: 'u2', name: 'Alex' },
        { userId: 'u3', name: 'Sam' },
      ],
    }))
  })
  await page.goto(`${origin}/r/AB2Z`)
  await expect(page.getByTestId('room-lobby')).toBeVisible()
  await expect(page.getByTestId('round-players')).toHaveText('3 painters')
  await expect(page.getByTestId('round-watching')).toHaveText('1 watching')
  await expect(page.getByTestId('lobby-stool')).toHaveCount(3)
  await expect(page.getByRole('list', { name: 'Connected players' })).toContainText('Alex')
  await expect(page.getByRole('list', { name: 'Connected players' })).toContainText('Sam')
  await expect(page.getByTestId('host-start-button')).toHaveText('Start painting')
  expect(errors).toEqual([])
})

test('results show pixels and time saved', async ({ page }) => {
  const errors = await clientFixture(page, { signedIn: true })
  const cells = Buffer.alloc(1024)
  for (let i = 0; i < 256; i++) cells[i] = 4
  const now = Date.now()
  await page.routeWebSocket('**/api/pixel/**', socket => {
    const state = snapshot('playing')
    socket.send(JSON.stringify({
      ...state,
      cells: cells.toString('base64'),
      round: {
        ...state.round,
        state: 'intermission',
        startedAt: now - 60_000,
        endedAt: now,
        result: { outcome: 'won', score: 775, contributorCount: 2 },
      },
    }))
  })
  await page.goto(`${origin}/r/AB2Z`)
  const overlay = page.getByTestId('round-overlay')
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('Pixels saved: 375/500')
  await expect(overlay).toContainText('Time saved: 400/500')
  await expect(page.getByTestId('overlay-score')).toContainText('775')
  expect(errors).toEqual([])
})

