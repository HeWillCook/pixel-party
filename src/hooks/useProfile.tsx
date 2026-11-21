/**
 * The signed-in player's profile, fetched once per user and shared by the nav,
 * porch presence, settings and the onboarding modal.
 *
 * Deliberately distinct from the SDK's `user.name`: that is the sign-in
 * provider's name (or a raw id when the provider sends none). A Pixle username
 * is chosen here and lives in the `profiles` collection.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuthProfileReady, useQuery } from 'deepspace'
import type { ProfileView } from '../game/profile'
import { fetchMyProfile } from '../lib/profile-client'

export type ProfileStatus = 'signed-out' | 'loading' | 'unknown' | 'ready'

export interface MyProfileContextValue {
  status: ProfileStatus
  profile: ProfileView | null
  /** The name to show, or null while unknown/none. Callers fall back to the auth name. */
  username: string | null
  /** Re-fetch from the server (after a save, or to recover from `unknown`). */
  refresh: () => void
  /** Apply a profile this tab just wrote, without waiting for a refetch. */
  apply: (profile: ProfileView) => void
}

const MyProfileContext = createContext<MyProfileContextValue>({
  status: 'signed-out',
  profile: null,
  username: null,
  refresh: () => {},
  apply: () => {},
})

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, userLoading } = useAuthProfileReady({ requireUser: false })
  const [status, setStatus] = useState<ProfileStatus>('signed-out')
  const [profile, setProfile] = useState<ProfileView | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const requestedFor = useRef<string | null>(null)

  const refresh = useCallback(() => setReloadKey((key) => key + 1), [])
  const apply = useCallback((next: ProfileView) => {
    setProfile(next)
    setStatus('ready')
  }, [])

  useEffect(() => {
    if (!isLoaded) {
      setStatus('loading')
      return
    }
    if (!isSignedIn || !userId) {
      requestedFor.current = null
      setProfile(null)
      setStatus('signed-out')
      return
    }
    // Wait for the user row too: issuing the fetch before the auth token is
    // available would only earn a 401 (and an "unknown" state).
    if (userLoading) {
      setStatus('loading')
      return
    }
    let cancelled = false
    const requestKey = `${userId}:${reloadKey}`
    if (requestedFor.current !== requestKey) {
      requestedFor.current = requestKey
      setStatus('loading')
    }
    void fetchMyProfile().then((result) => {
      if (cancelled) return
      if (!result.known) {
        setProfile(null)
        setStatus('unknown')
        return
      }
      setProfile(result.profile)
      setStatus('ready')
    })
    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, userId, userLoading, reloadKey])

  const value = useMemo<MyProfileContextValue>(() => ({
    status,
    profile,
    username: profile?.username ?? null,
    refresh,
    apply,
  }), [status, profile, refresh, apply])

  return <MyProfileContext.Provider value={value}>{children}</MyProfileContext.Provider>
}

export function useMyProfile(): MyProfileContextValue {
  return useContext(MyProfileContext)
}

/**
 * Any player's username, for names on a wall or a roster. Prefers the cached
 * self profile, otherwise subscribes to the public `profiles` row (read-only).
 */
export function useUsername(userId?: string | null): string | null {
  const mine = useMyProfile()
  const { user } = useAuthProfileReady({ requireUser: false })
  const wanted = userId ?? user?.id ?? null
  const isSelf = Boolean(wanted && user?.id === wanted)
  const { records } = useQuery<{ username?: string }>('profiles', {
    where: { userId: wanted ?? '__none__' },
    limit: 1,
  })
  if (isSelf && mine.profile) return mine.profile.username
  const found = records[0]?.data?.username
  return typeof found === 'string' && found ? found : null
}
