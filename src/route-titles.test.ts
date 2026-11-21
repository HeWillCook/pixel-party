import { describe, expect, it } from 'vitest'
import { galleryTitle, routeTitle } from './route-titles'

describe('routeTitle', () => {
  it('names every app screen', () => {
    expect(routeTitle('/home')).toBe("Today's Daily · Pixle")
    expect(routeTitle('/scores')).toBe('Scores · Pixle')
    expect(routeTitle('/settings/')).toBe('Settings · Pixle')
    expect(routeTitle('/party')).toBe('Party · Pixle')
    expect(routeTitle('/r/ABCD')).toBe('Party room · Pixle')
  })
  it('leaves galleries and the 404 to their own pages', () => {
    expect(routeTitle('/u/host')).toBeNull()
    expect(routeTitle('/nope')).toBeNull()
  })
  it('titles a gallery by whose wall it is', () => {
    expect(galleryTitle(true)).toBe('Your gallery · Pixle')
    expect(galleryTitle(false, 'Ada')).toBe("Ada's gallery · Pixle")
    expect(galleryTitle(false)).toBe('Gallery · Pixle')
  })
})
