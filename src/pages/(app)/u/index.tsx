import { Navigate } from 'react-router-dom'
import { useAuthProfileReady } from 'deepspace'

/**
 * The bare `/u` (the nav's Gallery link opened directly or in a new tab) has no wall of its own: a signed-in player goes to their
 * own gallery, and a visitor goes to the porch, where the Gallery sign offers sign-in.
 */
export default function GalleryIndexPage() {
  const { userId, isLoaded } = useAuthProfileReady({ requireUser: false })
  if (!isLoaded) return null
  return <Navigate to={userId ? `/u/${encodeURIComponent(userId)}` : '/home'} replace />
}
