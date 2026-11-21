/**
 * Daily score parts (0-1000 total), prompt-match first, art quality scaling it.
 *
 * - `matchPoints` (0-500): how much of the prompt is actually drawn, weighted with how recognizable
 *   the blind guess found it.
 * - `qualityBonus` (0-500): pixel-art craft, paid only in proportion to the prompt match, so a
 *   beautiful drawing of the wrong thing earns almost nothing.
 *
 * There is no speed component: the attempt always runs the full five minutes.
 */
export interface GradeParts {
  /** Raw judge percent for the prompt (0-100), before the points conversion. */
  match: number
  /** Raw judge percent for craft (0-100). */
  quality: number
  /** Raw blind-guess recognition percent (0-100). */
  recognition: number
  /** Weighted prompt score (0-100) that matchPoints derives from. */
  promptScore: number
  matchPoints: number
  qualityBonus: number
  total: number
}

/**
 * An unrecognizable drawing (the blind guess missed the subject entirely) can never look like a
 * strong answer: its prompt score is capped, which caps the quality bonus too (max 300 total).
 */
const UNRECOGNIZED_PROMPT_CAP = 30

export function gradeScore(raw: { match: number; recognition: number; quality: number }): GradeParts {
  const clamp = (value: number) => Math.min(100, Math.max(0, value))
  const match = clamp(raw.match)
  const recognition = clamp(raw.recognition)
  const quality = clamp(raw.quality)

  const weighted = Math.round(0.6 * match + 0.4 * recognition)
  const promptScore = recognition <= 0 ? Math.min(UNRECOGNIZED_PROMPT_CAP, weighted) : weighted
  const matchPoints = promptScore * 5
  const qualityBonus = Math.round((matchPoints * quality) / 100)
  return { match, recognition, quality, promptScore, matchPoints, qualityBonus, total: matchPoints + qualityBonus }
}

/** Zero-score parts for a blank canvas: nothing drawn can never earn a quality bonus. */
export function blankGradeParts(): GradeParts {
  return { match: 0, recognition: 0, quality: 0, promptScore: 0, matchPoints: 0, qualityBonus: 0, total: 0 }
}
