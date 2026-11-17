import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as delay } from 'node:timers/promises'

const port = Number(process.argv[2] ?? 5197)
assert(Number.isInteger(port) && port > 0 && port < 65536, 'Pass a valid local dev port')
const base = `http://127.0.0.1:${port}`
const roomId = `task4b-smoke-${Date.now()}`
const clients = []
const evidence = { port, roomId, checks: [], judgements: [] }

function sqliteFiles(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? sqliteFiles(path) : entry.name.endsWith('.sqlite') ? [path] : []
    })
  } catch {
    return []
  }
}

function budgetUsage() {
  const day = new Date().toISOString().slice(0, 10)
  const files = sqliteFiles(resolve('.wrangler')).filter(path => path.toLowerCase().includes('budgetroom') && !path.endsWith('/metadata.sqlite'))
  assert(files.length <= 1, 'Multiple local BudgetRoom databases: use a clean, unambiguous dev state')
  if (!files.length) return { day, used: 0, source: 'no local BudgetRoom database yet' }
  const database = new DatabaseSync(files[0], { readOnly: true })
  try {
    const exists = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'budget'").get()
    const row = exists ? database.prepare('SELECT used FROM budget WHERE day = ?').get(day) : null
    return { day, used: row?.used ?? 0, source: 'read-only local BudgetRoom SQLite', file: files[0] }
  } finally {
    database.close()
  }
}

function connect(token) {
  return new Promise((resolveClient, reject) => {
    const url = new URL(`/api/pixel/${roomId}/ws`, base)
    url.protocol = 'ws:'
    if (token) url.searchParams.set('token', token)
    const connection = new WebSocket(url)
    const messages = []
    const pending = new Set()
    const opened = new Promise((resolveOpen, rejectOpen) => {
      connection.addEventListener('open', resolveOpen, { once: true })
      connection.addEventListener('error', () => rejectOpen(new Error('WebSocket connection failed; credentials omitted')), { once: true })
    })
    const client = {
      connection, messages,
      send: message => connection.send(JSON.stringify(message)),
      wait: (predicate, after = 0, timeout = 45_000) => {
        const found = messages.slice(after).find(predicate)
        if (found) return Promise.resolve(found)
        return new Promise((resolveMessage, rejectMessage) => {
          const waiter = { predicate, resolve: resolveMessage, timer: null }
          waiter.timer = setTimeout(() => { pending.delete(waiter); rejectMessage(new Error('Expected WebSocket message timed out')) }, timeout)
          pending.add(waiter)
        })
      },
      close: async () => {
        if (connection.readyState === WebSocket.CLOSED) return
        const closed = new Promise(resolveClose => connection.addEventListener('close', resolveClose, { once: true }))
        connection.close(1000, 'Smoke complete')
        await Promise.race([closed, delay(3000)])
      },
    }
    clients.push(client)
    connection.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      messages.push(message)
      if (message.t === 'judgement' && token) evidence.judgements.push(message)
      for (const waiter of pending) {
        if (waiter.predicate(message)) {
          clearTimeout(waiter.timer)
          pending.delete(waiter)
          waiter.resolve(message)
        }
      }
    })
    const timer = setTimeout(() => reject(new Error('WebSocket open timed out')), 20_000)
    opened.then(() => { clearTimeout(timer); resolveClient(client) }, error => { clearTimeout(timer); reject(error) })
  })
}

function record(check, details = {}) {
  const result = { check, ...details }
  evidence.checks.push(result)
  console.log(JSON.stringify(result))
}

