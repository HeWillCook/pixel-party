import { isEnded, type AttemptRow } from '../game/daily/attempt'
import { promptForDay } from '../game/daily/prompts'
import { encodeCells } from '../game/grid'
import type { ServerTools } from './server-tools'

async function upsert(tools: ServerTools, collection: string, row: AttemptRow, data: Record<string, unknown>, defaults: Record<string, unknown>): Promise<void> {
  const found = await tools.query(collection, { where: { day: row.day, userId: row.userId }, limit: 1 })
  if (!found.success) throw new Error(found.error)
  const record = found.data.records[0]
  const result = record
    ? await tools.update(collection, record.recordId, data)
    : await tools.create(collection, { ...defaults, ...data, day: row.day, userId: row.userId })
  if (!result.success) throw new Error(result.error)
}

export function attemptPublisher(read: (userId: string, day: string) => Promise<AttemptRow | null>, tools: ServerTools) {
  const locks = new Map<string, Promise<void>>()
  return async (userId: string, day: string, now: number): Promise<void> => {
    const key = JSON.stringify([day, userId])
    const previous = locks.get(key) ?? Promise.resolve()
    const publishing = previous.catch(() => {}).then(async () => {
      const row = await read(userId, day)
      if (!row) return
      const best = row.bestGrade
      await upsert(tools, 'dailyScores', row, {
        displayName: row.profile?.name ?? 'Player', avatarUrl: row.profile?.image ?? '',
        score: row.bestScore, fit: best?.grade.fit ?? 0, recognition: best?.grade.recognition ?? 0,
        speed: best?.grade.speed ?? 0, bestElapsedMs: row.bestElapsedMs ?? 0, ended: Number(isEnded(row, now)),
      }, { medal: 0 })
      await upsert(tools, 'dailyDrawings', row, {
        displayName: row.profile?.name ?? 'Player', prompt: promptForDay(day).prompt,
        cells: best?.cells ?? row.lastCells ?? encodeCells(new Uint8Array(1024)),
        guess: best?.grade.guess ?? '', reason: best?.grade.reason ?? '', score: row.bestScore,
      }, { visibility: 'private' })
    })
    locks.set(key, publishing)
    try {
      await publishing
    } finally {
      if (locks.get(key) === publishing) locks.delete(key)
    }
  }
}

// TEMP DEBUG: remove before launch
export async function resetAttemptRecords(tools: ServerTools, userId: string, day: string): Promise<void> {
  const emptyCells = encodeCells(new Uint8Array(1024))
  const scores = await tools.query('dailyScores', { where: { day, userId }, limit: 1 })
  if (!scores.success) throw new Error(scores.error)
  const scoreRecord = scores.data.records[0]
  if (scoreRecord) {
    const res = await tools.update('dailyScores', scoreRecord.recordId, {
      score: 0, fit: 0, recognition: 0, speed: 0, bestElapsedMs: 0, ended: 0, medal: 0,
    })
    if (!res.success) throw new Error(res.error)
  }
  const drawings = await tools.query('dailyDrawings', { where: { day, userId }, limit: 1 })
  if (!drawings.success) throw new Error(drawings.error)
  const drawingRecord = drawings.data.records[0]
  if (drawingRecord) {
    const res = await tools.update('dailyDrawings', drawingRecord.recordId, {
      cells: emptyCells, guess: '', reason: '', score: 0, visibility: 'private',
    })
    if (!res.success) throw new Error(res.error)
  }
}
