import type { ClientState } from './client-state'
import type { RoundView } from './protocol'

export type SoundName = 'guess' | 'tick' | 'win' | 'timeout'

export function soundEventsFor(prev: ClientState, next: ClientState): SoundName[] {
  if (!prev.snapshotLoaded || !next.snapshotLoaded || !prev.round || prev.round.id !== next.round?.id) return []
  if (prev.round.state === 'playing' && next.round.state !== 'playing') {
    if (next.round.result?.outcome === 'won' || next.round.result?.outcome === 'teamWin') return ['win']
  }
  const events: SoundName[] = next.guessLog.length > prev.guessLog.length && !next.guessLog[0]?.matched ? ['guess'] : []
  if (prev.round.state === 'playing' && next.round.state !== 'playing' && next.round.result?.outcome === 'timeout') events.push('timeout')
  return events
}

export function countdownTickSecond(round: RoundView | null, now: number): number | null {
  if (round?.state !== 'playing' || round.endsAt === null) return null
  const second = Math.ceil((round.endsAt - now) / 1000)
  return second >= 1 && second <= 5 ? second : null
}
