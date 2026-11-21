import { describe, expect, it } from 'vitest'
import { galleryTitle, routeTitle } from './route-titles'

describe('routeTitle', () => {
  it('names every app screen', () => {
    expect(routeTitle('/home')).toBe("Today's Daily · Pixel Party")
    expect(routeTitle('/scores')).toBe('Scores · Pixel Party')
    expect(routeTitle('/settings/')).toBe('Settings · Pixel Party')
    expect(routeTitle('/party')).toBe('Party · Pixel Party')
    expect(routeTitle('/r/ABCD')).toBe('Party room · Pixel Party')
  })
  it('leaves galleries and the 404 to their own pages', () => {
    expect(routeTitle('/u/host')).toBeNull()
    expect(routeTitle('/nope')).toBeNull()
  })
  it('titles a gallery by whose wall it is', () => {
    expect(galleryTitle(true)).toBe('Your gallery · Pixel Party')
    expect(galleryTitle(false, 'Ada')).toBe("Ada's gallery · Pixel Party")
    expect(galleryTitle(false)).toBe('Gallery · Pixel Party')
  })
})
