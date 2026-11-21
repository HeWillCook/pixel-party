export interface WordEntry {
  word: string
  synonyms: string[]
  tier: 'easy' | 'medium' | 'hard'
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
  // Medium: one clear shape with a couple of recognizable parts.
  { word: 'fox', synonyms: ['red fox', 'fox cub'], tier: 'medium' },
  { word: 'owl', synonyms: ['barn owl', 'hoot owl'], tier: 'medium' },
  { word: 'whale', synonyms: ['blue whale', 'humpback whale'], tier: 'medium' },
  { word: 'penguin', synonyms: ['emperor penguin'], tier: 'medium' },
  { word: 'turtle', synonyms: ['tortoise', 'sea turtle'], tier: 'medium' },
  { word: 'snail', synonyms: ['garden snail'], tier: 'medium' },
  { word: 'bee', synonyms: ['honeybee', 'honey bee', 'bumblebee'], tier: 'medium' },
  { word: 'squirrel', synonyms: ['tree squirrel'], tier: 'medium' },
  { word: 'hedgehog', synonyms: ['hedge hog'], tier: 'medium' },
  { word: 'koala', synonyms: ['koala bear'], tier: 'medium' },
  { word: 'panda', synonyms: ['panda bear', 'giant panda'], tier: 'medium' },
  { word: 'giraffe', synonyms: ['baby giraffe'], tier: 'medium' },
  { word: 'zebra', synonyms: ['striped horse'], tier: 'medium' },
  { word: 'kangaroo', synonyms: ['roo'], tier: 'medium' },
  { word: 'dolphin', synonyms: ['porpoise'], tier: 'medium' },
  { word: 'shark', synonyms: ['great white', 'great white shark'], tier: 'medium' },
  { word: 'crocodile', synonyms: ['croc', 'alligator'], tier: 'medium' },
  { word: 'elephant', synonyms: ['tusked elephant'], tier: 'medium' },
  { word: 'dinosaur', synonyms: ['dino', 't rex', 'tyrannosaurus'], tier: 'medium' },
  { word: 'dragon', synonyms: ['drake', 'wyvern'], tier: 'medium' },
  { word: 'phoenix', synonyms: ['firebird', 'fire bird'], tier: 'medium' },
  { word: 'peacock', synonyms: ['peahen'], tier: 'medium' },
  { word: 'rabbit', synonyms: ['bunny', 'bunny rabbit', 'hare'], tier: 'medium' },
  { word: 'monkey', synonyms: ['cheeky monkey'], tier: 'medium' },
  { word: 'frog', synonyms: ['toad'], tier: 'medium' },
  { word: 'spider', synonyms: ['tarantula'], tier: 'medium' },
  { word: 'robot', synonyms: ['android', 'droid', 'bot'], tier: 'medium' },
  { word: 'mermaid', synonyms: ['sea maiden'], tier: 'medium' },
  { word: 'wizard', synonyms: ['sorcerer', 'magician'], tier: 'medium' },
  { word: 'witch', synonyms: ['sorceress'], tier: 'medium' },
  { word: 'pirate', synonyms: ['buccaneer'], tier: 'medium' },
  { word: 'knight', synonyms: ['armored knight'], tier: 'medium' },
  { word: 'ninja', synonyms: ['shinobi'], tier: 'medium' },
  { word: 'viking', synonyms: ['norseman'], tier: 'medium' },
  // Hard: still drawable at 32x32, but needs a few recognizable parts.
  { word: 'octopus', synonyms: ['octopi', 'devilfish'], tier: 'hard' },
  { word: 'astronaut', synonyms: ['spaceman', 'space woman', 'cosmonaut'], tier: 'hard' },
  { word: 'skateboard', synonyms: ['skate board', 'skater', 'skateboarding'], tier: 'hard' },
  { word: 'volcano', synonyms: ['erupting volcano', 'lava mountain'], tier: 'hard' },
  { word: 'waterfall', synonyms: ['water fall', 'cascade', 'falls'], tier: 'hard' },
  { word: 'hot air balloon', synonyms: ['balloon', 'air balloon'], tier: 'hard' },
  { word: 'submarine', synonyms: ['sub', 'u boat'], tier: 'hard' },
  { word: 'windmill', synonyms: ['wind mill', 'mill'], tier: 'hard' },
  { word: 'scarecrow', synonyms: ['scare crow', 'straw man'], tier: 'hard' },
  { word: 'treasure chest', synonyms: ['chest', 'treasure box', 'treasure'], tier: 'hard' },
  { word: 'campfire', synonyms: ['camp fire', 'bonfire', 'fire'], tier: 'hard' },
  { word: 'igloo', synonyms: ['snow house', 'ice house', 'snow hut'], tier: 'hard' },
  { word: 'tornado', synonyms: ['twister', 'cyclone', 'funnel cloud'], tier: 'hard' },
  { word: 'unicorn', synonyms: ['horned horse', 'unicorn horse'], tier: 'hard' },
  { word: 'ferris wheel', synonyms: ['fair wheel', 'wheel'], tier: 'hard' },
  { word: 'telescope', synonyms: ['spyglass', 'spy glass', 'scope'], tier: 'hard' },
  { word: 'helicopter', synonyms: ['chopper', 'copter'], tier: 'hard' },
  { word: 'motorcycle', synonyms: ['motorbike', 'motor bike'], tier: 'hard' },
  { word: 'firetruck', synonyms: ['fire truck', 'fire engine'], tier: 'hard' },
  { word: 'ambulance', synonyms: ['emergency van'], tier: 'hard' },
  { word: 'tractor', synonyms: ['farm tractor'], tier: 'hard' },
  { word: 'bulldozer', synonyms: ['dozer', 'digger'], tier: 'hard' },
  { word: 'parachute', synonyms: ['chute'], tier: 'hard' },
  { word: 'satellite', synonyms: ['space satellite'], tier: 'hard' },
  { word: 'planet', synonyms: ['ringed planet'], tier: 'hard' },
  { word: 'galaxy', synonyms: ['spiral galaxy', 'milky way'], tier: 'hard' },
  { word: 'pirate ship', synonyms: ['pirate boat', 'galleon', 'ship'], tier: 'hard' },
  { word: 'sandcastle', synonyms: ['sand castle', 'castle'], tier: 'hard' },
  { word: 'snow globe', synonyms: ['snowglobe', 'snow dome'], tier: 'hard' },
  { word: 'jack o lantern', synonyms: ['halloween pumpkin', 'pumpkin'], tier: 'hard' },
  { word: 'gingerbread house', synonyms: ['gingerbread', 'candy house', 'cookie house'], tier: 'hard' },
  { word: 'nutcracker', synonyms: ['nut cracker', 'toy soldier'], tier: 'hard' },
  { word: 'rocking horse', synonyms: ['hobby horse', 'horse'], tier: 'hard' },
  { word: 'grandfather clock', synonyms: ['tall clock', 'longcase clock', 'clock'], tier: 'hard' },
  { word: 'headphones', synonyms: ['head phones', 'earphones', 'headset'], tier: 'hard' },
  { word: 'microphone', synonyms: ['mic', 'mike', 'micro phone'], tier: 'hard' },
  { word: 'saxophone', synonyms: ['sax'], tier: 'hard' },
  { word: 'accordion', synonyms: ['squeezebox', 'squeeze box'], tier: 'hard' },
  { word: 'piano', synonyms: ['grand piano'], tier: 'hard' },
  { word: 'violin', synonyms: ['fiddle'], tier: 'hard' },
  { word: 'harp', synonyms: ['lyre'], tier: 'hard' },
  { word: 'jukebox', synonyms: ['juke box'], tier: 'hard' },
  { word: 'boombox', synonyms: ['boom box', 'radio'], tier: 'hard' },
  { word: 'typewriter', synonyms: ['type writer', 'writing machine'], tier: 'hard' },
  { word: 'sewing machine', synonyms: ['stitching machine'], tier: 'hard' },
  { word: 'washing machine', synonyms: ['washer', 'laundry machine'], tier: 'hard' },
  { word: 'microscope', synonyms: ['micro scope'], tier: 'hard' },
  { word: 'compass', synonyms: ['magnetic compass'], tier: 'hard' },
  { word: 'hourglass', synonyms: ['hour glass', 'sand timer', 'sandglass'], tier: 'hard' },
  { word: 'traffic light', synonyms: ['stop light', 'traffic signal'], tier: 'hard' },
]

