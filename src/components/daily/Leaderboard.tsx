import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { getAuthToken, useQuery } from 'deepspace'
import { rankScores } from '../../game/daily/rank'
import { useLoadTimeout, useQueryRetry } from '../../hooks/useLoadGuard'
import { Haiku } from '../haiku/Haiku'
import { isPrimaryClick } from '../porch/returnFlag'
import { Avatar, AvatarFallback, AvatarImage } from '../ui'
import { DrawingViewer, type ViewerDrawing } from './DrawingViewer'
import { PixelMedal, PixelTrophy } from './PixelMedals'
import { PixelThumb } from './PixelThumb'
import { PlayerStatsDialog } from '../stats/PlayerStatsDialog'
import '../scores/scores.css'

interface Score {
  day?: string
  userId: string
  displayName?: string
  avatarUrl?: string
  score: number
  startedAt?: number
  medal?: number
  guess?: string
}

interface Drawing {
  day?: string
  userId: string
  cells?: string
  guess?: string
  reason?: string
}

const MAX_HISTORY_DAYS = 90

function truncateLabel(value: string, maxLength = 24): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`
}

export function Leaderboard({
  day,
  ended,
  onPorch,
  onSelectPainter,
}: {
  day: string
  ended: boolean
  onPorch?: () => void
  onSelectPainter?: (href: string) => void
}) {
  const [offset, setOffset] = useState(0)
  const [drawings, setDrawings] = useState<{ day: string; items: Drawing[] }>({ day: '', items: [] })
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - offset)
  const selectedDay = Number.isNaN(date.getTime()) ? day : date.toISOString().slice(0, 10)
  const { attempt, limit, retry } = useQueryRetry()
  const { records, status: queryStatus } = useQuery<Score>('dailyScores', { where: { day: selectedDay }, limit })
  const { records: drawingRecords } = useQuery<Drawing>('dailyDrawings', { where: { day: selectedDay }, limit })
  // A load that never answers falls back to the error copy (with a Retry) instead of "Loading scores…" for ever.
  const status = useLoadTimeout(queryStatus, attempt)

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

  const gradedByUser = new Map(gradedScores.map((row) => [row.userId, row]))
  const ranks = rankScores(gradedScores)
  const sorted = ranks.map(({ userId, rank }) => ({
    score: gradedByUser.get(userId)!,
    rank,
  }))

  // The full-size viewer walks exactly the rows whose thumbnails the board is showing: the same
  // `showDrawings` gate, so a painting that is still hidden has no thumbnail and nothing to open.
  const viewerDrawings: ViewerDrawing[] = showDrawings
    ? sorted.flatMap(({ score, rank }) => {
        const drawing = drawingByUser.get(score.userId)
        const cells = typeof drawing?.cells === 'string' ? drawing.cells : ''
        if (!cells) return []
        return [{
          userId: score.userId,
          name: score.displayName?.trim() || 'Player',
          rank,
          score: score.score,
          cells,
          guess: drawing?.guess ?? score.guess ?? '',
          reason: drawing?.reason ?? '',
        }]
      })
    : []
  const viewerIndexByUser = new Map(viewerDrawings.map((drawing, index) => [drawing.userId, index]))

  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const thumbRefs = useRef(new Map<string, HTMLButtonElement>())
  const rowLinkRefs = useRef(new Map<string, HTMLAnchorElement>())
  const viewerUserId = viewerIndex === null ? undefined : viewerDrawings[viewerIndex]?.userId
  const restoreFocus = useCallback(
    () => (viewerUserId ? (thumbRefs.current.get(viewerUserId) ?? null) : null),
    [viewerUserId],
  )
  const closeViewer = useCallback(() => {
    // The dialog gives focus back to the thumbnail of the painting last on screen. A backdrop press
    // does not restore focus on its own, so land it there on the next frame as well.
    const userId = viewerUserId
    setViewerIndex(null)
    if (!userId) return
    requestAnimationFrame(() => {
      const thumb = thumbRefs.current.get(userId)
      if (thumb && document.activeElement !== thumb) thumb.focus({ preventScroll: true })
    })
  }, [viewerUserId])

  // A name or avatar opens the player's stats card; the row's artwork still opens the painting. Keyboard
  // activation of the row link (`detail === 0`) opens the same card, and the card links on to the gallery.
  const [statsUserId, setStatsUserId] = useState<string | null>(null)
  const closeStats = useCallback(() => {
    const userId = statsUserId
    setStatsUserId(null)
    if (!userId) return
    requestAnimationFrame(() => {
      const link = rowLinkRefs.current.get(userId)
      if (link && document.activeElement !== link) link.focus({ preventScroll: true })
    })
  }, [statsUserId])

  // Drawn scrollbar: the slate only fits three 120 px rows, so a clipped row always shows a thumb
  // and a bottom fade instead of looking like a layout bug. Native scrollbars are hidden because
  // they render inconsistently in embedded/headless browsers.
  const listRef = useRef<HTMLOListElement>(null)
  const [bar, setBar] = useState<{ visible: boolean; top: number; height: number }>({ visible: false, top: 0, height: 0 })
  const syncBar = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const track = list.clientHeight
    const content = list.scrollHeight
    if (track <= 0 || content <= track + 1) {
      setBar(previous => (previous.visible ? { visible: false, top: 0, height: 0 } : previous))
      return
    }
    const height = Math.max(24, Math.round((track * track) / content))
    const maxTop = track - height
    const top = Math.round((list.scrollTop / (content - track)) * maxTop)
    setBar(previous => (previous.visible && previous.top === top && previous.height === height ? previous : { visible: true, top, height }))
  }, [])

  useEffect(() => {
    syncBar()
  }, [syncBar, sorted.length, drawings.items.length])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const observer = new ResizeObserver(syncBar)
    observer.observe(list)
    return () => observer.disconnect()
  }, [syncBar])

  const topEntry = sorted[0]
  const topName = topEntry?.score.displayName?.trim() || 'Player'
  const shortTopName = truncateLabel(topName, 24)
  const topGuess = topEntry
    ? truncateLabel(
        typeof topEntry.score.guess === 'string'
          ? topEntry.score.guess
          : (drawingByUser.get(topEntry.score.userId)?.guess ?? ''),
        28,
      )
    : ''

  const haikuComment = status === 'loading'
    ? 'Checking the board…'
    : status === 'error'
      ? "I can't read the board right now. Try again?"
      : !topEntry
    ? 'No graded paintings yet — grab a brush on the porch!'
    : showDrawings && topGuess
      ? offset === 0
        ? `Haiku's favourite today: "${topGuess}" by ${shortTopName} (${topEntry.score.score})`
        : `Haiku's favourite (${selectedDay}): "${topGuess}" by ${shortTopName}`
      : offset === 0
        ? `Haiku's favourite today: ${shortTopName} leads at ${topEntry.score.score}!`
        : `Haiku's favourite (${selectedDay}): ${shortTopName} (${topEntry.score.score})`

  return (
    <div className="scores-board-wrap" data-testid="daily-leaderboard">
      <section className="scores-chalkboard" data-testid="scores-chalkboard" aria-labelledby="scores-heading">
        <div className="scores-chalk-rules" aria-hidden="true" />
        <div className="scores-board-header">
          <h1 id="scores-heading" className="scores-board-title">
            <PixelTrophy scale="scene" />
            <span>Scores</span>
          </h1>
          <div className="scores-pager">
            {onPorch && (
              <button
                type="button"
                data-testid="scores-porch-button"
                className="scores-porch-btn"
                onClick={onPorch}
              >
                ← Porch
              </button>
            )}
            <button
              type="button"
              className="scores-arrow"
              onClick={() => setOffset((value) => Math.min(MAX_HISTORY_DAYS, value + 1))}
              disabled={offset >= MAX_HISTORY_DAYS}
              aria-label="Previous day"
            >
              ←
            </button>
            <span className="scores-day-label" aria-live="polite">
              {offset === 0 ? 'Today' : selectedDay}
            </span>
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
              ? 'Live rankings · tap a painter for stats · tap a painting to see it'
              : 'Live rankings · tap a painter for stats · finish your Daily to see the paintings'
            : `Standings for ${selectedDay}`}
        </p>

        {status === 'loading' ? (
          <p className="scores-status" role="status">Loading scores…</p>
        ) : status === 'error' ? (
          <p className="scores-status" role="alert">
            Couldn&apos;t load scores. Try again soon.
            <button type="button" className="scores-retry" onClick={retry}>Retry</button>
          </p>
        ) : sorted.length === 0 ? (
          <p className="scores-status">No graded scores yet.</p>
        ) : (
          <div className={bar.visible ? 'scores-list-wrap scores-list-wrap--scrollable' : 'scores-list-wrap'}>
            <ol ref={listRef} className="scores-list" onScroll={syncBar}>
              {sorted.map(({ score, rank }) => {
              const drawing = showDrawings ? drawingByUser.get(score.userId) : undefined
              const hasCells = typeof drawing?.cells === 'string' && drawing.cells.length > 0
              const cells = hasCells ? drawing!.cells! : ''
              const viewerAt = viewerIndexByUser.get(score.userId)
              const medal = offset === 0 ? (rank <= 3 ? rank : 0) : (score.medal ?? 0)
              const playerName = score.displayName?.trim() || 'Player'
              const painterHref = `/u/${encodeURIComponent(score.userId)}`
              return (
                <li
                  key={score.userId}
                  className={`scores-row ${rank <= 3 ? 'scores-row--top' : ''}`.trim()}
                >
                  <Link
                    className="scores-row-link"
                    to={painterHref}
                    ref={(element) => {
                      if (element) rowLinkRefs.current.set(score.userId, element)
                      else rowLinkRefs.current.delete(score.userId)
                    }}
                    onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                      if (!isPrimaryClick(event)) return
                      const onPlayer = event.detail === 0 || (event.target as Element).closest('[data-player-stats]') !== null
                      if (onPlayer) {
                        event.preventDefault()
                        setStatsUserId(score.userId)
                        return
                      }
                      if (!onSelectPainter) return
                      event.preventDefault()
                      onSelectPainter(painterHref)
                    }}
                    title={playerName}
                  >
                    <span className="scores-rank">{rank}</span>
                    {/* The slot is reserved for every row while the board shows paintings, even before that
                        player's drawing has arrived: a row that grows a thumbnail slot after the fact would
                        make the whole board's rows jump size while the camera is still zooming in. */}
                    {showDrawings && <span className="scores-thumb-slot" aria-hidden="true" />}
                    <span className="scores-player-stats" data-player-stats>
                      <Avatar className="scores-avatar">
                        <AvatarImage src={score.avatarUrl || undefined} />
                        <AvatarFallback className="bg-[#263451] text-[#fff0cc]">
                          {Array.from(playerName)[0] ?? ''}
                        </AvatarFallback>
                      </Avatar>
                      <span className="scores-row-name" data-player-stats>{playerName}</span>
                    </span>
                    {medal > 0 && medal <= 3 && (
                      <PixelMedal
                        medal={medal as 1 | 2 | 3}
                        scale="scene"
                        label={`${['Gold', 'Silver', 'Bronze'][medal - 1]} medal${offset === 0 && !ended ? ' so far' : ''}`}
                        className="scores-medal"
                      />
                    )}
                    <span className="scores-points">
                      {score.score}
                      <span className="scores-points-max"> / 1000</span>
                    </span>
                  </Link>
                  {/* The thumbnail is the way in, laid over its slot (outside the row link) so a tap
                      opens the painting instead of the painter's gallery. */}
                  {viewerAt !== undefined && cells && (
                    <button
                      type="button"
                      className="scores-thumb-button"
                      data-testid="leaderboard-thumb-button"
                      aria-label={`View ${playerName}'s drawing`}
                      aria-haspopup="dialog"
                      ref={(element) => {
                        if (element) thumbRefs.current.set(score.userId, element)
                        else thumbRefs.current.delete(score.userId)
                      }}
                      onClick={() => setViewerIndex(viewerAt)}
                    >
                      <PixelThumb cells={cells} size={64} className="scores-thumb" />
                    </button>
                  )}
                </li>
              )
            })}
            </ol>
            {bar.visible && (
              <span className="scores-scrollbar" aria-hidden="true">
                <span style={{ top: `${bar.top}px`, height: `${bar.height}px` }} />
              </span>
            )}
          </div>
        )}
      </section>

      <div className="scores-ledge" data-testid="scores-ledge">
        <Haiku
          state={topEntry ? 'guess' : 'idle'}
          scale="scene"
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

      {viewerIndex !== null && viewerUserId !== undefined && (
        <DrawingViewer
          drawings={viewerDrawings}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={closeViewer}
          finalFocus={restoreFocus}
        />
      )}

      {statsUserId !== null && (
        <PlayerStatsDialog
          userId={statsUserId}
          onClose={closeStats}
          finalFocus={() => rowLinkRefs.current.get(statsUserId) ?? null}
          onSeeGallery={onSelectPainter
            ? (href) => {
                setStatsUserId(null)
                onSelectPainter(href)
              }
            : undefined}
        />
      )}
    </div>
  )
}
