/** What Haiku, the porch cat, says when you say hello: who he is the first time, then something about today (or yesterday), by turns. */
export interface HaikuFacts {
  /** The player's own best today, once their attempt is over (0 when not). */
  best?: number
  /** The best score anyone has today (0 when nobody has one yet). */
  top?: number
  /** The player's score for yesterday's painting (0 when they did not paint). */
  yesterday?: number
}

export const HAIKU_INTRO = "Hi, I'm Haiku. I judge the Daily."
const FALLBACK = 'Welcome back! Paint for up to five minutes — submit whenever you’re happy.'

/**
 * `visit` counts the times he has been greeted before: the first is the introduction. Later ones go round whatever there is to
 * say, so he is not a broken record, and a player with nothing to report still gets a friendly line.
 */
export function haikuGreeting(facts: HaikuFacts, visit: number): string {
  if (visit <= 0) return HAIKU_INTRO
  const lines: string[] = []
  if ((facts.best ?? 0) > 0) lines.push(`You got ${facts.best} today. Nice painting!`)
  if ((facts.yesterday ?? 0) > 0) lines.push(`Your painting from yesterday got ${facts.yesterday}!`)
  if ((facts.top ?? 0) > 0) lines.push(`Today's top score is ${facts.top}. Can you beat it?`)
  if (!lines.length) lines.push(FALLBACK)
  return lines[(visit - 1) % lines.length]
}

const VISITS_KEY = 'pixle:haiku-visits'

/** How many times Haiku has greeted this browser (kept in localStorage; 0 when it is unavailable). */
export function readHaikuVisits(): number {
  try { return Number(window.localStorage.getItem(VISITS_KEY)) || 0 } catch { return 0 }
}

export function countHaikuVisit(): void {
  try { window.localStorage.setItem(VISITS_KEY, String(readHaikuVisits() + 1)) } catch { /* private mode: he introduces himself again */ }
}
