import { P } from '../../scene/palette'
import { defineSprite } from '../../scene/sprite'

/** Small 12x12 scene objects for the tour cards, drawn from the same palette as the porch. */
const ink = {
  a: P.wood[0],
  b: P.wood[2],
  c: P.wood[4],
  d: P.paper[4],
  e: P.sun[3],
  f: P.sun[1],
  g: P.sky[4],
  h: P.sky[5],
  i: P.foliage[3],
  j: P.flame[0],
  k: P.flame[2],
  l: P.paper[2],
}

/** Daily: a sun over the easel's canvas. */
export const dailyIllustration = defineSprite([
  '.....ee.....',
  '....eeee....',
  '.....ee.....',
  '..aaaaaaaa..',
  '..abbbbbba..',
  '..abffffba..',
  '..abfggfba..',
  '..abffffba..',
  '..abbbbbba..',
  '..aaaaaaaa..',
  '.....cc.....',
  '....c..c....',
], ink)

/** Scores: a medal on its ribbon. */
export const scoresIllustration = defineSprite([
  '..aa....aa..',
  '..ab....ba..',
  '...ab..ba...',
  '....abba....',
  '...aaaaaa...',
  '..abbbbbba..',
  '.abeeeeebba.',
  '.abefffeeba.',
  '.abefffeeba.',
  '.abeeeeebba.',
  '..abbbbbba..',
  '...aaaaaa...',
], ink)

/** Party: a paint palette with two brushes. */
export const partyIllustration = defineSprite([
  '....aaaa....',
  '...abbbba...',
  '..abddddba..',
  '.abdjddkdba.',
  '.abddddddba.',
  '.abdjdkddba.',
  '..abddddba..',
  '...abbbba...',
  '....aaaa....',
  '....cc......',
  '...cc.......',
  '..cc........',
], ink)

/** Gallery: a painting in a frame, hanging from a nail. */
export const galleryIllustration = defineSprite([
  '.....aa.....',
  '.....aa.....',
  '..aaaaaaaa..',
  '..abbbbbba..',
  '..abggggba..',
  '..abgggbba..',
  '..abggbbba..',
  '..abgbbbba..',
  '..abbbbbba..',
  '..aaaaaaaa..',
  '.....cc.....',
  '.....cc.....',
], ink)

export const tourIllustrations = [dailyIllustration, scoresIllustration, partyIllustration, galleryIllustration] as const
