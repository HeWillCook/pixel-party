import { useId, type ReactNode } from 'react'
import type { PlayerStats } from '../../game/stats'
import { Avatar, AvatarFallback, AvatarImage } from '../ui'
import { PixelMedal } from '../daily/PixelMedals'
import { usePlayerStats } from './usePlayerStats'
import './stats.css'

const MEDALS = ['Gold', 'Silver', 'Bronze'] as const

function value(count: number): string {
  return String(count)
}

function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function Stat({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <div className="pstats-stat">
      <dt>{label}</dt>
      <dd data-testid={testId}>{children}</dd>
    </div>
  )
}

function DailyBlock({ stats }: { stats: PlayerStats }) {
  const { daily } = stats
  return (
    <section className="pstats-block pstats-block--daily" aria-labelledby="pstats-daily-title">
      <h3 id="pstats-daily-title" className="pstats-block-title">Daily</h3>
      <dl className="pstats-grid">
        <Stat label="Days" testId="stats-days-played">{value(daily.daysPlayed)}</Stat>
        <Stat label="Best" testId="stats-best">
          {value(daily.bestScore)}
          <span className="pstats-max"> /1000</span>
        </Stat>
        <Stat label="Avg." testId="stats-average">{value(daily.averageScore)}</Stat>
        <Stat label="Streak" testId="stats-current-streak">{value(daily.currentStreak)}</Stat>
        <Stat label="Longest" testId="stats-longest-streak">{value(daily.longestStreak)}</Stat>
        <Stat label="Top 3" testId="stats-top-three">{value(daily.topThree)}</Stat>
      </dl>
      <ul className="pstats-medals" aria-label="Medals won">
        {([daily.medals.gold, daily.medals.silver, daily.medals.bronze] as const).map((count, index) => {
          const medal = (index + 1) as 1 | 2 | 3
          return (
            <li key={medal} className="pstats-medal" data-testid={`stats-medal-${MEDALS[index].toLowerCase()}`}>
              <PixelMedal medal={medal} label={`${MEDALS[index]} medals`} scale="scene" className="pstats-medal-icon" />
              <span className="pstats-medal-count">{count}</span>
            </li>
          )
        })}
      </ul>
      {daily.bestDay && (
        <p className="pstats-note" data-testid="stats-best-day">Best day: {formatDay(daily.bestDay)}</p>
      )}
      {daily.daysPlayed === 0 && (
        <p className="pstats-note" data-testid="player-stats-empty">No daily paintings yet.</p>
      )}
    </section>
  )
}

function PartyBlock({ stats }: { stats: PlayerStats }) {
  const { party } = stats
  return (
    <section className="pstats-block pstats-block--party" aria-labelledby="pstats-party-title">
      <h3 id="pstats-party-title" className="pstats-block-title">Party</h3>
      <dl className="pstats-grid pstats-grid--party">
        <Stat label="Rounds" testId="stats-party-rounds">{value(party.partyRounds)}</Stat>
        <Stat label="Guessed" testId="stats-party-guessed">{value(party.partyGuessed)}</Stat>
        {/* Team rounds end as an ordinary win or timeout today, so there is no team win to count yet. */}
        <Stat label="Rounds hosted" testId="stats-games-hosted">{value(party.gamesHosted)}</Stat>
      </dl>
      {party.partyRounds === 0 && party.gamesHosted === 0 && (
        <p className="pstats-note">No party rounds yet.</p>
      )}
    </section>
  )
}

export interface PlayerStatsCardProps {
  userId: string
  /** `plaque` is the wall-side card on a player's page; `dialog` sits inside the Scores dialog. */
  variant?: 'plaque' | 'dialog'
}

/** A player's daily and party numbers, with loading, empty, signed-out and error states. */
export function PlayerStatsCard({ userId, variant = 'dialog' }: PlayerStatsCardProps) {
  const titleId = useId()
  const { status, stats, retry } = usePlayerStats(userId)
  const initial = Array.from(stats?.name?.trim() || 'P')[0] ?? 'P'

  return (
    <article
      className={`pstats-card pstats-card--${variant}`}
      data-testid="player-stats-card"
      data-status={status}
      aria-busy={status === 'loading'}
      aria-labelledby={titleId}
    >
      <header className="pstats-head">
        <Avatar className="pstats-avatar">
          <AvatarImage src={stats?.avatarUrl || undefined} />
          <AvatarFallback className="pstats-avatar-fallback">{initial}</AvatarFallback>
        </Avatar>
        <div className="pstats-id">
          <h2 id={titleId} className="pstats-name" data-testid="player-stats-name">
            {stats?.name?.trim() || 'Player'}
          </h2>
          <p className="pstats-tagline">
            {status === 'ready' && stats
              ? stats.daily.daysPlayed > 0 || stats.party.partyRounds > 0
                ? 'Painter on the porch'
                : 'New to the porch'
              : 'Player on the porch'}
          </p>
        </div>
      </header>

      {status === 'loading' && (
        <p className="pstats-status" role="status" data-testid="player-stats-loading">
          Reading the ledger…
        </p>
      )}
      {status === 'signed-out' && (
        <p className="pstats-status" data-testid="player-stats-signed-out">
          Sign in to see player stats.
        </p>
      )}
      {status === 'error' && (
        <p className="pstats-status" role="alert" data-testid="player-stats-error">
          Couldn&apos;t read these stats.{' '}
          <button type="button" className="pstats-retry" onClick={retry}>Retry</button>
        </p>
      )}
      {status === 'ready' && stats && (
        <>
          <DailyBlock stats={stats} />
          <PartyBlock stats={stats} />
        </>
      )}
    </article>
  )
}
