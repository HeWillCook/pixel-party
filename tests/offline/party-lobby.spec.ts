import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ServerMsg } from '../../src/game/protocol'

const origin = 'http://pixel.test'
const clientDir = resolve(import.meta.dirname, '../../dist/client')
const fixtureUser = { id: 'host', name: 'Offline host', email: 'host@example.test' }
// Deliberately unsigned fixture, consumed only by the intercepted client APIs.
const fixtureToken = `fixture.${Buffer.from(JSON.stringify({ sub: fixtureUser.id, name: fixtureUser.name, exp: 4_000_000_000 })).toString('base64url')}.unsigned`

type PartyRoomRow = {
  id: string
  name: string
  hostId: string
  mode: 'coop' | 'team'
  status: 'lobby' | 'playing' | 'intermission' | 'paused'
  playerCount: number
  visibility: 'public' | 'private'
  joinCode: string | null
}

/**
 * The Party lobby: the room list comes from GET /api/party/rooms (the collection cannot show a private
 * game to a non-member), and joining a locked game goes through the same join action the code form uses.
 */
async function partyClient(
  page: Page,
  options: { rooms?: PartyRoomRow[]; joinRoom?: (code: string) => { success: boolean; error?: string } } = {},
) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const joined: string[] = []
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: { user: fixtureUser, session: { id: 'offline-session', userId: 'host', expiresAt: '2096-01-01T00:00:00Z' } } })
    if (url.pathname === '/api/auth/token') return route.fulfill({ json: { token: fixtureToken } })
    if (url.pathname === '/api/party/rooms') return route.fulfill({ json: { rooms: options.rooms ?? [] } })
    if (url.pathname === '/api/actions/joinRoom') {
      const { joinCode } = route.request().postDataJSON() as { joinCode: string }
      joined.push(joinCode)
      return route.fulfill({ json: options.joinRoom?.(joinCode) ?? { success: true } })
    }
    if (url.pathname === '/api/daily/me') {
      const now = Date.now()
      return route.fulfill({ json: { day: new Date(now).toISOString().slice(0, 10), status: 'not_started', autoUsed: 0, asksUsed: 0, asksLeft: 3, finalUsed: false, best: 0, windows: [], nextAutoAt: null, serverNow: now } })
    }
    if (url.pathname.startsWith('/api/pixel/')) return route.fulfill({ status: 401, body: 'Unauthorized' })
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
      if (message.type === 'core.subscribe') {
        socket.send(JSON.stringify({ type: 'core.query_result', payload: { subscriptionId: message.payload.subscriptionId, records: [] } }))
      }
    })
  })
  return { errors, joined }
}

function snapshot(state: 'playing' | 'lobby' = 'playing'): Extract<ServerMsg, { t: 'snapshot' }> {
  return {
    t: 'snapshot', mode: 'coop', width: 32, height: 32, cells: Buffer.alloc(1024).toString('base64'),
    round: { id: state, word: state === 'playing' ? 'sun' : '', state, startedAt: Date.now(), endsAt: state === 'playing' ? Date.now() + 300000 : null, askAvailableAt: Date.now() + 10000 },
    you: { userId: 'host' }, players: 1, watching: 0, roster: [{ userId: 'host', name: 'Offline host' }], aiResting: false,
  }
}

const publicRoom: PartyRoomRow = {
  id: 'r-open', name: 'Sunset Sketch', hostId: 'other', mode: 'coop', status: 'playing', playerCount: 2, visibility: 'public', joinCode: 'M9K2',
}
const lockedRoom: PartyRoomRow = {
  id: 'r-locked', name: 'Secret Club', hostId: 'other', mode: 'coop', status: 'lobby', playerCount: 0, visibility: 'private', joinCode: null,
}

