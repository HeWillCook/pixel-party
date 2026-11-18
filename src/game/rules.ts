import { MAX_COLOR } from './config'

export type RejectReason =
  | 'not_signed_in'
  | 'round_inactive'
  | 'out_of_bounds'
  | 'bad_color'
  | 'cooldown'
  | 'rate_limited'

export function cooldownMs(playersConnected: number): number {
  if (playersConnected <= 1) {
    return 0
  }
  return Math.min(1000 * playersConnected, 10_000)
}

export function validatePlacement(p: {
  width: number
  height: number
  x: number
  y: number
  color: number
  userId: string | null
  roundPlaying: boolean
  lastPlacedAt: number | undefined
  now: number
  playersConnected: number
}): { ok: true } | { ok: false; reason: RejectReason; retryAt?: number } {
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
  if (p.lastPlacedAt !== undefined) {
    const retryAt = p.lastPlacedAt + cooldownMs(p.playersConnected)
    if (p.now < retryAt) {
      return { ok: false, reason: 'cooldown', retryAt }
    }
  }
  return { ok: true }
}

export interface SoloBucket { tokens: number; updatedAt: number }
const SOLO_CELLS_PER_SECOND = 60

/** Persisted per-user token bucket: one second of burst capacity, 60 cells/s refill. */
export function consumeSoloToken(bucket: SoloBucket | undefined, now: number):
  | { ok: true; bucket: SoloBucket }
  | { ok: false; retryAt: number } {
  const elapsed = bucket ? Math.max(0, now - bucket.updatedAt) : 0
  const tokens = Math.min(SOLO_CELLS_PER_SECOND, (bucket?.tokens ?? SOLO_CELLS_PER_SECOND) + elapsed * SOLO_CELLS_PER_SECOND / 1000)
  if (tokens < 1) return { ok: false, retryAt: now + Math.ceil((1 - tokens) * 1000 / SOLO_CELLS_PER_SECOND) }
  return { ok: true, bucket: { tokens: tokens - 1, updatedAt: Math.max(now, bucket?.updatedAt ?? now) } }
}
