import { isAnonymousUserId } from 'deepspace'

/** The state each person on the porch publishes: who they are and whether a Daily attempt is playing. Nothing else. */
export interface PorchPresenceState { name?: string; painting?: boolean }
export interface PorchPeer { userId: string; userName: string; state: Record<string, unknown> }

export const PORCH_LIST_MAX = 5

export interface PorchSummary {
  /** Everyone here, you included. */
  total: number
  /** Everyone here with a Daily attempt running, you included. */
  painting: number
  /** "3 on the porch" */
  headline: string
  /** "1 painting now", or '' when nobody is. */
  detail: string
  /** Up to `PORCH_LIST_MAX` names of the others, then how many more there are. */
  names: string[]
  more: number
}

const nameOf = (peer: PorchPeer): string => {
  if (isAnonymousUserId(peer.userId)) return 'A visitor'
  // The published name is the player's chosen username (or their sign-in name
  // when the profile is unknown); the SDK roster's `userName` is the fallback.
  const published = typeof peer.state?.name === 'string' ? peer.state.name : ''
  const roster = peer.userName && peer.userName !== 'Anonymous' ? peer.userName : ''
  const raw = (published || roster).trim()
  return raw ? (raw.length > 22 ? `${raw.slice(0, 21).trimEnd()}…` : raw) : 'A neighbour'
}

/**
 * The porch sign's words from the SDK's peers (everyone but you). You are always counted in the total, never listed among the
 * others, and your own attempt counts as painting.
 */
export function summarizePorch(peers: PorchPeer[], selfPainting: boolean): PorchSummary {
  const total = peers.length + 1
  const painting = peers.filter((peer) => peer.state?.painting === true).length + (selfPainting ? 1 : 0)
  const names = peers.map(nameOf)
  return {
    total,
    painting,
    headline: total === 1 ? 'Just you on the porch' : `${total} on the porch`,
    detail: total > 1 && painting > 0 ? `${painting} painting now` : '',
    names: names.slice(0, PORCH_LIST_MAX),
    more: Math.max(0, names.length - PORCH_LIST_MAX),
  }
}
