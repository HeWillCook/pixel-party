import { Leaderboard } from '../../components/daily/Leaderboard'
import { PlayScenery } from '../../components/play/PlayScenery'
import { useDaily } from '../../hooks/DailyAttemptProvider'
import '../../components/scores/scores.css'

export default function ScoresPage() {
  const { state } = useDaily()
  return (
    <div className="scores-page" data-testid="scores-page">
      <div className="scores-backdrop" aria-hidden="true">
        <PlayScenery showRoof={false} />
      </div>
      <div className="scores-stage">
        {state ? (
          <Leaderboard day={state.day} ended={state.status === 'ended'} />
        ) : (
          <div className="pp-wood-panel p-6">Loading scores…</div>
        )}
      </div>
    </div>
  )
}
