import type { DailyClientState } from './client-schedule'
import type { SoundName } from '../sound-events'

export function createDailySoundGate() {
  let previous: DailyClientState | undefined
  let previousSecond: number | undefined
  return (state: DailyClientState, now: number): SoundName[] => {
    const second = state.endsAt === undefined ? undefined : Math.ceil((state.endsAt - now) / 1000)
    const live = previous?.status === 'playing' && previous.day === state.day && previous.startedAt === state.startedAt
    const events: SoundName[] = []
    if (live) {
      if (state.status === 'ended') events.push(state.best > 0 ? 'win' : 'timeout')
      else if (state.status === 'playing') {
        if (state.lastGradeAt != null && state.lastGradeAt !== previous?.lastGradeAt) events.push('guess')
        if (second !== undefined && second >= 1 && second <= 5 && second !== previousSecond) events.push('tick')
      }
    }
    previous = state
    previousSecond = second
    return events
  }
}
