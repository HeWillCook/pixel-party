/**
 * Profile types shared by the worker and the browser. No runtime imports: the
 * client must never pull `deepspace/worker` into its bundle through the server.
 */

/** What anyone may read about a player. No email, no auth-provider ids. */
export interface PublicProfile {
  userId: string
  username: string
  /** Milliseconds since epoch when the tour was finished or skipped; 0 while unfinished. */
  onboardedAt: number
}

/** The signed-in player's own view: adds when the username last changed (the 24 h limit). */
export interface ProfileView extends PublicProfile {
  usernameChangedAt: number
}

export type ProfileSaveResult =
  | { ok: true; profile: ProfileView }
  | { ok: false; code: string; message: string }

export type UsernameAvailability =
  | { available: true }
  | { available: false; code: string; message: string }
