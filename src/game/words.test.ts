import { describe, expect, it } from 'vitest'
import { matchGuess, normalizeGuess, pickWord, WORDS } from './words'

const FORBIDDEN_PROMPT_WORDS = ['pixel', 'canvas', 'noise', 'drawing', 'art', 'blank', 'guess']

describe('words', () => {
  it('provides at least 30 drawable nouns without forbidden prompt words', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(30)
    const seen = new Set<string>()
    for (const entry of WORDS) {
      expect(['easy', 'medium']).toContain(entry.tier)
      expect(seen.has(entry.word)).toBe(false)
      seen.add(entry.word)
      for (const forbidden of FORBIDDEN_PROMPT_WORDS) {
        expect(entry.word.toLowerCase()).not.toBe(forbidden)
        for (const syn of entry.synonyms) {
          expect(syn.toLowerCase()).not.toBe(forbidden)
        }
      }
    }
  })

  it('matches every WORDS entry to its own word and synonyms', () => {
    for (const entry of WORDS) {
      expect(matchGuess(entry.word, entry)).toBe(true)
      for (const syn of entry.synonyms) {
        expect(matchGuess(syn, entry)).toBe(true)
      }
    }
  })

  it('normalizes case, punctuation, spacing, and leading articles', () => {
    expect(normalizeGuess('  The   Lighthouse! ')).toBe('lighthouse')
    expect(normalizeGuess('an apple.')).toBe('apple')
    expect(normalizeGuess('a   Light-House?')).toBe('light house')
  })

  it('matches lighthouse variants and rejects non-matches (Review Focus 4)', () => {
    const lh = { word: 'lighthouse', synonyms: ['light house', 'beacon tower'], tier: 'medium' as const }
    for (const g of ['Lighthouses', 'a lighthouse', 'Light house', 'LIGHTHOUSE.', ' the lighthouse ']) {
      expect(matchGuess(g, lh)).toBe(true)
    }
    for (const g of ['lighthouse keeper', 'house', 'tower']) {
      expect(matchGuess(g, lh)).toBe(false)
    }
  })

  it('handles plural s vs es safely without mangling words like houses or glasses', () => {
    const house = { word: 'house', synonyms: ['home'], tier: 'easy' as const }
    expect(matchGuess('houses', house)).toBe(true)
    expect(matchGuess('hous', house)).toBe(false)

    const glass = { word: 'glass', synonyms: ['cup'], tier: 'easy' as const }
    expect(matchGuess('glasses', glass)).toBe(true)

    const glasses = { word: 'glasses', synonyms: ['spectacles'], tier: 'medium' as const }
    expect(matchGuess('glasses', glasses)).toBe(true)
  })

  it('pickWord never returns an excluded word when alternatives remain', () => {
    const exclude = WORDS.slice(0, WORDS.length - 1).map((w) => w.word)
    const remaining = WORDS[WORDS.length - 1]
    expect(pickWord(() => 0, exclude)).toEqual(remaining)
    expect(pickWord(() => 0.9999, exclude)).toEqual(remaining)
  })
})