/** Normalizes a guess or target phrase by lowercasing, replacing hyphens with
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

/** Round mix: roughly 20% easy, 45% medium, 35% hard. */
const TIER_CUTOFFS: ReadonlyArray<{ tier: WordEntry['tier']; upTo: number }> = [
  { tier: 'easy', upTo: 0.2 },
  { tier: 'medium', upTo: 0.65 },
  { tier: 'hard', upTo: 1 },
]

function tierForRoll(roll: number): WordEntry['tier'] {
  return (TIER_CUTOFFS.find((cutoff) => roll < cutoff.upTo) ?? TIER_CUTOFFS[TIER_CUTOFFS.length - 1]!).tier
}

/**
 * Picks a word from `WORDS` excluding any entries in `exclude`, skewing rounds
 * harder (about 20% easy, 45% medium, 35% hard). If the rolled tier has no
 * available word, any remaining word is used; if every word is excluded, the
 * full list is used rather than throwing (rooms only exclude recent words).
 */
export function pickWord(rng: () => number, exclude: string[]): WordEntry {
  const excluded = new Set(exclude.map((w) => normalizeGuess(w)))
  const available = WORDS.filter((entry) => !excluded.has(normalizeGuess(entry.word)))
  const source = available.length > 0 ? available : WORDS
  const tier = tierForRoll(rng())
  const rolled = source.filter((entry) => entry.tier === tier)
  const pool = rolled.length > 0 ? rolled : source
  const idx = Math.max(0, Math.min(pool.length - 1, Math.floor(rng() * pool.length)))
  return pool[idx]!
}
