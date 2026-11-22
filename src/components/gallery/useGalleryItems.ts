import { useEffect, useMemo, useState } from 'react'
import { getAuthToken, useAuthProfileReady, useQuery } from 'deepspace'
import { useDaily } from '../../hooks/DailyAttemptProvider'
import { useLoadTimeout, useQueryRetry } from '../../hooks/useLoadGuard'
import { useUsername } from '../../hooks/useProfile'

export interface WallItem {
  day: string
  /** The painting's title: the prompt it was painted to (an older record without one is a "Daily painting"; the prompt list never ships to the client). */
  prompt: string
  cells: string
  score: number
  guess?: string
  /** 1-3 for a podium finish that day, else 0. */
  medal: number
  /**
   * Set on the one frame that stands in for today's painting when the owner finished today's Daily but the viewer has not: the
   * painting itself stays hidden until they do, so the wall says what is waiting rather than looking as if nothing was painted.
   */
  pending?: { name: string | null }
}

interface Drawing { day: string; userId: string; displayName?: string; prompt?: string; cells: string; score: number; guess?: string }
interface Score { day: string; userId: string; displayName?: string; medal?: number; ended?: number }

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** A wall frame only holds a drawing with a day, some cells and a grade (or at least a guess). */
function usable(item: Drawing | undefined | null, userId: string): item is Drawing {
  if (!item || typeof item.day !== 'string' || !DAY_PATTERN.test(item.day)) return false
  if (typeof item.cells !== 'string' || !item.cells.length) return false
  if (item.userId && item.userId !== userId) return false
  return item.score > 0 || (item.guess ?? '').trim().length > 0
}

/**
 * A player's paintings for the wall, newest first, one per day (their best), with each day's medal. `enabled: false` asks
 * for nothing (the porch reads its own wall only once it is idle, so the first paint never waits on a thousand drawings).
 *
 * Other players' paintings are public only once their day closes, so another player's wall takes today's painting from the
 * gated `GET /api/daily/today/drawings` instead: it answers only when the viewer's own attempt has ended, and it is asked for
 * only once the wall's owner's score row says they ended too. Until the viewer finishes their own Daily the frame is a
 * placeholder that says so. The owner's `dailyScores` rows arrive live, so the moment they end their attempt the wall fills in
 * without a reload.
 */
export function useGalleryItems(userId: string, enabled = true) {
  const who = enabled && userId ? userId : '__none__'
  const { attempt, limit, retry } = useQueryRetry()
  const { records: drawings, status: queryStatus } = useQuery<Drawing>('dailyDrawings', { where: { userId: who }, orderBy: 'day', orderDir: 'desc', limit })
  const { records: scores } = useQuery<Score>('dailyScores', { where: { userId: who }, limit })
  // The player's chosen Pixle name outranks the name copied onto old score rows.
  const username = useUsername(enabled ? userId : null)
  const { user } = useAuthProfileReady({ requireUser: false })
  const { state: daily } = useDaily()
  const today = new Date().toISOString().slice(0, 10)
  const isOwner = Boolean(enabled && userId && user?.id === userId)
  // "Finished today's Daily" is the same test the server's gate uses: an attempt for today that has ended.
  const viewerFinishedToday = daily.day === today && daily.status === 'ended'
  const ownerFinishedToday = !isOwner && Boolean(userId) && scores.some(({ data }) => data?.day === today && data.ended === 1)
  const gatedKey = `${userId}|${today}`
  const wantsGated = enabled && Boolean(userId) && !isOwner && viewerFinishedToday && ownerFinishedToday

  // Today's painting, taken from the gated route once both ended. Re-asked whenever the owner's row flips to ended (the live
  // score query), whenever the viewer finishes their own Daily (`useDaily`), and on Retry.
  const [gated, setGated] = useState<{ key: string; drawing: Drawing | null } | null>(null)
  useEffect(() => {
    if (!wantsGated) return
    const controller = new AbortController()
    let live = true
    void (async () => {
      let drawing: Drawing | null = null
      try {
        const token = await getAuthToken()
        if (!token || !live) return
        const response = await fetch(`/api/daily/today/drawings?userId=${encodeURIComponent(userId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (response.ok) {
          const result: { drawings?: { data: Drawing }[] } = await response.json()
          const found = Array.isArray(result.drawings)
            ? result.drawings.map(record => record?.data).find(item => usable(item, userId) && (!item.day || item.day === today))
            : null
          drawing = found ?? null
        }
      } catch {
        drawing = null
      }
      if (live) setGated({ key: gatedKey, drawing })
    })()
    return () => { live = false; controller.abort() }
  }, [wantsGated, gatedKey, userId, today, attempt])

  const gatedDrawing = gated?.key === gatedKey ? gated.drawing : null
  // A wall waiting only on today's painting (an owner who just ended, an otherwise empty wall) is loading, not empty; the
  // guard below turns a gate that never answers into the error card with a Retry.
  const waitingOnGate = wantsGated && gated?.key !== gatedKey
  // A wall that never answers becomes the error card (with a Retry) rather than "Hanging paintings…" for ever; a wall not asked for just waits.
  const guarded = useLoadTimeout(enabled ? (waitingOnGate ? 'loading' : queryStatus) : 'ready', attempt)
  const status = enabled ? guarded : 'loading'

  const items = useMemo(() => {
    const byDay = new Map<string, Drawing>()
    for (const record of drawings) {
      const item = record.data
      if (!usable(item, userId)) continue
      const existing = byDay.get(item.day)
      if (!existing || item.score > existing.score) byDay.set(item.day, item)
    }
    if (gatedDrawing) byDay.set(gatedDrawing.day, gatedDrawing)
    const medals = new Map<string, number>()
    for (const { data } of scores) {
      if (!data?.day || !data.medal || data.medal < 1 || data.medal > 3) continue
      const existing = medals.get(data.day)
      if (existing == null || data.medal < existing) medals.set(data.day, data.medal)
    }
    const shown: WallItem[] = Array.from(byDay.values()).sort((a, b) => b.day.localeCompare(a.day)).map((item) => ({
      day: item.day, prompt: item.prompt?.trim() || 'Daily painting', cells: item.cells, score: item.score, guess: item.guess, medal: medals.get(item.day) ?? 0,
    }))
    // Their painting is here, but its day has not closed and this wall's viewer has not finished their own: a frame that says
    // so, in today's place, instead of a wall that looks empty.
    const waiting = !isOwner && Boolean(userId) && ownerFinishedToday && !viewerFinishedToday && !byDay.has(today)
    if (waiting) shown.unshift({ day: today, prompt: "Today's Daily", cells: '', score: 0, medal: 0, pending: { name: username } })
    return shown
  }, [drawings, scores, gatedDrawing, username, isOwner, userId, ownerFinishedToday, viewerFinishedToday, today])

  const name = username || drawings.find((record) => record.data?.displayName)?.data.displayName || scores.find((record) => record.data?.displayName)?.data.displayName
  return { items, status, name, retry, isOwner }
}
