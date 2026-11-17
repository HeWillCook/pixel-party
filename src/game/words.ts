export interface WordEntry {
  word: string
  synonyms: string[]
  tier: 'easy' | 'medium'
}

export const WORDS: WordEntry[] = [
  { word: 'house', synonyms: ['home', 'cottage', 'cabin'], tier: 'easy' },
  { word: 'tree', synonyms: ['oak tree', 'pine tree'], tier: 'easy' },
  { word: 'sun', synonyms: ['sunshine', 'sunny'], tier: 'easy' },
  { word: 'cat', synonyms: ['kitty', 'kitten'], tier: 'easy' },
  { word: 'fish', synonyms: ['goldfish', 'trout'], tier: 'easy' },
  { word: 'heart', synonyms: ['love heart'], tier: 'easy' },
  { word: 'star', synonyms: ['gold star'], tier: 'easy' },
  { word: 'moon', synonyms: ['crescent moon', 'full moon'], tier: 'easy' },
  { word: 'apple', synonyms: ['red apple'], tier: 'easy' },
  { word: 'car', synonyms: ['automobile', 'sedan'], tier: 'easy' },
  { word: 'boat', synonyms: ['sailboat', 'ship'], tier: 'easy' },
  { word: 'flower', synonyms: ['daisy', 'tulip', 'rose'], tier: 'easy' },
  { word: 'cloud', synonyms: ['rain cloud'], tier: 'easy' },
  { word: 'hat', synonyms: ['cap', 'top hat'], tier: 'easy' },
  { word: 'cup', synonyms: ['mug', 'coffee mug'], tier: 'easy' },
  { word: 'key', synonyms: ['house key', 'skeleton key'], tier: 'easy' },
  { word: 'book', synonyms: ['novel', 'notebook'], tier: 'easy' },
  { word: 'ball', synonyms: ['soccer ball', 'beach ball'], tier: 'easy' },
  { word: 'clock', synonyms: ['watch', 'wall clock'], tier: 'easy' },
  { word: 'dog', synonyms: ['puppy', 'hound'], tier: 'easy' },
  { word: 'rocket', synonyms: ['spaceship', 'spacecraft'], tier: 'medium' },
  { word: 'pizza', synonyms: ['pizza slice', 'pepperoni pizza'], tier: 'medium' },
  { word: 'lighthouse', synonyms: ['light house', 'beacon tower'], tier: 'medium' },
  { word: 'umbrella', synonyms: ['parasol'], tier: 'medium' },
  { word: 'crown', synonyms: ['tiara', 'royal crown'], tier: 'medium' },
  { word: 'sword', synonyms: ['blade', 'dagger'], tier: 'medium' },
  { word: 'ghost', synonyms: ['phantom', 'spirit'], tier: 'medium' },
  { word: 'snowman', synonyms: ['snow man', 'frosty'], tier: 'medium' },
  { word: 'bicycle', synonyms: ['bike', 'cycle'], tier: 'medium' },
  { word: 'castle', synonyms: ['fortress', 'palace'], tier: 'medium' },
  { word: 'camera', synonyms: ['photo camera'], tier: 'medium' },
  { word: 'guitar', synonyms: ['electric guitar', 'acoustic guitar'], tier: 'medium' },
  { word: 'cactus', synonyms: ['saguaro'], tier: 'medium' },
  { word: 'butterfly', synonyms: ['moth', 'monarch'], tier: 'medium' },
  { word: 'mushroom', synonyms: ['toadstool', 'fungi'], tier: 'medium' },
  { word: 'anchor', synonyms: ['ship anchor', 'boat anchor'], tier: 'medium' },
]

/**
 * Normalizes a guess or target phrase by lowercasing, replacing hyphens with
 * spaces, stripping punctuation, collapsing whitespace, and dropping a leading
 * article (`a `, `an `, `the `).
 *
 * Intentionally does NOT singularize: unconditional suffix stripping is lossy
 * (e.g., "glass" or "glasses" vs "houses"). Plural variants are handled solely
 * inside `matchGuess`'s candidate set.
 */
export function normalizeGuess(s: string): string {
  return s
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:a|an|the)\s+/, '')
}

function buildCandidates(normalized: string): Set<string> {
  const baseVariants = [normalized]
  if (normalized.endsWith('s') && normalized.length > 1) {
    baseVariants.push(normalized.slice(0, -1))
  }
  if (normalized.endsWith('es') && normalized.length > 2) {
    baseVariants.push(normalized.slice(0, -2))
  }

  const candidates = new Set<string>()
  for (const variant of baseVariants) {
    if (variant) {
      candidates.add(variant)
      const compact = variant.replace(/\s+/g, '')
      if (compact) {
        candidates.add(compact)
      }
    }
  }
  return candidates
}

export function matchGuess(guess: string, entry: WordEntry): boolean {
  const g = normalizeGuess(guess)
  if (!g) return false

  const candidates = buildCandidates(g)
  const targets = [entry.word, ...entry.synonyms]

  for (const rawTarget of targets) {
    const target = normalizeGuess(rawTarget)
    if (!target) continue
    if (candidates.has(target) || candidates.has(target.replace(/\s+/g, ''))) {
      return true
    }
  }
  return false
}

/**
 * Picks a word from `WORDS` excluding any entries in `exclude`.
 * Safety net: if every word in `WORDS` is excluded, falls back to the full
 * `WORDS` list rather than throwing (rooms only exclude recent words).
 */
export function pickWord(rng: () => number, exclude: string[]): WordEntry {
  const excluded = new Set(exclude.map((w) => normalizeGuess(w)))
  const available = WORDS.filter((entry) => !excluded.has(normalizeGuess(entry.word)))
  const pool = available.length > 0 ? available : WORDS
  const idx = Math.max(0, Math.min(pool.length - 1, Math.floor(rng() * pool.length)))
  return pool[idx]
}
