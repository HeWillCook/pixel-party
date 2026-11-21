import { useUsername } from '../../hooks/useProfile'

/** A player's chosen username, falling back to whatever name the caller already had. */
export function Username({ userId, fallback }: { userId: string; fallback: string }) {
  return <>{useUsername(userId) ?? fallback}</>
}
