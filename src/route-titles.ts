import { APP_NAME } from './constants'

/**
 * The tab title for an app route, so browser history and the tab strip tell the screens apart. A gallery (its owner's name is data) and
 * the 404 set their own; they get `null` here. The landing page sets its own through `seo`.
 */
export function routeTitle(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/home') return `Today's Daily · ${APP_NAME}`
  if (path === '/scores') return `Scores · ${APP_NAME}`
  if (path === '/settings') return `Settings · ${APP_NAME}`
  if (path === '/party') return `Party · ${APP_NAME}`
  if (path.startsWith('/r/')) return `Party room · ${APP_NAME}`
  return null
}

/** The gallery's title: "Your gallery", "<Name>'s gallery", or a bare "Gallery" while the name is unknown. */
export function galleryTitle(isOwner: boolean, name?: string): string {
  return `${isOwner ? 'Your gallery' : name ? `${name}'s gallery` : 'Gallery'} · ${APP_NAME}`
}