try {
  const account = JSON.parse(execFileSync('npx', ['deepspace', 'auth', 'whoami', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  assert(account.ok && account.userId, 'The CLI owner login must be active')
  let token = readFileSync(join(homedir(), '.deepspace', 'token'), 'utf8').trim()
  const owner = await connect(token)
  token = null
  const spectator = await connect()
  const snapshot = await owner.wait(message => message.t === 'snapshot')
  const anonymous = await spectator.wait(message => message.t === 'snapshot')
  assert.equal(snapshot.you.userId, account.userId)
  assert.equal(anonymous.you.userId, null)
  assert.equal(anonymous.players, 1)
  record('signed-in and anonymous snapshots', { userId: snapshot.you.userId, anonymousUserId: anonymous.you.userId, players: anonymous.players })

  const before = budgetUsage()
  record('budget before', before)
  const firstPixel = { t: 'place', x: 16, y: 16, c: 6 }
  owner.send(firstPixel)
  owner.send({ ...firstPixel, x: 17 })
  for (const client of [owner, spectator]) {
    const pixel = await client.wait(message => message.t === 'pixel')
    assert.deepEqual(pixel, { t: 'pixel', x: 16, y: 16, c: 6, by: account.userId })
  }
  record('signed-in placement broadcasts to both')
  const cooldown = await owner.wait(message => message.t === 'reject' && message.reason === 'cooldown')
  record('immediate second placement rejected', cooldown)
  for (const command of [{ t: 'place', x: 0, y: 0, c: 1 }, { t: 'ask' }, { t: 'next' }, { t: 'team', team: 'red' }]) {
    const after = spectator.messages.length
    spectator.send(command)
    assert.deepEqual(await spectator.wait(message => message.t === 'reject', after), { t: 'reject', reason: 'not_signed_in' })
  }
  record('anonymous placement, ask, next and team rejected')

  const points = []
  for (let offsetY = -3; offsetY <= 3; offsetY++) {
    for (let offsetX = -3; offsetX <= 3; offsetX++) {
      if (offsetX * offsetX + offsetY * offsetY <= 9 && (offsetX || offsetY)) points.push([16 + offsetX, 16 + offsetY])
    }
  }
  for (const sign of [-1, 1]) {
    for (const distance of [5, 6]) points.push([16 + sign * distance, 16], [16, 16 + sign * distance])
    for (const otherSign of [-1, 1]) points.push([16 + sign * 4, 16 + otherSign * 4])
  }
  for (const [pixelX, pixelY] of points) {
    await delay(225)
    const after = owner.messages.length
    owner.send({ t: 'place', x: pixelX, y: pixelY, c: 6 })
    const response = await owner.wait(message => message.t === 'pixel' || message.t === 'reject', after)
    assert.equal(response.t, 'pixel', `Sun drawing rejected: ${response.reason}`)
  }
  record('filled sun drawn', { pixels: points.length + 1 })
  await delay(Math.max(0, snapshot.round.askAvailableAt - Date.now() + 100))
  const askedAfter = owner.messages.length
  owner.send({ t: 'ask' })
  const judgement = await owner.wait(message => message.t === 'judgement' || message.t === 'ai_resting' || message.t === 'reject', askedAfter)
  assert.equal(judgement.t, 'judgement', `Expected a real Haiku judgement, got ${judgement.t}:${judgement.reason ?? ''}`)
  assert(judgement.guesses.length > 0)
  record('real Haiku judgement after ask', judgement)
  assert.deepEqual(await spectator.wait(message => message.t === 'judgement'), judgement)

  await owner.close()
  const fresh = await connect()
  const paused = await fresh.wait(message => message.t === 'snapshot')
  assert.equal(paused.round.state, 'paused')
  assert.equal(paused.players, 0)
  record('last signed-in disconnect pauses the room', { roundId: paused.round.id, state: paused.round.state, players: paused.players })

  const after = budgetUsage()
  assert.equal(after.day, before.day, 'Smoke crossed UTC midnight; rerun to verify daily budget delta')
  assert.equal(after.used, before.used + 1, 'Exactly one paid judgement should reserve exactly one budget call')
  record('budget after', { ...after, increment: after.used - before.used })
  console.log(JSON.stringify({ status: 'PASS', ...evidence }))
} catch (error) {
  const message = error instanceof assert.AssertionError ? error.message : 'Connection or runtime failure; credentials omitted'
  console.error(JSON.stringify({ status: 'FAIL', ...evidence, error: message }))
  process.exitCode = 1
} finally {
  await Promise.all(clients.map(client => client.close()))
}
