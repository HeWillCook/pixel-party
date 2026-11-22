/**
 * Remembers on this device that the player was signed in, so a new tab opened on
 * the static landing (`/`, which mounts no auth) can send them straight to the
 * porch instead of showing the signed-out page. index.html reads the same key
 * before first paint; keep the two in step.
 *
 * It is only a hint: /home checks the real session, and a stale hint just lands
 * a signed-out visitor on the guest porch.
 */
export const SIGNED_IN_HINT_KEY = 'pixle:signed-in'

export function setSignedInHint(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_HINT_KEY, '1')
    else localStorage.removeItem(SIGNED_IN_HINT_KEY)
  } catch {
    // Storage blocked (private mode, quota): the landing just stays signed-out.
  }
}
