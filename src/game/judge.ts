import { JUDGE } from './config'

export const JUDGE_SYSTEM = 'You judge a collaborative pixel-art canvas drawn by many people, one pixel at a time. Ignore isolated stray pixels; they are noise. If the canvas is entirely blank (no pixels drawn), the drawing is empty and nothing was drawn. Also report whether the image contains written letters, words or numbers: spelling the answer is not drawing it.'
export const JUDGE_USER_TEXT = 'What is this a drawing of? Reply with raw JSON only, no markdown fences: {"guesses": [three short nouns, most likely first], "confidence": number from 0 to 1, "writing": "any letters, words or numbers written in the image, exactly as written, or an empty string"}. Report writing even when it is part of the drawing (a sign or a label). If the image is entirely blank (no pixels drawn), reply with {"guesses": [], "confidence": 0, "writing": ""}.'

export function buildJudgeBody(pngBase64: string) {
  return {
    model: JUDGE.model,
    max_tokens: JUDGE.maxTokens,
    temperature: 0,
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
      { type: 'text', text: JUDGE_USER_TEXT },
    ] }],
  }
}

export function extractText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) return null
  const data = payload.data
  if (!data || typeof data !== 'object' || !('content' in data) || !Array.isArray(data.content)) return null
  const texts: string[] = []
  for (const block of data.content) {
    if (!block || typeof block !== 'object') return null
    if (block.type === 'text') {
      if (typeof block.text !== 'string') return null
      texts.push(block.text)
    }
  }
  return texts.length ? texts.join('\n') : null
}

export interface JudgeResult {
  guesses: string[]
  confidence: number
  /** Whatever is written on the canvas, as the judge read it ("" when nothing is). */
  writing: string
  /** The writing spells the answer (set by the room, which knows the word). A spelled answer never counts. */
  text: boolean
}

/** A missing or malformed `writing` is "": an unreadable field must never invent a spelling offence. */
export function parseJudgeWriting(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, 80) : ''
}

export function parseJudgeText(text: string): JudgeResult | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    const result: unknown = JSON.parse(text.slice(start, end + 1))
    if (!result || typeof result !== 'object' || !('guesses' in result) || !Array.isArray(result.guesses) || result.guesses.length === 0 || !result.guesses.every((guess: unknown) => typeof guess === 'string' && guess.trim().length > 0) || !('confidence' in result)) return null
    const raw = result.confidence
    if (typeof raw !== 'number' && (typeof raw !== 'string' || raw.trim() === '')) return null
    const confidence = Number(raw)
    if (!Number.isFinite(confidence)) return null
    return {
      guesses: result.guesses.slice(0, 3),
      confidence: Math.max(0, Math.min(1, confidence)),
      writing: 'writing' in result ? parseJudgeWriting(result.writing) : '',
      text: false,
    }
  } catch {
    return null
  }
}
