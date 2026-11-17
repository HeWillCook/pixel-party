import { JUDGE } from './config'

export const JUDGE_SYSTEM = 'You judge a collaborative pixel-art canvas drawn by many people, one pixel at a time. Ignore isolated stray pixels; they are noise.'
export const JUDGE_USER_TEXT = 'What is this a drawing of? Reply with raw JSON only, no markdown fences: {"guesses": [three short nouns, most likely first], "confidence": number from 0 to 1}. If it is blank or unrecognisable, still give your three best guesses with low confidence.'

export function buildJudgeBody(pngBase64: string) {
  return {
    model: JUDGE.model,
    max_tokens: JUDGE.maxTokens,
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
    return { guesses: result.guesses.slice(0, 3), confidence: Math.max(0, Math.min(1, confidence)) }
  } catch {
    return null
  }
}
