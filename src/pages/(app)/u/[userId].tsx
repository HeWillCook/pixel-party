import { useParams } from 'react-router-dom'
import { useQuery } from 'deepspace'
import { PixelThumb } from '../../../components/daily/PixelThumb'

interface Drawing {
  day: string
  userId: string
  displayName: string
  prompt: string
  cells: string
  score: number
  guess: string
}

interface Score { day: string; userId: string; displayName: string; medal: number }

export default function ProfilePage() {
  const { userId = '' } = useParams()
  const { records: drawings, status } = useQuery<Drawing>('dailyDrawings', { where: { userId }, orderBy: 'day', orderDir: 'desc', limit: 1000 })
  const { records: scores } = useQuery<Score>('dailyScores', { where: { userId }, limit: 1000 })
  const name = drawings[0]?.data.displayName || scores[0]?.data.displayName || 'Player'
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-5 sm:p-8">
      <h1 className="font-pixel text-2xl font-extrabold uppercase">{name}&apos;s Gallery</h1>
      {status === 'loading' ? <p className="text-muted-foreground">Loading drawings…</p> : drawings.length === 0 ? <p className="text-muted-foreground">No drawings to show yet.</p> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {drawings.map(({ data: drawing }) => {
            const medal = scores.find(({ data }) => data.day === drawing.day)?.data.medal ?? 0
            return <article key={drawing.day} className="arcade-card flex flex-col gap-3 rounded-xl bg-card p-4">
              <PixelThumb cells={drawing.cells} size={160} />
              <div className="flex items-center justify-between gap-2"><h2 className="font-bold">{drawing.prompt}</h2>{medal > 0 && medal <= 3 && <span aria-label={`${['Gold', 'Silver', 'Bronze'][medal - 1]} medal`}>{['🥇', '🥈', '🥉'][medal - 1]}</span>}</div>
              <p className="text-xs text-muted-foreground">{drawing.day} · {drawing.score} / 1000</p>
              <p className="text-sm">Haiku guessed: {drawing.guess || 'No guess'}</p>
            </article>
          })}
        </div>
      )}
    </div>
  )
}
