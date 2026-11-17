import type { ClientState } from './client-state'
import type { RoundView } from './protocol'

export type SoundName = 'guess' | 'tick' | 'win' | 'timeout'

export function soundEventsFor(prev: ClientState, next: ClientState): SoundName[] {
  if (!prev.connected || !next.connected || next.connectError || !prev.snapshotLoaded || !next.snapshotLoaded || prev.snapshotSeq !== next.snapshotSeq || !prev.round || prev.round.id !== next.round?.id) return []
  if (prev.round.state === 'playing' && next.round.state !== 'playing') {
    if (next.round.result?.outcome === 'won' || next.round.result?.outcome === 'teamWin') return ['win']
  }
  const front = next.guessLog[0]
  const events: SoundName[] = front && front.id !== prev.guessLog[0]?.id && !front.matched ? ['guess'] : []
  if (prev.round.state === 'playing' && next.round.state !== 'playing' && next.round.result?.outcome === 'timeout') events.push('timeout')
  return events
}

export function createCountdownGate() {
  let lastRoundId: string | undefined
  let lastSnapshotSeq: number | undefined
  let lastSecond: number | null = null
  let live = false
  let awaitingSnapshot = false
  return (state: ClientState, now: number): boolean => {
    const second = countdownTickSecond(state.round, now)
    if (!state.connected || !state.snapshotLoaded) {
      live = false
      awaitingSnapshot = true
      lastSnapshotSeq = state.snapshotSeq
      return false
    }
    if (awaitingSnapshot && lastSnapshotSeq === state.snapshotSeq) return false
    awaitingSnapshot = false
    const resync = !live || lastRoundId !== state.round?.id || lastSnapshotSeq !== state.snapshotSeq
    const play = !resync && second !== null && second !== lastSecond
    live = true
    lastRoundId = state.round?.id
    lastSnapshotSeq = state.snapshotSeq
    lastSecond = second
    return play
  }
}

export function countdownTickSecond(round: RoundView | null, now: number): number | null {
  if (round?.state !== 'playing' || round.endsAt === null) return null
  const second = Math.ceil((round.endsAt - now) / 1000)
  return second >= 1 && second <= 5 ? second : null
}
