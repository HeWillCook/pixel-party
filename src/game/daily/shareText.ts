export const SHARE_URL = 'https://pixle.app.space'

export interface ShareTextInput {
  day: string
  prompt: string
  /** Haiku's blind guess for the drawing; omitted from the text when empty. */
  guess?: string | null
  score: number
  /** Only shown when a current streak is already known on the client. */
  streak?: number | null
}

/** The Wordle-style Daily result, ready for the share sheet or the clipboard. */
export function buildShareText({ day, prompt, guess, score, streak }: ShareTextInput): string {
  const lines = [`Pixle ${day} · "${prompt}"`]
  const trimmed = guess?.trim()
  if (trimmed) lines.push(`Haiku guessed: "${trimmed}"`)
  lines.push(`Score ${Math.round(score)}/1000`)
  if (streak && streak > 0) lines.push(`🔥 ${streak}-day streak`)
  lines.push(SHARE_URL)
  return lines.join('\n')
}
