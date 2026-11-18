import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAuthToken, useQuery } from 'deepspace'
import { rankScores } from '../../game/daily/rank'
import { Haiku } from '../haiku/Haiku'
import { BoosterSprite } from '../play/BoosterSprite'
import { Avatar, AvatarFallback, AvatarImage } from '../ui'
import { PixelMedal, PixelTrophy } from './PixelMedals'
import { PixelThumb } from './PixelThumb'
import '../scores/scores.css'

interface Score {
  day?: string
  userId: string
  displayName?: string
  avatarUrl?: string
  score: number
  bestElapsedMs: number | null
  medal?: number
  guess?: string
}

interface Drawing {
  day?: string
  userId: string
  cells?: string
  guess?: string
}

export function Leaderboard({ day, ended }: { day: string; ended: boolean }) {
  const [offset, setOffset] = useState(0)
  const [drawings, setDrawings] = useState<{ day: string; items: Drawing[] }>({ day: '', items: [] })
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - offset)
  const selectedDay = Number.isNaN(date.getTime()) ? day : date.toISOString().slice(0, 10)
  const { records, status } = useQuery<Score>('dailyScores', { where: { day: selectedDay }, limit: 1000 })
  const { records: drawingRecords } = useQuery<Drawing>('dailyDrawings', { where: { day: selectedDay }, limit: 1000 })

  useEffect(() => {
    if (!ended || offset !== 0) return
    const controller = new AbortController()
    async function loadDrawings() {
      try {
        const token = await getAuthToken()
        if (!token) return
        const response = await fetch('/api/daily/today/drawings', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (!response.ok) return
        const result: { drawings?: { data: Drawing }[] } = await response.json()
        if (!controller.signal.aborted && Array.isArray(result.drawings)) {
          setDrawings({ day, items: result.drawings.map((record) => record.data) })
        }
      } catch {
        if (!controller.signal.aborted) setDrawings({ day, items: [] })
      }
    }
    void loadDrawings()
    return () => controller.abort()
  }, [day, ended, offset])

  const showDrawings = (ended && offset === 0) || offset > 0

  const drawingByUser = new Map<string, Drawing>()
  for (const record of drawingRecords) {
    const item = record.data
    if (!item || typeof item.userId !== 'string') continue
    if (item.day && item.day !== selectedDay) continue
    const hasCells = typeof item.cells === 'string' && item.cells.length > 0
    const hasGuess = typeof item.guess === 'string'
    if (!hasCells && !hasGuess) continue
    drawingByUser.set(item.userId, item)
  }
  if (ended && offset === 0 && drawings.day === day) {
    for (const item of drawings.items) {
      if (item && typeof item.userId === 'string') {
        drawingByUser.set(item.userId, { ...drawingByUser.get(item.userId), ...item })
      }
    }
  }

  const dedupedScores = new Map<string, Score>()
  for (const record of records) {
    const row = record.data
    if (!row || typeof row.userId !== 'string' || typeof row.score !== 'number') continue
    if (row.day && row.day !== selectedDay) continue
    const existing = dedupedScores.get(row.userId)
    if (!existing || row.score > existing.score) {
      dedupedScores.set(row.userId, row)
    }
  }

  const gradedScores = Array.from(dedupedScores.values()).filter((row) => {
    const guess = (typeof row.guess === 'string' ? row.guess : (drawingByUser.get(row.userId)?.guess ?? '')).trim()
    return row.score > 0 || guess.length > 0
  })

  const ranks = rankScores(gradedScores)
  const sorted = ranks.map(({ userId, rank }) => ({
    score: gradedScores.find((row) => row.userId === userId)!,
    rank,
  }))

  const topEntry = sorted[0]
  const topName = topEntry?.score.displayName || 'Player'
  const topGuess = topEntry
    ? (typeof topEntry.score.guess === 'string'
        ? topEntry.score.guess
        : (drawingByUser.get(topEntry.score.userId)?.guess ?? '')
      ).trim()
    : ''

  const haikuComment = !topEntry
    ? 'No graded paintings yet — grab a brush on the porch!'
    : showDrawings && topGuess
      ? offset === 0
        ? `Haiku's favourite today: "${topGuess}" by ${topName} (${topEntry.score.score})`
        : `Haiku's favourite (${selectedDay}): "${topGuess}" by ${topName}`
      : offset === 0
        ? `Haiku's favourite today: ${topName} leads at ${topEntry.score.score}!`
        : `Haiku's favourite (${selectedDay}): ${topName} (${topEntry.score.score})`

  return (
    <div className="scores-board-wrap" data-testid="daily-leaderboard">
      <section className="scores-chalkboard" data-testid="scores-chalkboard" aria-labelledby="scores-heading">
        <div className="scores-board-header">
          <h1 id="scores-heading" className="scores-board-title">
            <PixelTrophy scale={2} />
            <span>Scores</span>
          </h1>
          <div className="scores-pager">
            <button
              type="button"
              className="scores-arrow"
              onClick={() => setOffset((value) => value + 1)}
              aria-label="Previous day"
            >
              ←
            </button>
            <span className="scores-day-label">{offset === 0 ? 'Today' : selectedDay}</span>
            <button
              type="button"
              className="scores-arrow"
              onClick={() => setOffset((value) => Math.max(0, value - 1))}
              disabled={offset === 0}
              aria-label="Next day"
            >
              →
            </button>
          </div>
        </div>

        <p className="scores-subtitle">
          {offset === 0
            ? ended
              ? 'Final standings · tap a painter to visit their gallery'
              : 'Live rankings so far · paintings reveal at day end'
            : `Standings for ${selectedDay}`}
        </p>

        {status === 'loading' ? (
          <p className="scores-status">Loading scores…</p>
        ) : sorted.length === 0 ? (
          <p className="scores-status">No graded scores yet.</p>
        ) : (
          <ol className="scores-list">
            {sorted.map(({ score, rank }) => {
              const drawing = showDrawings ? drawingByUser.get(score.userId) : undefined
              const hasCells = typeof drawing?.cells === 'string' && drawing.cells.length > 0
              const medal = offset === 0 ? (rank <= 3 ? rank : 0) : (score.medal ?? 0)
              return (
                <li
                  key={score.userId}
                  className={`scores-row ${rank <= 3 ? 'scores-row--top' : ''}`.trim()}
                >
                  <span className="scores-rank">{rank}</span>
                  {hasCells && drawing?.cells ? (
                    <PixelThumb cells={drawing.cells} size={32} className="scores-thumb" />
                  ) : null}
                  <Avatar className="scores-avatar">
                    <AvatarImage src={score.avatarUrl || undefined} />
                    <AvatarFallback className="bg-[#34516a] text-[#fff0cc]">
                      {score.displayName?.slice(0, 1) || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <Link
                    className="scores-row-link"
                    to={`/u/${encodeURIComponent(score.userId)}`}
                  >
                    {score.displayName || 'Player'}
                  </Link>
                  {medal > 0 && medal <= 3 && (
                    <PixelMedal
                      medal={medal as 1 | 2 | 3}
                      label={`${['Gold', 'Silver', 'Bronze'][medal - 1]} medal${offset === 0 && !ended ? ' so far' : ''}`}
                      className="scores-medal"
                    />
                  )}
                  <span className="scores-points">
                    {score.score}
                    <span className="scores-points-max"> / 1000</span>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <div className="scores-ledge" data-testid="scores-ledge">
        <Haiku
          state={topEntry ? 'guess' : 'idle'}
          scale={2}
          bubble={haikuComment}
          className="scores-ledge__haiku"
          data-testid="scores-haiku"
        />
        <div className="scores-ledge__props" aria-hidden="true">
          <span className="scores-chalk-stick" />
          <span className="scores-chalk-stick scores-chalk-stick--warm" />
          <span className="scores-eraser" />
        </div>
      </div>

      <div className="scores-boosters" data-testid="scores-boosters" aria-hidden="true">
        <BoosterSprite scale={3} phaseOffset={0} />
        <BoosterSprite scale={3} phaseOffset={2} />
        <BoosterSprite scale={3} phaseOffset={4} />
      </div>
    </div>
  )
}
