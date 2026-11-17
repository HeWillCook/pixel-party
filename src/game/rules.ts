import { PALETTE } from './config'

export type RejectReason =
  | 'not_signed_in'
  | 'round_inactive'
  | 'out_of_bounds'
  | 'bad_color'
  | 'cooldown'

export function cooldownMs(playersConnected: number): number {
  if (playersConnected <= 1) {
    return 200
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
  if (!Number.isInteger(p.color) || p.color < 1 || p.color >= PALETTE.length) {
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
