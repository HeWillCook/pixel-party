import { Leaderboard } from '../../components/daily/Leaderboard'
import { useDaily } from '../../hooks/DailyAttemptProvider'

export default function ScoresPage() {
  const { state } = useDaily()
  return <div className="mx-auto max-w-3xl p-6"><h1 className="pp-word mb-6 text-4xl">Scores</h1>{state ? <Leaderboard day={state.day} ended={state.status === 'ended'} /> : <div className="pp-panel p-6">Loading scores…</div>}</div>
}
