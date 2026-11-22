// DEV ONLY (__DEBUG_TOOLS__)
// Fills a signed-in player's gallery wall with generated paintings so a full wall can be tested without painting dozens.
// They are ordinary dailyDrawings + dailyScores rows (the rows the wall reads), tagged so they can be cleared again.
import { promptForDay } from '../game/daily/prompts'
import { encodeCells } from '../game/grid'
import { utcDay } from './room-time'
import type { ServerTools } from './server-tools'

const DEBUG_REASON = '[debug painting]'
const DEBUG_AVATAR = 'debug:painting'
export const MAX_DEBUG_PAINTINGS = 100
const GUESSES = ['a cozy scene', 'a sleepy landscape', 'a bright little town', 'something with hills', 'a sunset by the water', 'a friendly shape']

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A varied 32x32 picture from a seed: banded sky, a sun or moon, two rolling hills and a few trees or stars. */
export function debugCells(seed: number): Uint8Array {
  const rand = random(seed)
  const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)]
  const cells = new Uint8Array(1024)
  const sky = pick([[10, 9], [12, 11], [5, 6], [13, 12], [11, 1]])
  const [hillA, hillB] = pick([[7, 8], [8, 14], [3, 2], [15, 5]])
  const sun = pick([6, 15, 4, 16])
  const sunX = 4 + Math.floor(rand() * 24), sunY = 3 + Math.floor(rand() * 8), sunR = 2 + Math.floor(rand() * 3)
  const phaseA = rand() * 6, phaseB = rand() * 6, amp = 2 + rand() * 3
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let colour = y < 12 ? sky[1] : sky[0]
    if ((x - sunX) ** 2 + (y - sunY) ** 2 <= sunR * sunR) colour = sun
    else if (rand() < 0.02 && y < 14) colour = 16
    if (y > 18 + Math.sin(x / 5 + phaseA) * amp) colour = hillA
    if (y > 24 + Math.sin(x / 4 + phaseB) * (amp - 1)) colour = hillB
    cells[y * 32 + x] = colour
  }
  for (let tree = 0; tree < 2 + Math.floor(rand() * 3); tree++) {
    const x = 2 + Math.floor(rand() * 28), y = 17 + Math.floor(rand() * 9)
    cells[y * 32 + x] = 14; cells[(y - 1) * 32 + x] = 14
    for (const [dx, dy] of [[0, -2], [-1, -2], [1, -2], [0, -3]]) cells[(y + dy) * 32 + x + dx] = 8
  }
  return cells
}

function must<T>(result: { success: true; data: T } | { success: false; error: string }): T {
  if (!result.success) throw new Error(result.error)
  return result.data
}

/** Adds `count` paintings on days the player has no drawing for, walking back from yesterday. Returns how many were made. */
export async function addDebugPaintings(tools: ServerTools, user: { userId: string; name: string }, count: number, now: number): Promise<number> {
  const wanted = Math.max(0, Math.min(MAX_DEBUG_PAINTINGS, Math.floor(count)))
  const taken = new Set(must(await tools.query('dailyDrawings', { where: { userId: user.userId }, limit: 1000 })).records.map(record => String(record.data.day)))
  const days: string[] = []
  for (let back = 1; days.length < wanted && back < 3650; back++) {
    const day = utcDay(now - back * 86_400_000)
    if (!taken.has(day)) days.push(day)
  }
  const make = async (day: string) => {
    const seed = Date.parse(`${day}T00:00:00Z`) / 86_400_000
    const rand = random(seed)
    const score = 250 + Math.floor(rand() * 700)
    const matchPoints = Math.round(score * 0.5), qualityBonus = score - matchPoints
    const match = 55 + Math.floor(rand() * 41)
    const quality = 50 + Math.floor(rand() * 51)
    const recognition = 40 + Math.floor(rand() * 61)
    must(await tools.create('dailyScores', {
      day, userId: user.userId, displayName: user.name, avatarUrl: DEBUG_AVATAR, score, match, quality, matchPoints, qualityBonus, recognition,
      startedAt: Date.parse(`${day}T00:00:00Z`) + Math.floor(rand() * 86_400_000), ended: 1, medal: 0,
    }))
    must(await tools.create('dailyDrawings', {
      day, userId: user.userId, displayName: user.name, prompt: promptForDay(day).prompt, cells: encodeCells(debugCells(seed)),
      guess: GUESSES[Math.floor(rand() * GUESSES.length)], reason: DEBUG_REASON, score, visibility: 'private',
    }))
  }
  for (let index = 0; index < days.length; index += 10) await Promise.all(days.slice(index, index + 10).map(make))
  return days.length
}

/** Removes only the signed-in player's tagged debug rows. */
export async function clearDebugPaintings(tools: ServerTools, userId: string): Promise<number> {
  let removed = 0
  for (const [collection, where] of [['dailyDrawings', { userId, reason: DEBUG_REASON }], ['dailyScores', { userId, avatarUrl: DEBUG_AVATAR }]] as const) {
    for (;;) {
      const { deleted } = must(await tools.deleteWhere(collection, where, 100))
      if (collection === 'dailyDrawings') removed += deleted
      if (deleted < 100) break
    }
  }
  return removed
}
