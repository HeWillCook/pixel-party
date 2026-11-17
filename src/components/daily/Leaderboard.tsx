import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAuthToken, useQuery } from 'deepspace'
import { Trophy } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage, Button } from '../ui'
import { rankScores } from '../../game/daily/rank'
import { PixelThumb } from './PixelThumb'

interface Score {
  day: string
  userId: string
  displayName: string
  avatarUrl: string
  score: number
  bestElapsedMs: number | null
  medal: number
}

interface Drawing { userId: string; cells: string }

export function Leaderboard({ day, ended }: { day: string; ended: boolean }) {
  const [offset, setOffset] = useState(0)
  const [drawings, setDrawings] = useState<{ day: string; items: Drawing[] }>({ day: '', items: [] })
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - offset)
  const selectedDay = Number.isNaN(date.getTime()) ? day : date.toISOString().slice(0, 10)
  const { records, status } = useQuery<Score>('dailyScores', { where: { day: selectedDay }, limit: 1000 })

  useEffect(() => {
    if (!ended || offset !== 0) return
    const controller = new AbortController()
    async function loadDrawings() {
      try {
        const token = await getAuthToken()
        if (!token) return
        const response = await fetch('/api/daily/today/drawings', {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        })
        if (!response.ok) return
        const result: { drawings: { data: Drawing }[] } = await response.json()
        if (!controller.signal.aborted) setDrawings({ day, items: result.drawings.map((record) => record.data) })
      } catch {
        if (!controller.signal.aborted) setDrawings({ day, items: [] })
      }
    }
    void loadDrawings()
    return () => controller.abort()
  }, [day, ended, offset])

  const scores = records.map((record) => record.data)
  const ranks = rankScores(scores)
  const sorted = ranks.map(({ userId, rank }) => ({ score: scores.find((row) => row.userId === userId)!, rank }))
  return (
    <section className="arcade-card flex flex-col gap-4 rounded-xl bg-card p-5" data-testid="daily-leaderboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-pixel text-base font-extrabold uppercase tracking-wider"><Trophy className="h-4 w-4 text-amber-400" aria-hidden /> Leaderboard</h2>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setOffset((value) => value + 1)} aria-label="Previous day">←</Button>
          <span className="text-xs text-muted-foreground">{offset === 0 ? 'Today' : selectedDay}</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOffset((value) => Math.max(0, value - 1))} disabled={offset === 0} aria-label="Next day">→</Button>
        </div>
      </div>
      {offset === 0 && <p className="text-xs text-muted-foreground">Live rankings so far</p>}
      {status === 'loading' ? <p className="text-xs text-muted-foreground">Loading scores…</p> : sorted.length === 0 ? <p className="text-xs text-muted-foreground">No scores yet.</p> : (
        <ol className="space-y-2">
          {sorted.map(({ score, rank }) => {
            const drawing = ended && offset === 0 && drawings.day === day ? drawings.items.find((item) => item.userId === score.userId) : undefined
            const medal = offset === 0 ? (rank <= 3 ? rank : 0) : score.medal
            return <li key={score.userId} className="flex items-center gap-3 rounded-lg bg-secondary/40 p-2">
              <span className="w-6 text-center text-sm font-bold">{rank}</span>
              <Avatar><AvatarImage src={score.avatarUrl || undefined} /><AvatarFallback>{score.displayName?.slice(0, 1) || '?'}</AvatarFallback></Avatar>
              {drawing && <PixelThumb cells={drawing.cells} size={40} />}
              <Link className="min-w-0 flex-1 truncate font-bold hover:underline" to={`/u/${encodeURIComponent(score.userId)}`}>{score.displayName || 'Player'}</Link>
              {medal > 0 && medal <= 3 && <span aria-label={`${['Gold', 'Silver', 'Bronze'][medal - 1]} medal${offset === 0 ? ' so far' : ''}`}>{['🥇', '🥈', '🥉'][medal - 1]}</span>}
              <span className="text-sm font-bold">{score.score}<span className="text-muted-foreground"> / 1000</span></span>
            </li>
          })}
        </ol>
      )}
    </section>
  )
}
