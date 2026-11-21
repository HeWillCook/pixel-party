import { describe, expect, it } from 'vitest'
import { DAILY, JUDGE } from '../config'
import { buildBlindBody, buildScoreBody, clampReason, parseBlind, parseScore } from './judge'
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
  it('parses numbers and numeric strings, clamps to 0-100, and clamps the reason to the box limit', () => {
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
    expect(parsedLong!.reason).toBe(`${'a'.repeat(DAILY.reasonMaxChars - 1)}…`)
  })

  it('asks the judge for at most the box limit, in the system and the user prompt', () => {
    const limit = `at most ${DAILY.reasonMaxChars} characters`
    const body = buildScoreBody('x', 'A tree', 'tree', 'bush') as { system: string; messages: Array<{ content: Array<{ text?: string }> }> }
    expect(body.system).toContain(limit)
    expect(body.messages[0].content[1].text).toContain(limit)
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

describe('clampReason', () => {
  const max = DAILY.reasonMaxChars
  it('leaves a reason that fits untouched (whitespace collapsed)', () => {
    expect(clampReason('  A clear   tower.  ')).toBe('A clear tower.')
    expect(clampReason('x'.repeat(max))).toHaveLength(max)
  })
  it('keeps whole sentences when a later one overflows, with no ellipsis', () => {
    const text = 'The tower and beam read clearly against the sea. The waves could use a little more variety in colour and shape overall.'
    expect(clampReason(text)).toBe('The tower and beam read clearly against the sea.')
  })
  it('cuts one long sentence at a word boundary and marks the cut with an ellipsis', () => {
    const text = 'This lovely lighthouse has a strong tower and a bright beam but the waves and the rocks around it need much more detail to feel real'
    const out = clampReason(text)
    expect(out.length).toBeLessThanOrEqual(max)
    expect(out.endsWith('…')).toBe(true)
    expect(text.startsWith(out.slice(0, -1))).toBe(true)
    expect(text[out.length - 1]).toBe(' ')
  })
  it('never exceeds the limit, even for a single huge word', () => {
    const out = clampReason('W'.repeat(400))
    expect(out).toHaveLength(max)
    expect(out.endsWith('…')).toBe(true)
  })
})
