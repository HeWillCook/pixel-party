import { describe, expect, it } from 'vitest'
import { matchGuess, normalizeGuess, pickWord, spellsAny, WORDS, type WordEntry } from './words'

const FORBIDDEN_PROMPT_WORDS = ['pixel', 'canvas', 'noise', 'drawing', 'art', 'blank', 'guess']

function entryFor(word: string): WordEntry {
  const entry = WORDS.find((candidate) => candidate.word === word)
  if (!entry) throw new Error(`missing word: ${word}`)
  return entry
}

function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

describe('words', () => {
  it('provides at least 110 drawable nouns without forbidden prompt words', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(110)
    const seen = new Set<string>()
    for (const entry of WORDS) {
      expect(['easy', 'medium', 'hard']).toContain(entry.tier)
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

  it('has a deep pool in every tier, skewed toward medium and hard', () => {
    const count = (tier: WordEntry['tier']) => WORDS.filter((entry) => entry.tier === tier).length
    expect(count('easy')).toBeGreaterThanOrEqual(15)
    expect(count('medium')).toBeGreaterThanOrEqual(40)
    expect(count('hard')).toBeGreaterThanOrEqual(40)
    expect(count('medium') + count('hard')).toBeGreaterThan(count('easy') * 4)
  })

  it('matches every WORDS entry to its own word and synonyms', () => {
    for (const entry of WORDS) {
      expect(matchGuess(entry.word, entry)).toBe(true)
      for (const syn of entry.synonyms) {
        expect(matchGuess(syn, entry)).toBe(true)
      }
    }
  })

  it('normalizes case, punctuation, spacing, and leading articles without singularizing', () => {
    expect(normalizeGuess(' The  Lighthouse! ')).toBe('lighthouse')
    expect(normalizeGuess('cats')).toBe('cats')
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

  it('accepts reasonable guesses for the harder additions', () => {
    const cases: Array<[string, string[]]> = [
      ['hot air balloon', ['Balloons', 'a hot air balloon', 'an air balloon', 'hot-air-balloon']],
      ['treasure chest', ['a treasure chest', 'chest', 'Treasure box']],
      ['snow globe', ['snowglobe', 'A Snow Globe', 'snow globes']],
      ['ferris wheel', ['Ferris Wheel', 'ferriswheel', 'the wheel']],
      ['jack o lantern', ['jack-o-lantern', 'pumpkin', 'a jack o lantern']],
      ['washing machine', ['washer', 'Washing Machine']],
      ['headphones', ['head phones', 'earphones', 'a headset']],
      ['firetruck', ['fire truck', 'a fire engine']],
      ['sandcastle', ['sand castle', 'a castle']],
    ]
    for (const [word, guesses] of cases) {
      for (const guess of guesses) expect(matchGuess(guess, entryFor(word))).toBe(true)
    }
    expect(matchGuess('pumpkin', entryFor('ferris wheel'))).toBe(false)
  })

  it('pickWord never returns an excluded word when alternatives remain', () => {
    const exclude = WORDS.slice(0, WORDS.length - 1).map((w) => w.word)
    const remaining = WORDS[WORDS.length - 1]
    expect(pickWord(() => 0, exclude)).toEqual(remaining)
    expect(pickWord(() => 0.9999, exclude)).toEqual(remaining)
  })

  it('pickWord falls back to full WORDS list when every word is excluded', () => {
    const allWords = WORDS.map((w) => w.word)
    const picked = pickWord(() => 0.5, allWords)
    expect(WORDS).toContainEqual(picked)
  })

  it('pickWord falls back to another tier when the rolled tier is exhausted', () => {
    // Rolling a hard word when every hard word is excluded must not stall the round.
    const hardExcluded = WORDS.filter((entry) => entry.tier === 'hard').map((entry) => entry.word)
    expect(['easy', 'medium']).toContain(pickWord(() => 0.99, hardExcluded).tier)
    expect(['easy', 'medium']).toContain(pickWord(() => 0, hardExcluded).tier)

    // Likewise when only hard words remain, an easy or medium roll falls through to them.
    const onlyHardLeft = WORDS.filter((entry) => entry.tier !== 'hard').map((entry) => entry.word)
    expect(pickWord(() => 0, onlyHardLeft).tier).toBe('hard')
    expect(pickWord(() => 0.5, onlyHardLeft).tier).toBe('hard')
  })

  it('pickWord skews rounds harder: about 20% easy, 45% medium, 35% hard', () => {
    const rng = lcg(12345)
    const picks = Array.from({ length: 4000 }, () => pickWord(rng, []))
    const share = (tier: WordEntry['tier']) => picks.filter((pick) => pick.tier === tier).length / picks.length
    expect(share('easy')).toBeGreaterThan(0.16)
    expect(share('easy')).toBeLessThan(0.24)
    expect(share('medium')).toBeGreaterThan(0.41)
    expect(share('medium')).toBeLessThan(0.49)
    expect(share('hard')).toBeGreaterThan(0.31)
    expect(share('hard')).toBeLessThan(0.39)
  })
})

describe('spellsAny', () => {
  it('flags writing that spells the answer, ignoring case, spacing and punctuation', () => {
    expect(spellsAny('CLOCK', ['clock'])).toBe(true)
    expect(spellsAny('c l o c k!', ['clock'])).toBe(true)
    expect(spellsAny('LIGHT HOUSE', ['lighthouse'])).toBe(true)
    expect(spellsAny('my house', ['house', 'home'])).toBe(true)
    expect(spellsAny('HAMMERS', ['hammers'])).toBe(true)
  })
  it('lets other writing be part of the picture', () => {
    expect(spellsAny('12 3 6 9', ['clock', 'watch'])).toBe(false)
    expect(spellsAny('STORY', ['book', 'novel'])).toBe(false)
    expect(spellsAny('', ['clock'])).toBe(false)
    expect(spellsAny(undefined, ['clock'])).toBe(false)
    // Names under three letters are too short to call a spelling.
    expect(spellsAny('SUBWAY', ['sb'])).toBe(false)
  })
})
