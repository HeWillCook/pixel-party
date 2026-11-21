import { useAuthProfileReady } from 'deepspace'
import { useDaily } from './DailyAttemptProvider'

/**
 * True while a Daily attempt is running. From the moment it starts until it is submitted (or time runs
 * out) the player stays on the easel: the nav's exits are removed, the browser's back button is a no-op,
 * and any other route redirects to `/home`, where a reload resumes zoomed in on the board.
 */
export function useDailyLock(): boolean {
  const { isSignedIn } = useAuthProfileReady({ requireUser: false })
  const { state } = useDaily()
  return Boolean(isSignedIn) && state.loaded && state.status === 'playing'
}