test('the lobby lists every open game, with a lock on private ones', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { errors } = await partyClient(page, { rooms: [publicRoom, lockedRoom] })
  await page.goto(`${origin}/party`)
  const list = page.getByTestId('games-list')
  await expect(list.getByRole('heading', { name: 'Open games' })).toBeVisible()
  await expect(list.getByTestId('room-card-M9K2')).toContainText('Sunset Sketch')
  await expect(list.getByTestId('room-card-M9K2')).toContainText('Co-op')
  await expect(list.getByTestId('room-card-M9K2')).toContainText('2 painters')
  await expect(list.getByTestId('room-card-r-locked')).toContainText('Secret Club')
  await expect(list.getByTestId('room-card-r-locked')).toHaveAttribute('data-locked', '1')
  // A locked game's row never carries its code, and its label says what a click will ask for.
  await expect(list.getByTestId('room-card-r-locked')).toHaveAttribute('aria-label', /private/)
  await expect(list.getByTestId('room-card-r-locked')).not.toContainText('PRV8')
  expect(errors).toEqual([])
})

test('the lobby empty state says to host a game', async ({ page }) => {
  await partyClient(page, { rooms: [] })
  await page.goto(`${origin}/party`)
  await expect(page.getByTestId('games-empty')).toHaveText('No games right now — host one!')
})

test('a public game joins on click', async ({ page }) => {
  const { errors } = await partyClient(page, { rooms: [publicRoom] })
  await page.routeWebSocket('**/api/pixel/**', socket => socket.send(JSON.stringify(snapshot('playing'))))
  await page.goto(`${origin}/party`)
  await page.getByTestId('room-card-M9K2').click()
  await expect(page).toHaveURL(`${origin}/r/M9K2`)
  await expect(page.getByTestId('room-page')).toBeVisible()
  expect(errors).toEqual([])
})

test('a private game asks for its code, and a wrong code is refused before the door', async ({ page }) => {
  const { errors, joined } = await partyClient(page, {
    rooms: [lockedRoom],
    joinRoom: code => code === 'PRV8' ? { success: true } : { success: false, error: 'Room not found' },
  })
  await page.routeWebSocket('**/api/pixel/**', socket => socket.send(JSON.stringify(snapshot('lobby'))))
  await page.goto(`${origin}/party`)
  await page.getByTestId('room-card-r-locked').click()
  const dialog = page.getByTestId('private-join-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Secret Club')
  await expect(page.getByTestId('private-join-code')).toBeFocused()

  await page.getByTestId('private-join-code').fill('nope')
  await page.getByTestId('private-join-submit').click()
  await expect.poll(() => joined).toEqual(['NOPE'])
  await expect(page.getByTestId('private-join-error')).toHaveText('That code does not open a game.')
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(`${origin}/party`)

  await page.getByTestId('private-join-code').fill('prv8')
  await page.getByTestId('private-join-submit').click()
  await expect.poll(() => joined).toEqual(['NOPE', 'PRV8'])
  await expect(page).toHaveURL(`${origin}/r/PRV8`)
  expect(errors).toEqual([])
})

test('a spelled-word judgement is never a match, and the feed says why', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const { errors } = await partyClient(page, { rooms: [publicRoom] })
  let server!: WebSocketRoute
  await page.routeWebSocket('**/api/pixel/**', socket => {
    server = socket
    socket.send(JSON.stringify(snapshot('playing')))
  })
  await page.goto(`${origin}/r/M9K2`)
  await expect(page.getByTestId('pixel-canvas')).toBeVisible()

  // The judge read the answer off painted letters: it guessed exactly, but it cannot count.
  server.send(JSON.stringify({ t: 'judgement', zone: 'all', guesses: ['sun'], confidence: 1, matched: false, text: true }))
  const notice = page.getByTestId('guess-text-notice')
  await expect(notice).toContainText('Haiku spotted letters — no spelling, draw it!')
  await expect(page.getByTestId('round-overlay')).toHaveCount(0)
  await expect(page.getByTestId('round-word')).toHaveText(/sun/i)

  // The drawn answer, with no letters, does end the round.
  server.send(JSON.stringify({ t: 'judgement', zone: 'all', guesses: ['sun'], confidence: 0.9, matched: true }))
  server.send(JSON.stringify({ t: 'round', round: { ...snapshot('playing').round, state: 'intermission', endsAt: null, endedAt: Date.now(), result: { outcome: 'won', contributorCount: 1 } } }))
  await expect(page.getByTestId('round-overlay')).toContainText('Haiku Guessed It!')
  await expect(page.getByTestId('overlay-word')).toHaveText('sun')
  expect(errors).toEqual([])
})
