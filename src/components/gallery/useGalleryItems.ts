import { useMemo } from 'react'
import { useQuery } from 'deepspace'

export interface WallItem {
  day: string
  /** The painting's title: the prompt it was painted to (an older record without one is a "Daily painting"; the prompt list never ships to the client). */
  prompt: string
  cells: string
  score: number
  guess?: string
  /** 1-3 for a podium finish that day, else 0. */
  medal: number
}

interface Drawing { day: string; userId: string; displayName?: string; prompt?: string; cells: string; score: number; guess?: string }
interface Score { day: string; userId: string; displayName?: string; medal?: number }

/**
 * A player's paintings for the wall, newest first, one per day (their best), with each day's medal. `enabled: false` asks
 * for nothing (the porch reads its own wall only once it is idle, so the first paint never waits on a thousand drawings).
 */
export function useGalleryItems(userId: string, enabled = true) {
  const who = enabled && userId ? userId : '__none__'
  const { records: drawings, status } = useQuery<Drawing>('dailyDrawings', { where: { userId: who }, orderBy: 'day', orderDir: 'desc', limit: 1000 })
  const { records: scores } = useQuery<Score>('dailyScores', { where: { userId: who }, limit: 1000 })
  return useMemo(() => {
    const byDay = new Map<string, Drawing>()
    for (const record of drawings) {
      const item = record.data
      if (!item || typeof item.day !== 'string' || typeof item.cells !== 'string' || !item.cells.length) continue
      if (item.userId && item.userId !== userId) continue
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.day)) continue
      if (item.score <= 0 && !(item.guess ?? '').trim().length) continue
      const existing = byDay.get(item.day)
      if (!existing || item.score > existing.score) byDay.set(item.day, item)
    }
    const medals = new Map<string, number>()
    for (const { data } of scores) {
      if (!data?.day || !data.medal || data.medal < 1 || data.medal > 3) continue
      const existing = medals.get(data.day)
      if (existing == null || data.medal < existing) medals.set(data.day, data.medal)
    }
    const items: WallItem[] = Array.from(byDay.values()).sort((a, b) => b.day.localeCompare(a.day)).map((item) => ({
      day: item.day, prompt: item.prompt?.trim() || 'Daily painting', cells: item.cells, score: item.score, guess: item.guess, medal: medals.get(item.day) ?? 0,
    }))
    const name = drawings.find((record) => record.data?.displayName)?.data.displayName || scores.find((record) => record.data?.displayName)?.data.displayName
    return { items, status: enabled ? status : 'loading', name }
  }, [drawings, scores, status, userId, enabled])
}
