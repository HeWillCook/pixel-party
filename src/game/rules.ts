import { MAX_COLOR } from './config'

export type RejectReason =
  | 'not_signed_in'
  | 'round_inactive'
  | 'out_of_bounds'
  | 'bad_color'
  | 'rate_limited'

/**
 * Painting is a click-and-drag in every mode. Validation covers identity, the round, bounds
 * and palette only; pace is a per-painter token bucket (see `consumePaintToken`), never a
 * per-pixel cooldown, so a drag lands as one solid stroke whether you are alone or with friends.
 */
export function validatePlacement(p: {
  width: number
  height: number
  x: number
  y: number
  color: number
  userId: string | null
  roundPlaying: boolean
}): { ok: true } | { ok: false; reason: RejectReason } {
  if (!p.userId) {
    return { ok: false, reason: 'not_signed_in' }
  }
  if (!p.roundPlaying) {
    return { ok: false, reason: 'round_inactive' }
  }
  if (
    !Number.isInteger(p.x) ||
    !Number.isInteger(p.y) ||
    p.x < 0 ||
    p.x >= p.width ||
    p.y < 0 ||
    p.y >= p.height
  ) {
    return { ok: false, reason: 'out_of_bounds' }
  }
  if (!Number.isInteger(p.color) || p.color < 0 || p.color > MAX_COLOR) {
    return { ok: false, reason: 'bad_color' }
  }
  return { ok: true }
}

/** Persisted per-user paint budget: `tokens` cells left, refilled at `cellsPerSecond`. */
export interface TokenBucket {
  tokens: number
  updatedAt: number
}

export interface PaintRate {
  cellsPerSecond: number
  /** Burst capacity in cells (one second of painting at `cellsPerSecond`). */
  burst: number
}

/** Solo: 60 cells/s, one second of burst. A fast drag (or a diagonal sweep) lands whole. */
export const SOLO_PAINT_RATE: PaintRate = { cellsPerSecond: 60, burst: 60 }
/**
 * Party: every painter gets their own 40 cells/s with one second of burst. Instant drags,
 * while a script holding the pointer down can still paint only 40 cells a second.
 */
export const PARTY_PAINT_RATE: PaintRate = { cellsPerSecond: 40, burst: 40 }

export function paintRate(playersConnected: number): PaintRate {
  return playersConnected <= 1 ? SOLO_PAINT_RATE : PARTY_PAINT_RATE
}

/**
 * Consume one cell from a per-user token bucket. Two players never share the cap: each gets
 * their own bucket keyed by user id, so a drag by one does not starve the other.
 */
export function consumePaintToken(bucket: TokenBucket | undefined, now: number, rate: PaintRate):
  | { ok: true; bucket: TokenBucket }
  | { ok: false; retryAt: number } {
  const elapsed = bucket ? Math.max(0, now - bucket.updatedAt) : 0
  const tokens = Math.min(rate.burst, (bucket?.tokens ?? rate.burst) + (elapsed * rate.cellsPerSecond) / 1000)
  if (tokens < 1) return { ok: false, retryAt: now + Math.ceil(((1 - tokens) * 1000) / rate.cellsPerSecond) }
  return { ok: true, bucket: { tokens: tokens - 1, updatedAt: Math.max(now, bucket?.updatedAt ?? now) } }
}
