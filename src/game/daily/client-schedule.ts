import { DAILY } from '../config'
import type { GradeReject } from './attempt'
import type { DailyStateView, GradeView } from '../../server/daily-service'

export type DailyRejectReason = GradeReject | 'judge_resting' | 'bad_cells' | string

export interface DailyClientState extends DailyStateView {
  latest: GradeView | null
  grading: boolean
  lastError: string | null
}

export type DailyAction =
  | { type: 'state_loaded'; state: DailyStateView }
  | { type: 'grade_start' }
  | { type: 'grade_ok'; grade: GradeView; state?: DailyStateView }
  | { type: 'grade_rejected'; reason: DailyRejectReason; state?: DailyStateView }
  | { type: 'error'; message: string }
  | { type: 'clear_error' }

export function initialDailyClientState(day = ''): DailyClientState {
  return {
    day,
    status: 'not_started',
    autoUsed: 0,
    asksUsed: 0,
    finalUsed: false,
    best: 0,
    latest: null,
    grading: false,
    lastError: null,
  }
}

export function nextAutoAt(
  startedAt: number,
  autoUsed: number,
  lastGradeAt: number | null,
): number | null {
  if (autoUsed >= DAILY.maxAuto) return null
  const scheduled = startedAt + DAILY.firstAutoMs + autoUsed * DAILY.autoEveryMs
  if (lastGradeAt === null) return scheduled
  return Math.max(scheduled, lastGradeAt + DAILY.autoMinGapMs)
}

export function shouldFinalGrade(now: number, startedAt: number): boolean {
  return now >= startedAt + DAILY.attemptMs
}

function rejectErrorMessage(reason: DailyRejectReason): string | null {
  switch (reason) {
    case 'unchanged':
    case 'too_soon':
      return null
    case 'judge_resting':
      return 'Judge is resting, keep drawing'
    case 'busy':
      return 'Grading already in progress'
    case 'no_asks_left':
      return 'No Ask-nows left for this attempt'
    case 'no_auto_left':
    case 'final_used':
      return null
    case 'time_up':
    case 'ended':
      return 'Attempt has ended'
    case 'not_started':
      return 'Start the daily challenge first'
    case 'bad_cells':
      return 'Invalid canvas data'
    default:
      return typeof reason === 'string' && reason.length > 0 ? reason : null
  }
}

function mergeServerState(prev: DailyClientState, next: DailyStateView): DailyClientState {
  return {
    ...prev,
    day: next.day,
    status: next.status,
    prompt: next.prompt,
    startedAt: next.startedAt,
    endsAt: next.endsAt,
    autoUsed: next.autoUsed,
    asksUsed: next.asksUsed,
    finalUsed: next.finalUsed,
    best: Math.max(prev.best, next.best),
    nextAutoAt: next.nextAutoAt,
    lastCells: next.lastCells,
  }
}

export function dailyReducer(state: DailyClientState, action: DailyAction): DailyClientState {
  switch (action.type) {
    case 'state_loaded':
      return {
        ...mergeServerState(state, action.state),
        best: action.state.best,
        lastError: null,
      }
    case 'grade_start':
      return {
        ...state,
        grading: true,
        lastError: null,
      }
    case 'grade_ok': {
      const merged = action.state ? mergeServerState(state, action.state) : state
      return {
        ...merged,
        latest: action.grade,
        best: Math.max(state.best, action.state?.best ?? 0, action.grade.total),
        grading: false,
        lastError: null,
      }
    }
    case 'grade_rejected': {
      const merged = action.state ? mergeServerState(state, action.state) : state
      return {
        ...merged,
        best: state.best,
        grading: false,
        lastError: rejectErrorMessage(action.reason),
      }
    }
    case 'error':
      return {
        ...state,
        grading: false,
        lastError: action.message,
      }
    case 'clear_error':
      return {
        ...state,
        lastError: null,
      }
  }
}
