import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ServerMsg } from '../../src/game/protocol'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const fixtureUser = { id: 'host', name: 'Offline host', email: 'host@example.test' }
// Deliberately unsigned fixture, consumed only by the intercepted client APIs.
const fixtureToken = `fixture.${Buffer.from(JSON.stringify({ sub: fixtureUser.id, name: fixtureUser.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`

async function clientFixture(page: Page, options: { signedIn?: boolean; hostId?: string; preflight?: () => Promise<void> } = {}) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: options.signedIn ? {
      user: fixtureUser, session: { id: 'offline-session', userId: 'host', expiresAt: '2096-01-01T00:00:00Z' },
    } : null })
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token: fixtureToken } })
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
      const records = query.collection === 'rooms' ? [{ recordId: 'room', data: {
        name: 'Offline party', mode: 'coop', visibility: 'private', joinCode: 'AB2Z', hostId: options.hostId ?? 'host', status: 'lobby', isDefaultBoard: false,
      } }] : []
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
  await expect(selected).toHaveCSS('outline-offset', '2px')
  expect(before).not.toBe('2px')
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
    await expect(control).toHaveCSS('outline-color', 'rgb(253, 230, 138)')
    await expect(control).toHaveCSS('outline-offset', '2px')
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
  await expect(toggle).toHaveCSS('outline-width', '3px')
  await expect(toggle).toHaveCSS('outline-style', 'solid')
  await expect(toggle).toHaveCSS('outline-color', 'rgb(253, 230, 138)')
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

test('room shells expose the navy body glow', async ({ page }) => {
  await clientFixture(page, { signedIn: true })
  await page.routeWebSocket('**/api/pixel/**', socket => socket.send(JSON.stringify(snapshot('playing'))))
  await page.goto(`${origin}/r/AB2Z`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()
  const backgrounds = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="app-root"]')!
    const shell = root.querySelector('.h-screen')!
    return [getComputedStyle(document.body).backgroundImage, getComputedStyle(root).backgroundColor, getComputedStyle(shell).backgroundColor]
  })
  expect(backgrounds[0]).toContain('radial-gradient')
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
      const selector = 'canvas, [role="grid"], .grid-cols-10, [data-testid*="canvas"], [data-testid*="board"], [data-testid="round-players"], [data-testid="room-lobby"]'
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
  await expect.poll(() => pixelColor(page, 10, 1)).toEqual([255, 255, 255, 255])
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
  await expect(trigger).toHaveCSS('color', 'rgb(236, 72, 153)')
  await expect(trigger).toHaveCSS('border-color', 'rgb(236, 72, 153)')
  await trigger.click()
  await expect(page.getByRole('dialog')).toContainText('This ends the room for everyone.')
  await expect(page.getByRole('dialog')).toHaveClass(/pp-panel/)
  await expect(page.getByRole('dialog')).toHaveCSS('border-radius', '0px')
  const confirm = page.getByRole('button', { name: 'End room', exact: true })
  await expect(confirm).toHaveCSS('background-image', 'none')
  await expect(confirm).toHaveCSS('background-color', 'rgb(236, 72, 153)')
  await expect(confirm).toHaveCSS('color', 'rgb(10, 8, 20)')
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
