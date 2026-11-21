/**
 * Haiku's non-scoring voice during the Daily: canned lines at fixed moments, plus the final verdict
 * choreography. Nothing here touches the score — the same lines are used when a model peek fails.
 */

export type CannedMoment = 'start' | 'minute' | 'halfway' | 'thirty_left' | 'ten_left'

export const HAIKU_LINES: Record<CannedMoment, readonly string[]> = {
  start: [
    'Five minutes on the clock. Make it count — I am watching.',
    'Brush down, ears up. Show me something.',
    'The canvas is blank and so is my mind. Delight me.',
  ],
  minute: [
    'One minute in and I already have opinions. Keep going.',
    'A promising start. Do not get cocky.',
    'I see shapes! Continue until they make sense.',
  ],
  halfway: [
    'Halfway. My whiskers are tingling.',
    'Noted. Now surprise me in the second half.',
    'That is a start. The second half is where paintings happen.',
  ],
  thirty_left: [
    'Thirty seconds. The paint is setting.',
    'Half a minute! Finish that bit in the corner.',
    'Thirty seconds — do not start anything new.',
  ],
  ten_left: [
    'Ten seconds. Paws off the palette.',
    'Ten seconds! Step away from the canvas.',
    'Ten seconds. I am putting on my judging face.',
  ],
}

/** The canned fallback when a model peek cannot answer. */
export const PEEK_FALLBACK_LINES: readonly string[] = [
  'Ooh, that is coming along nicely.',
  'I am squinting. In a supportive way.',
  'Do not look now, but I think it is working.',
  'A bold choice. I respect it.',
]

/**
 * The verdict choreography Haiku plays when the final judgement arrives: a suspense line, a beat,
 * then the guess, then the score. Reduced motion skips the beat entirely.
 */
export const FINAL_SUSPENSE_LINE = 'The paint is dry. I have reached… a verdict.'

/** A canned, non-scoring line for the halfway verdict, picked in order so it never repeats within an attempt. */
export function cannedLine(moment: CannedMoment, index = 0): string {
  const lines = HAIKU_LINES[moment]
  return lines[Math.abs(index) % lines.length]!
}

export function peekFallbackLine(index = 0): string {
  return PEEK_FALLBACK_LINES[Math.abs(index) % PEEK_FALLBACK_LINES.length]!
}

/** Canned moments that are driven by elapsed time (start and halfway are triggered by the attempt/verdict instead). */
export const TIMED_MOMENTS_MS = {
  minute: 60_000,
  thirty_left: 270_000,
  ten_left: 290_000,
} as const satisfies Partial<Record<CannedMoment, number>>

export type TimedMoment = keyof typeof TIMED_MOMENTS_MS

/**
 * Each timed moment exactly once: the hook remembers the last elapsed time it checked, and fires a
 * moment when the clock crosses it (so a throttled tab still gets the line it missed).
 */
export function momentsCrossed(previousElapsedMs: number, elapsedMs: number): TimedMoment[] {
  if (elapsedMs <= previousElapsedMs) return []
  return (Object.entries(TIMED_MOMENTS_MS) as [TimedMoment, number][])
    .filter(([, at]) => previousElapsedMs < at && elapsedMs >= at)
    .sort((left, right) => left[1] - right[1])
    .map(([moment]) => moment)
}

/** How long the "suspense beat" holds before Haiku reveals the guess. */
export function verdictBeatMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : 2_500
}

/** How long the guess is held before the score lands. */
export function verdictGuessMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : 1_400
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
