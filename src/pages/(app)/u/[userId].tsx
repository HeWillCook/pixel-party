import { Link, useParams } from 'react-router-dom'
import { useAuthProfileReady, useQuery } from 'deepspace'
import { PixelMedal } from '../../../components/daily/PixelMedals'
import { PixelThumb } from '../../../components/daily/PixelThumb'
import { GalleryBackdrop } from '../../../components/gallery/GalleryBackdrop'
import '../../../components/gallery/gallery.css'

interface Drawing {
  day: string
  userId: string
  displayName?: string
  prompt?: string
  cells: string
  score: number
  guess?: string
}

interface Score {
  day: string
  userId: string
  displayName?: string
  medal?: number
}

export default function ProfilePage() {
  const { userId = '' } = useParams()
  const { user } = useAuthProfileReady({ requireUser: false })
  const { records: drawings, status } = useQuery<Drawing>('dailyDrawings', {
    where: { userId },
    orderBy: 'day',
    orderDir: 'desc',
    limit: 1000,
  })
  const { records: scores } = useQuery<Score>('dailyScores', { where: { userId }, limit: 1000 })

  const isOwner = Boolean(user?.id && user.id === userId)
  const resolvedName =
    drawings.find((record) => record.data?.displayName)?.data.displayName ||
    scores.find((record) => record.data?.displayName)?.data.displayName
  const heading = isOwner
    ? 'Your gallery'
    : resolvedName
      ? `${resolvedName}'s gallery`
      : 'Gallery'

  const byDay = new Map<string, Drawing>()
  for (const record of drawings) {
    const item = record.data
    if (!item || typeof item.day !== 'string' || typeof item.cells !== 'string' || !item.cells.length) continue
    if (item.userId && item.userId !== userId) continue
    const guess = (item.guess ?? '').trim()
    if (item.score <= 0 && !guess.length) continue
    const existing = byDay.get(item.day)
    if (!existing || item.score > existing.score) {
      byDay.set(item.day, item)
    }
  }
  const galleryItems = Array.from(byDay.values()).sort((a, b) => b.day.localeCompare(a.day))

  const medalByDay = new Map<string, number>()
  for (const { data } of scores) {
    if (!data?.day || !data.medal || data.medal < 1 || data.medal > 3) continue
    const existing = medalByDay.get(data.day)
    if (existing == null || data.medal < existing) {
      medalByDay.set(data.day, data.medal)
    }
  }

  return (
    <div className="gallery-page" data-testid="gallery-page">
      <GalleryBackdrop />
      <div className="gallery-stage">
        <header className="gallery-header">
          <h1 className="gallery-title">{heading}</h1>
          <Link to="/home" className="pp-chip inline-flex min-h-[44px] items-center px-3 py-1.5 text-lg">
            Daily challenge →
          </Link>
        </header>

        {status === 'loading' ? (
          <div className="pp-wood-panel p-6 text-lg" role="status">Hanging paintings…</div>
        ) : status === 'error' ? (
          <div className="pp-wood-panel p-6 text-lg" role="alert">Couldn&apos;t load gallery. Try again soon.</div>
        ) : galleryItems.length === 0 ? (
          <div className="gallery-empty-wrap">
            <article className="gallery-card" data-testid="gallery-empty">
              <div className="gallery-hanger" aria-hidden="true" />
              <div className="gallery-frame gallery-frame--wood">
                <div className="gallery-empty-canvas">
                  <span>Empty wall frame</span>
                </div>
              </div>
              <div className="gallery-plaque">
                <p className="gallery-plaque__prompt">No drawings to show yet.</p>
                <Link
                  to="/home"
                  className="pp-btn mt-1 inline-flex min-h-[44px] items-center justify-center px-4 py-1 text-lg"
                >
                  Paint today&apos;s prompt
                </Link>
              </div>
            </article>
          </div>
        ) : (
          <div className="gallery-wall" data-testid="gallery-wall">
            {galleryItems.map((drawing) => {
              const medal = medalByDay.get(drawing.day) ?? 0
              const hasMedal = medal > 0 && medal <= 3
              const frameKind = hasMedal ? 'gilt' : 'wood'
              const medalName = hasMedal ? (['Gold', 'Silver', 'Bronze'][medal - 1] ?? '') : ''
              return (
                <article
                  key={drawing.day}
                  className="gallery-card"
                  data-testid={`gallery-frame-${drawing.day}`}
                  data-frame-kind={frameKind}
                >
                  <div className="gallery-hanger" aria-hidden="true" />
                  <div className={`gallery-frame gallery-frame--${frameKind}`}>
                    <PixelThumb
                      cells={drawing.cells}
                      scale="scene"
                      multiplier={2}
                      className="gallery-frame__thumb"
                    />
                  </div>
                  <div className="gallery-plaque">
                    <div className="gallery-plaque__top">
                      <h2 className="gallery-plaque__prompt">{drawing.prompt || 'Daily painting'}</h2>
                      {hasMedal && (
                        <span className="gallery-plaque__medal-wrap">
                          <PixelMedal
                            medal={medal as 1 | 2 | 3}
                            scale="scene"
                            label={`${medalName} medal`}
                            className="gallery-plaque__medal"
                          />
                          <span className="gallery-plaque__rank">#{medal} {medalName}</span>
                        </span>
                      )}
                    </div>
                    <p className="gallery-plaque__meta">
                      {drawing.day} · {drawing.score} / 1000
                    </p>
                    <p className="gallery-plaque__guess">
                      Haiku guessed: {drawing.guess?.trim() || 'No guess'}
                    </p>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
