import { JUDGE } from '../config'

export interface DailyJudgeBody {
  model: string
  max_tokens: number
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
  'You are guessing a 32x32 pixel-art drawing made by one person for a guessing game. Ignore isolated stray pixels; they may be noise. Reply with raw JSON only, no markdown fences: {"guess": "short phrase"}.'

export const BLIND_USER_TEXT =
  'What is this a drawing of? Reply with raw JSON only: {"guess": "short phrase"}.'

export const SCORE_SYSTEM =
  'You judge a 32x32 pixel-art drawing for a daily challenge. Score two things from 0 to 100:\n' +
  '- fit: how well the drawing shows the whole prompt (subject plus detail).\n' +
  '- recognition: how close the blind guess is to the target subject (exact or synonym ~ 100, related ~ 50, wrong = 0).\n' +
  'Reply with raw JSON only, no markdown fences: {"fit": number, "recognition": number, "reason": "one short sentence addressed to the player"}.'

export function buildBlindBody(pngBase64: string): DailyJudgeBody {
  return {
    model: JUDGE.model,
    max_tokens: JUDGE.maxTokens,
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
    'Reply with raw JSON only: {"fit": number, "recognition": number, "reason": "one short sentence addressed to the player"}.'

  return {
    model: JUDGE.model,
    max_tokens: JUDGE.maxTokens,
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

export function parseScore(text: string): { fit: number; recognition: number; reason: string } | null {
  const parsed = extractJsonObject(text)
  if (!parsed) return null
  const fit = parseClampedPercent(parsed.fit)
  const recognition = parseClampedPercent(parsed.recognition)
  if (fit === null || recognition === null) return null
  if (typeof parsed.reason !== 'string') return null
  const reason = parsed.reason.trim().slice(0, 140)
  if (reason.length === 0) return null
  return { fit, recognition, reason }
}
