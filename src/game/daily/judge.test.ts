import { describe, expect, it } from 'vitest'
import { JUDGE } from '../config'
import { buildBlindBody, buildScoreBody, parseBlind, parseScore } from './judge'
import { DAILY_PROMPTS } from './prompts'

describe('daily judge bodies', () => {
  it('buildBlindBody includes the PNG image block and never includes prompt text', () => {
    const body = buildBlindBody('x') as {
      model: string
      max_tokens: number
      system: string
      messages: Array<{ role: string; content: Array<Record<string, unknown>> }>
    }
    expect(body.model).toBe(JUDGE.model)
    expect(body.max_tokens).toBe(JUDGE.maxTokens)
    expect(body.messages[0]?.content).toContainEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'x' },
    })

    const serialized = JSON.stringify(body)
    expect(serialized.toLowerCase()).not.toContain('prompt')
    for (const entry of DAILY_PROMPTS) {
      expect(serialized.toLowerCase()).not.toContain(entry.prompt.toLowerCase())
      const escapedSubject = entry.subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(serialized).not.toMatch(new RegExp(`\\b${escapedSubject}\\b`, 'i'))
    }
  })

  it('buildScoreBody includes the PNG image block, prompt, subject, and guess', () => {
    const body = buildScoreBody('x', 'a lighthouse in a storm', 'lighthouse', 'candle') as {
      model: string
      max_tokens: number
      system: string
      messages: Array<{ role: string; content: Array<Record<string, unknown>> }>
    }
    expect(body.model).toBe(JUDGE.model)
    expect(body.max_tokens).toBe(JUDGE.maxTokens)
    expect(body.messages[0]?.content).toContainEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'x' },
    })

    const serialized = JSON.stringify(body)
    expect(serialized).toContain('a lighthouse in a storm')
    expect(serialized).toContain('lighthouse')
    expect(serialized).toContain('candle')
  })
})

describe('parseBlind', () => {
  it('parses raw and fenced JSON guesses and rejects invalid text', () => {
    expect(parseBlind('```json\n{"guess":"a candle"}\n```')).toEqual({ guess: 'a candle' })
    expect(parseBlind('  {"guess": "  a lighthouse  "}  ')).toEqual({ guess: 'a lighthouse' })
    expect(parseBlind('nope')).toBeNull()
    expect(parseBlind('{}')).toBeNull()
    expect(parseBlind('{"guess":""}')).toBeNull()
    expect(parseBlind('{"guess":123}')).toBeNull()
  })
})

describe('parseScore', () => {
  it('parses numbers and numeric strings, clamps to 0-100, and trims reason to <= 140 chars', () => {
    expect(parseScore('{"fit":"72","recognition":40,"reason":"ok"}')).toEqual({
      fit: 72,
      recognition: 40,
      reason: 'ok',
    })
    expect(parseScore('```json\n{"fit":150,"recognition":-10,"reason":"  nice drawing  "}\n```')).toEqual({
      fit: 100,
      recognition: 0,
      reason: 'nice drawing',
    })

    const longReason = `  ${'a'.repeat(200)}  `
    const parsedLong = parseScore(JSON.stringify({ fit: 50, recognition: 50, reason: longReason }))
    expect(parsedLong).not.toBeNull()
    expect(parsedLong!.reason).toHaveLength(140)
    expect(parsedLong!.reason).toBe('a'.repeat(140))
  })

  it('returns null if fields are missing or non-finite', () => {
    for (const bad of [
      'nope',
      '{}',
      '{"fit":50,"recognition":50}',
      '{"fit":50,"reason":"ok"}',
      '{"recognition":50,"reason":"ok"}',
      '{"fit":"abc","recognition":50,"reason":"ok"}',
      '{"fit":50,"recognition":null,"reason":"ok"}',
      '{"fit":"","recognition":50,"reason":"ok"}',
      '{"fit":50,"recognition":50,"reason":123}',
      '{"fit":50,"recognition":50,"reason":"   "}',
    ]) {
      expect(parseScore(bad)).toBeNull()
    }
  })
})
