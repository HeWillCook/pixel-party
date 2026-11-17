import { DAILY } from '../config'
import type { GradeKind, GradeReject } from './attempt'
import type { DailyStateView, GradeView } from '../../server/daily-service'

export type DailyRejectReason = GradeReject | 'judge_resting' | 'bad_cells' | string

export interface DailyClientState extends DailyStateView {
  latest: GradeView | null
  grading: boolean
  finalizing: boolean
  endFailed: boolean
  stale: boolean
  lastError: string | null
  lastGradedHash?: string | null
  lastGradeAt?: number | null
  autoRetryAfter?: number | null
}

export type DailyAction =
  | { type: 'state_loaded'; state: DailyStateView; preserveError?: boolean }
  | { type: 'grade_start'; kind?: GradeKind }
  | {
      type: 'grade_ok'
      grade: GradeView
      state?: DailyStateView
      cellsHash?: string
      now?: number
    }
  | {
      type: 'grade_rejected'
      reason: DailyRejectReason
      state?: DailyStateView
      kind?: GradeKind
      cellsHash?: string
      now?: number
    }
  | { type: 'finalize_start' }
  | { type: 'end_failed'; message: string }
  | { type: 'error'; message: string; kind?: GradeKind; now?: number }
  | { type: 'clear_error' }

const AUTO_RETRY_BACKOFF_MS = 10_000

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
    finalizing: false,
    endFailed: false,
    stale: false,
    lastError: null,
    lastGradedHash: null,
    lastGradeAt: null,
    autoRetryAfter: null,
  }
}

export function needsDailyDayRefresh(state: DailyStateView & { stale?: boolean }, now: number): boolean {
  return Boolean(state.stale) || (state.status !== 'playing' && state.day !== new Date(now).toISOString().slice(0, 10))
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

export function canPaintDaily(state: DailyClientState, now: number): boolean {
  if (state.status !== 'playing') return false
  if (state.stale) return false
  if (state.finalizing || state.endFailed || state.finalUsed) return false
  const endsAt =
    state.endsAt ?? (state.startedAt !== undefined ? state.startedAt + DAILY.attemptMs : undefined)
  if (endsAt !== undefined && now >= endsAt) return false
  return true
}

export function canAskDaily(state: DailyClientState, now: number): boolean {
  if (!canPaintDaily(state, now)) return false
  if (state.grading) return false
  if (state.asksUsed >= DAILY.maxAsks) return false
  return true
}

export function shouldFireAutoGrade(
  state: DailyClientState,
  now: number,
  currentCellsHash?: string,
): boolean {
  if (!canPaintDaily(state, now)) return false
  if (state.grading) return false
  if (state.startedAt === undefined) return false
  if (state.autoUsed >= DAILY.maxAuto) return false

  const target =
    state.nextAutoAt ?? nextAutoAt(state.startedAt, state.autoUsed, state.lastGradeAt ?? null)
  if (target === null || now < target) return false

  if (state.autoRetryAfter != null && now < state.autoRetryAfter) return false
  if (
    currentCellsHash !== undefined &&
    state.lastGradedHash != null &&
    currentCellsHash === state.lastGradedHash
  ) {
    return false
  }
  return true
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
  if (prev.day !== next.day) return { ...initialDailyClientState(next.day), ...next }
  const isNowEnded = next.status === 'ended'
  const isNewStart = prev.status === 'not_started' && next.status === 'playing'
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
    best: next.best,
    nextAutoAt: next.nextAutoAt,
    lastCells: next.lastCells,
    finalizing: isNowEnded || isNewStart ? false : prev.finalizing,
    endFailed: isNowEnded || isNewStart ? false : prev.endFailed,
    ...(isNewStart
      ? {
          lastGradedHash: null,
          lastGradeAt: null,
          autoRetryAfter: null,
        }
      : {}),
  }
}

export function dailyReducer(state: DailyClientState, action: DailyAction): DailyClientState {
  switch (action.type) {
    case 'state_loaded': {
      const merged = mergeServerState(state, action.state)
      return {
        ...merged,
        best: action.state.best,
        stale: false,
        finalizing: state.stale ? false : merged.finalizing,
        lastError: action.preserveError ? state.lastError : null,
      }
    }
    case 'finalize_start':
      return {
        ...state,
        finalizing: true,
        endFailed: false,
      }
    case 'end_failed':
      return {
        ...state,
        grading: false,
        finalizing: true,
        endFailed: true,
        lastError: action.message,
      }
    case 'grade_start':
      return {
        ...state,
        grading: true,
        finalizing: state.finalizing || action.kind === 'final',
        lastError: null,
      }
    case 'grade_ok': {
      const merged = action.state ? mergeServerState(state, action.state) : state
      return {
        ...merged,
        latest: action.grade,
        best: action.state?.best ?? Math.max(state.best, action.grade.total),
        grading: false,
        lastError: null,
        lastGradedHash: action.cellsHash ?? state.lastGradedHash ?? null,
        lastGradeAt: action.now ?? state.lastGradeAt ?? null,
        autoRetryAfter: null,
      }
    }
    case 'grade_rejected': {
      if (action.reason === 'invalid_day') {
        return {
          ...state,
          stale: true,
          grading: false,
          finalizing: true,
          endFailed: false,
          lastError: 'This attempt has expired. Reloading the current daily challenge…',
        }
      }
      const merged = action.state ? mergeServerState(state, action.state) : state
      const isUnchanged = action.reason === 'unchanged'
      const shouldBackoffAuto =
        action.kind === 'auto' &&
        !isUnchanged &&
        action.now !== undefined &&
        merged.nextAutoAt === state.nextAutoAt
      return {
        ...merged,
        best: merged.best,
        grading: false,
        lastError: rejectErrorMessage(action.reason),
        lastGradedHash:
          isUnchanged && action.cellsHash !== undefined
            ? action.cellsHash
            : state.lastGradedHash ?? null,
        autoRetryAfter: shouldBackoffAuto
          ? action.now! + AUTO_RETRY_BACKOFF_MS
          : isUnchanged
            ? null
            : state.autoRetryAfter ?? null,
      }
    }
    case 'error':
      return {
        ...state,
        grading: false,
        lastError: action.message,
        autoRetryAfter:
          action.kind === 'auto' && action.now !== undefined
            ? action.now + AUTO_RETRY_BACKOFF_MS
            : state.autoRetryAfter ?? null,
      }
    case 'clear_error':
      return {
        ...state,
        lastError: null,
      }
  }
}
