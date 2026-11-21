import { DAILY, JUDGE } from '../config'

export interface DailyJudgeBody {
  model: string
  max_tokens: number
  temperature: number
  system: string
  messages: [
    {
      role: 'user'
      content: [
        { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } },
        { type: 'text'; text: string }
      ]
    }
  ]
}

export const BLIND_SYSTEM =
  'You are guessing a 32x32 pixel-art drawing made by one person for a guessing game. Ignore isolated stray pixels; they may be noise. If the image is entirely blank (no colored pixels drawn), reply with {"guess": ""}. Reply with raw JSON only, no markdown fences: {"guess": "short phrase"}.'

export const BLIND_USER_TEXT =
  'What is this a drawing of? Reply with raw JSON only: {"guess": "short phrase"}.'

export const SCORE_SYSTEM =
  'You judge a 32x32 pixel-art drawing for a daily challenge. Score strictly against the rubric; never inflate.\n' +
  '\n' +
  'fit (0-100): how much of the prompt (subject plus the detail it asks for) is actually drawn.\n' +
  '- 0-15: scribbles, unrelated marks, or nearly blank.\n' +
  '- 20-40: crude or minimal, missing the key details, only loosely readable.\n' +
  '- 45-65: clearly recognizable subject with basic detail.\n' +
  '- 70-85: strong detail and a clear match to the prompt.\n' +
  '- 86-100: standout composition and pixel craft; reserve for excellent work only.\n' +
  '\n' +
  'recognition (0-100): how close the blind guess is to the target subject.\n' +
  '- 0: the blind guess missed the subject completely; a wrong guess must never score above 0 here.\n' +
  '- 35-60: only a closely related subject or visual cousin of the target.\n' +
  '- 75-100: exact subject or a clear synonym.\n' +
  '\n' +
  'If recognition is 0, the drawing is unrecognizable, so fit must stay low (at most 55).\n' +
  'If the image is entirely blank (no colored pixels drawn), reply with {"fit": 0, "recognition": 0, "reason": "Nothing is drawn yet"}.\n' +
  `The reason is ONE sentence addressed to the player, at most ${DAILY.reasonMaxChars} characters including spaces; it is shown in a small box, so shorter is better.\n` +
  `Reply with raw JSON only, no markdown fences: {"fit": number, "recognition": number, "reason": "one sentence, at most ${DAILY.reasonMaxChars} characters"}.`

export function buildBlindBody(pngBase64: string): DailyJudgeBody {
  return {
    model: JUDGE.model,
    max_tokens: JUDGE.maxTokens,
    temperature: 0,
    system: BLIND_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
          { type: 'text', text: BLIND_USER_TEXT },
        ],
      },
    ],
  }
}

export function buildScoreBody(pngBase64: string, prompt: string, subject: string, guess: string): DailyJudgeBody {
  const userText =
    `Prompt: ${prompt}\n` +
    `Subject: ${subject}\n` +
    `Blind guess: ${guess}\n` +
    `Reply with raw JSON only: {"fit": number, "recognition": number, "reason": "one sentence, at most ${DAILY.reasonMaxChars} characters"}.`

  return {
    model: JUDGE.model,
    max_tokens: JUDGE.maxTokens,
    temperature: 0,
    system: SCORE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
          { type: 'text', text: userText },
        ],
      },
    ],
  }
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function parseClampedPercent(raw: unknown): number | null {
  if (typeof raw !== 'number' && (typeof raw !== 'string' || raw.trim() === '')) return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, value))
}

export function parseBlind(text: string): { guess: string } | null {
  const parsed = extractJsonObject(text)
  if (!parsed || typeof parsed.guess !== 'string') return null
  const guess = parsed.guess.trim()
  return guess.length > 0 ? { guess } : null
}

const DANGLING = /(?:^|\s)(?:a|an|the|and|or|but|though|although|while|with|without|of|to|in|on|at|for|from|is|are|was|were|that|which|as|by|could|would|might|needs?)$/i

/**
 * Fit a judge reason into `max` characters without cutting a word: keep whole sentences, else cut at the last clause (a comma past
 * the middle) or word and add "…". A cut never ends on a dangling "and", "the", "though" ("…though the puddle and…").
 */
export function clampReason(text: string, max: number = DAILY.reasonMaxChars): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const head = clean.slice(0, max)
  const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '))
  if (stop >= max * 0.4) return head.slice(0, stop + 1)
  const room = clean.slice(0, max - 1)
  const comma = room.lastIndexOf(', ')
  const space = room.lastIndexOf(' ')
  let words = comma >= max * 0.5 ? room.slice(0, comma) : space > 0 && clean[max - 1] !== ' ' ? room.slice(0, space) : room
  // Drop trailing function words (only while enough text is left to read as a phrase).
  for (let guard = 0; guard < 4; guard++) {
    const trimmed = words.replace(/[\s,;:\-–—]+$/, '')
    const match = DANGLING.exec(trimmed)
    if (!match || trimmed.length - match[0].length < max * 0.3) { words = trimmed; break }
    words = trimmed.slice(0, trimmed.length - match[0].length)
  }
  return `${words.replace(/[\s,;:\-–—]+$/, '')}…`
}

export function parseScore(text: string): { fit: number; recognition: number; reason: string } | null {
  const parsed = extractJsonObject(text)
  if (!parsed) return null
  const fit = parseClampedPercent(parsed.fit)
  const recognition = parseClampedPercent(parsed.recognition)
  if (fit === null || recognition === null) return null
  if (typeof parsed.reason !== 'string') return null
  const reason = clampReason(parsed.reason)
  if (reason.length === 0) return null
  return { fit, recognition, reason }
}
