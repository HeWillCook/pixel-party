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

export type ScoreKind = 'halfway' | 'final'

/** Haiku's peeks are one playful line: never a score, never a number. */
export const PEEK_MAX_CHARS = 90

export const BLIND_SYSTEM =
  'You are guessing a 32x32 pixel-art drawing made by one person for a guessing game. Ignore isolated stray pixels; they may be noise. If the image is entirely blank (no colored pixels drawn), reply with {"guess": "", "writing": ""}. Also report any letters, words or numbers written in the image, exactly as written (spelling the answer is not drawing it), or an empty string when there are none. Reply with raw JSON only, no markdown fences: {"guess": "short phrase", "writing": "text as written, or empty"}.'

export const BLIND_USER_TEXT =
  'What is this a drawing of? Reply with raw JSON only: {"guess": "short phrase", "writing": "any letters, words or numbers written in the image, exactly as written, or empty"}.'

/** The verdict shown when a Daily drawing spells its answer: the guess is read, but it never scores. */
export const NO_SPELLING_REASON = 'No spelling — letters and numbers do not count. Draw it!'

export const SCORE_SYSTEM =
  'You judge a 32x32 pixel-art drawing for a daily challenge. The two scales are independent: how much of the PROMPT is drawn, and how well-drawn it is. Score strictly against the rubric; never inflate.\n' +
  '\n' +
  'match (0-100): how clearly and completely the drawing depicts the PROMPT (its subject plus the detail it asks for), regardless of craft. Judge the idea, not the execution.\n' +
  '- 0-15: scribbles, unrelated marks, or nearly blank.\n' +
  '- 20-40: only loosely related to the prompt, missing the asked detail.\n' +
  '- 45-65: the subject is clearly there with the basic asked detail.\n' +
  '- 70-85: the subject and the asked detail both read clearly and deliberately.\n' +
  '- 86-100: every part of the prompt is unmistakably depicted.\n' +
  '\n' +
  'quality (0-100): pixel-art craft only, regardless of the prompt. Consider composition, readable shapes, deliberate colour use, clean lines, coherent fills, and whether the drawing uses the 32x32 frame sensibly (not a tiny speck in a corner, not a muddy all-over texture).\n' +
  '- 0-15: no legible craft; noise, stray marks, or a blank field.\n' +
  '- 20-40: rough but readable, with little control of shape or colour.\n' +
  '- 45-65: competent pixel work; shapes and colours mostly hold together.\n' +
  '- 70-85: confident, clean pixel art with a clear focal point.\n' +
  '- 86-100: striking, polished pixel art; reserve for excellent work only.\n' +
  '\n' +
  'recognition (0-100): how close the blind guess is to the target subject.\n' +
  '- 0: the blind guess missed the subject completely; a wrong guess must never score above 0 here.\n' +
  '- 35-60: only a closely related subject or visual cousin of the target.\n' +
  '- 75-100: exact subject or a clear synonym.\n' +
  '\n' +
  'If the image is entirely blank (no colored pixels drawn), reply with {"match": 0, "recognition": 0, "quality": 0, "reason": "Nothing is drawn yet"}.\n' +
  `The reason is ONE sentence addressed to the player, at most ${DAILY.reasonMaxChars} characters including spaces; it is shown in a small box, so shorter is better.\n` +
  `Reply with raw JSON only, no markdown fences: {"match": number, "recognition": number, "quality": number, "reason": "one sentence, at most ${DAILY.reasonMaxChars} characters"}.`

export const PEEK_SYSTEM =
  'You are Haiku, a warm, cheeky cat art critic watching a person paint a 32x32 pixel-art drawing for a daily challenge. Look at the image and the prompt, then say ONE playful, encouraging line in character — a tiny observation or gentle nudge, never mean. Never mention scores, points, numbers, percentages, or grading. Never say what the prompt is outright. Reply with raw JSON only, no markdown fences: {"line": "one short sentence"}.\n' +
  `The line is at most ${PEEK_MAX_CHARS} characters including spaces.`

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

export function buildScoreBody(pngBase64: string, prompt: string, subject: string, guess: string, kind: ScoreKind = 'halfway'): DailyJudgeBody {
  const verdict =
    kind === 'final'
      ? `This is the FINAL VERDICT at the end of the attempt: make the reason a theatrical, suspenseful one-sentence verdict, as if announcing a great reveal. Still at most ${DAILY.reasonMaxChars} characters.\n`
      : 'This is the halfway check-in: keep the reason normal and encouraging.\n'
  const userText =
    `Prompt: ${prompt}\n` +
    `Subject: ${subject}\n` +
    `Blind guess: ${guess}\n` +
    verdict +
    `Reply with raw JSON only: {"match": number, "recognition": number, "quality": number, "reason": "one sentence, at most ${DAILY.reasonMaxChars} characters"}.`

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

export function buildPeekBody(pngBase64: string, prompt: string): DailyJudgeBody {
  return {
    model: JUDGE.model,
    max_tokens: JUDGE.maxTokens,
    temperature: 0.7,
    system: PEEK_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
          { type: 'text', text: `The prompt is: ${prompt}\nReply with raw JSON only: {"line": "one short sentence"}.` },
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

/**
 * A blind guess plus whether Haiku saw written letters, words or numbers. `text` is parsed
 * defensively: anything but a boolean `true` (or the string "true") is treated as a drawing.
 */
export function parseBlind(text: string): { guess: string; writing: string } | null {
  const parsed = extractJsonObject(text)
  if (!parsed || typeof parsed.guess !== 'string') return null
  const guess = parsed.guess.trim()
  if (guess.length === 0) return null
  return { guess, writing: typeof parsed.writing === 'string' ? parsed.writing.trim().slice(0, 80) : '' }
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

export function parseScore(text: string): { match: number; recognition: number; quality: number; reason: string } | null {
  const parsed = extractJsonObject(text)
  if (!parsed) return null
  const match = parseClampedPercent(parsed.match)
  const recognition = parseClampedPercent(parsed.recognition)
  const quality = parseClampedPercent(parsed.quality)
  if (match === null || recognition === null || quality === null) return null
  if (typeof parsed.reason !== 'string') return null
  const reason = clampReason(parsed.reason)
  if (reason.length === 0) return null
  return { match, recognition, quality, reason }
}

/** One playful peek line: no score, no digits (a number in a "non-scoring" line reads as a score). */
export function parsePeek(text: string): { line: string } | null {
  const parsed = extractJsonObject(text)
  if (!parsed || typeof parsed.line !== 'string') return null
  const line = clampReason(parsed.line, PEEK_MAX_CHARS)
  if (line.length === 0 || /\d/.test(line)) return null
  return { line }
}
