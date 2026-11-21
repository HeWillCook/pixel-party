import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

test.skip(loadAllTestAccounts().length < 2, 'Needs two usable DeepSpace test accounts')

async function color(page: Page, x: number, y: number) {
  return page.getByTestId('pixel-canvas').evaluate((canvas: HTMLCanvasElement, point) =>
    Array.from(canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data), { x, y })
}
async function clickCell(page: Page, x: number, y: number) {
  const canvas = page.getByTestId('pixel-canvas')
  const box = (await canvas.boundingBox())!
  await canvas.click({ position: { x: box.width * (x + 0.5) / 32, y: box.height * (y + 0.5) / 32 } })
}

test('two painters sync, respect cooldown, and allow spectators', async ({ users, page }) => {
  const [a, b] = await users(2)
  const spectatorPlacements: string[] = []
  page.on('websocket', socket => {
    if (socket.url().includes('/api/pixel/')) socket.on('framesent', frame => {
      if (typeof frame.payload === 'string' && JSON.parse(frame.payload).t === 'place') spectatorPlacements.push(frame.payload)
    })
  })
  let confirmed!: () => void
  const firstConfirmed = new Promise<void>(resolve => { confirmed = resolve })
  a.page.on('websocket', socket => {
    if (socket.url().includes('/api/pixel/')) socket.on('framereceived', frame => {
      if (typeof frame.payload === 'string') {
        const message = JSON.parse(frame.payload)
        if (message.t === 'pixel' && message.x === 4 && message.y === 4 && message.c === 4) confirmed()
      }
    })
  })
  await a.page.addInitScript(() => {
    const original = Date.now
    Date.now = () => original() + (Number(sessionStorage.getItem('clockOffset')) || 0)
  })
  await Promise.all([a.page.goto('/r/play'), b.page.goto('/r/play'), page.goto('/r/play')])
  for (const p of [a.page, b.page]) await expect(p.getByTestId('round-players')).toHaveText('2 painters', { timeout: 15000 })
  // The shared board may be new or waiting on results; every start is explicit.
  const start = a.page.getByTestId('host-start-button')
  if (await start.isVisible()) await start.click()
  else if (await a.page.getByRole('button', { name: 'New game', exact: true }).first().isVisible()) await a.page.getByRole('button', { name: 'New game', exact: true }).first().click()
  await expect(page.getByTestId('spectator-banner')).toBeVisible()
  const red = [239, 68, 68, 255]
  await clickCell(a.page, 4, 4)
  await firstConfirmed
  const synced = expect.poll(() => color(b.page, 4, 4), { timeout: 2000 }).toEqual(red)
  // Simulate a fast client clock to exercise authoritative rejection and rollback.
  await a.page.evaluate(() => sessionStorage.setItem('clockOffset', '5000'))
  await clickCell(a.page, 6, 6)
  await expect(a.page.getByTestId('reject-notice')).toContainText('Brush cooling down')
  await synced
  await expect.poll(() => color(page, 4, 4), { timeout: 2000 }).toEqual(red)
  await expect.poll(() => color(a.page, 6, 6)).toEqual([243, 234, 216, 255])
  await expect.poll(() => color(b.page, 6, 6)).toEqual([243, 234, 216, 255])
  const spectatorBefore = await color(page, 5, 5)
  const painterBefore = await color(a.page, 5, 5)
  expect(painterBefore).toEqual(spectatorBefore)
  await clickCell(page, 5, 5)
  await expect(page.getByTestId('spectator-banner')).toBeVisible()
  // A spectator's click places nothing and opens the same sign-in slip as the banner's "Sign in to play".
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible()
  expect(spectatorPlacements).toEqual([])
  await expect.poll(() => color(a.page, 5, 5)).toEqual(painterBefore)
  await expect.poll(() => color(page, 5, 5)).toEqual(spectatorBefore)
})

test('private room invite requires sign-in and admits the invited painter', async ({ users, page }) => {
  // The rooms API suite fills the first account's five-room quota.
  const [b, a] = await users(2)
  await a.page.goto('/party')
  await a.page.getByTestId('create-room-name').fill('Private pixel test')
  await a.page.getByTestId('visibility-private').click()
  await a.page.getByTestId('create-room-submit').click()
  await expect(a.page).toHaveURL(/\/r\/[a-z0-9]+$/i, { timeout: 15000 })
  const invite = a.page.url()
  await page.goto(invite)
  await expect(page.getByTestId('room-error-unauthorized')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('pixel-canvas')).toHaveCount(0)
  await expect(a.page.getByTestId('room-lobby')).toBeVisible()
  await expect(a.page.getByTestId('room-code')).toHaveText(/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}/)
  await expect(a.page.getByTestId('pixel-canvas')).toHaveCount(0)
  await b.page.goto(invite)
  await expect(b.page.getByTestId('round-players')).toHaveText('2 painters', { timeout: 15000 })
  await expect(b.page.getByTestId('host-start-button')).toHaveCount(0)
  await a.page.getByTestId('host-start-button').click()
  await expect(a.page.getByTestId('pixel-canvas')).toBeVisible()
  await expect(b.page.getByTestId('pixel-canvas')).toBeVisible()
})
