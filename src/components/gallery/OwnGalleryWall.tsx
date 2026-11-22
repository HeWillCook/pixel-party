import { useEffect, useState } from 'react'
import { useAuthProfileReady } from 'deepspace'
import { GalleryWall } from './GalleryWall'
import { WallEmpty } from './WallEmpty'
import { useGalleryItems } from './useGalleryItems'
import { useWallPage } from './useWallPager'

/**
 * A scene's own copy of a player's wall (inert, off-screen at rest): it is there for the pan to the gallery, so the paintings are
 * already hanging on the siding when the camera arrives and the page that takes over draws the very same frames. Loaded when the
 * browser is idle, so a first paint never waits for it; `now` asks for it at once (a painter just picked on the Scores board).
 */
export function OwnGalleryWall({ userId, now = false }: { userId: string; now?: boolean }) {
  const [ready, setReady] = useState(now)
  const { user } = useAuthProfileReady({ requireUser: false })
  useEffect(() => {
    if (now) { setReady(true); return }
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback
    if (idle) { idle(() => setReady(true), { timeout: 2500 }); return }
    const timer = window.setTimeout(() => setReady(true), 600)
    return () => window.clearTimeout(timer)
  }, [now])
  const { items, status, name } = useGalleryItems(userId, ready)
  // The page the gallery page was last on, so a pan out of it lands on the very same paintings.
  const page = useWallPage(userId, 1 << 20)
  const isOwner = Boolean(user?.id && user.id === userId)
  return <GalleryWall inert items={items} page={page} loading={status === 'loading'} failed={status === 'error'} empty={<WallEmpty isOwner={isOwner} ownerName={name} />} />
}
