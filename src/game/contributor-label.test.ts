import { describe, expect, it } from 'vitest'
import { contributorLabel } from './contributor-label'

describe('contributor label', () => {
  it('uses the round contributor count and leaves an unknown count unnumbered', () => {
    expect(contributorLabel(1, 4)).toBe('1 painter (4 px on canvas)')
    expect(contributorLabel(3, 4)).toBe('3 painters (4 px on canvas)')
    expect(contributorLabel(undefined, 4)).toBe('Painters (4 px on canvas)')
  })
})
