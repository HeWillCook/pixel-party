import { describe, expect, it } from 'vitest'
import { DAILY, JUDGE } from '../config'
import { buildBlindBody, buildPeekBody, buildScoreBody, clampReason, PEEK_MAX_CHARS, parseBlind, parsePeek, parseScore, SCORE_SYSTEM } from './judge'
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

  it('asks for match, recognition, quality and a reason, keeping craft out of match', () => {
    const body = buildScoreBody('x', 'A tree', 'tree', 'bush') as { system: string; messages: Array<{ content: Array<{ text?: string }> }> }
    expect(body.system).toContain('match (0-100)')
    expect(body.system).toContain('quality (0-100)')
    expect(body.system).toContain('recognition (0-100)')
    expect(body.system).toContain('regardless of craft')
    expect(body.system).toContain('pixel-art craft only, regardless of the prompt')
    expect(body.system).not.toMatch(/fit \(0-100\)/)
    expect(body.messages[0].content[1].text).toContain('"match"')
    expect(body.messages[0].content[1].text).toContain('"quality"')
  })

  it('asks the halfway reason to be encouraging and the final one to be a theatrical verdict', () => {
    const halfway = buildScoreBody('x', 'A tree', 'tree', 'bush', 'halfway') as { messages: Array<{ content: Array<{ text?: string }> }> }
    const final = buildScoreBody('x', 'A tree', 'tree', 'bush', 'final') as { messages: Array<{ content: Array<{ text?: string }> }> }
    expect(halfway.messages[0].content[1].text).toContain('halfway check-in')
    expect(halfway.messages[0].content[1].text).toContain('normal and encouraging')
    expect(final.messages[0].content[1].text).toContain('FINAL VERDICT')
    expect(final.messages[0].content[1].text).toContain('theatrical')
    expect(SCORE_SYSTEM).toContain(`at most ${DAILY.reasonMaxChars} characters`)
  })

  it('buildPeekBody asks for one playful non-scoring line under the character cap', () => {
    const body = buildPeekBody('x', 'a lighthouse in a storm') as { system: string; messages: Array<{ content: Array<{ text?: string }> }> }
    expect(body.system).toContain('Never mention scores, points, numbers')
    expect(body.system).toContain(`${PEEK_MAX_CHARS} characters`)
    expect(body.messages[0].content[1].text).toContain('a lighthouse in a storm')
  })
})

describe('parseBlind', () => {
  it('parses raw and fenced JSON guesses and rejects invalid text', () => {
    expect(parseBlind('```json\n{"guess":"a candle"}\n```')).toEqual({ guess: 'a candle', writing: '' })
    expect(parseBlind('  {"guess": "  a lighthouse  "}  ')).toEqual({ guess: 'a lighthouse', writing: '' })
    expect(parseBlind('nope')).toBeNull()
    expect(parseBlind('{}')).toBeNull()
    expect(parseBlind('{"guess":""}')).toBeNull()
    expect(parseBlind('{"guess":123}')).toBeNull()
  })
})

describe('parseScore', () => {
  it('parses numbers and numeric strings, clamps to 0-100, and clamps the reason to the box limit', () => {
    expect(parseScore('{"match":"72","recognition":40,"quality":66,"reason":"ok"}')).toEqual({
      match: 72,
      recognition: 40,
      quality: 66,
      reason: 'ok',
    })
    expect(parseScore('```json\n{"match":150,"recognition":-10,"quality":105,"reason":"  nice drawing  "}\n```')).toEqual({
      match: 100,
      recognition: 0,
      quality: 100,
      reason: 'nice drawing',
    })

    const longReason = `  ${'a'.repeat(200)}  `
    const parsedLong = parseScore(JSON.stringify({ match: 50, recognition: 50, quality: 50, reason: longReason }))
    expect(parsedLong).not.toBeNull()
    expect(parsedLong!.reason).toBe(`${'a'.repeat(DAILY.reasonMaxChars - 1)}…`)
  })

  it('returns null if fields are missing or non-finite', () => {
    for (const bad of [
      'nope',
      '{}',
      '{"match":50,"recognition":50,"reason":"ok"}',
      '{"match":50,"recognition":50,"quality":50}',
      '{"match":50,"reason":"ok"}',
      '{"match":"abc","recognition":50,"quality":50,"reason":"ok"}',
      '{"match":50,"recognition":null,"quality":50,"reason":"ok"}',
      '{"match":"","recognition":50,"quality":50,"reason":"ok"}',
      '{"match":50,"recognition":50,"quality":50,"reason":123}',
      '{"match":50,"recognition":50,"quality":50,"reason":"   "}',
    ]) {
      expect(parseScore(bad)).toBeNull()
    }
  })
})

describe('parsePeek', () => {
  it('parses a short playful line', () => {
    expect(parsePeek('{"line":"Ooh, that is coming along nicely."}')).toEqual({ line: 'Ooh, that is coming along nicely.' })
  })
  it('rejects scores, digits and empty or malformed lines', () => {
    expect(parsePeek('{"line":"That is a 10 out of 10"}')).toBeNull()
    expect(parsePeek('{"line":""}')).toBeNull()
    expect(parsePeek('{"line":123}')).toBeNull()
    expect(parsePeek('nope')).toBeNull()
  })
  it('clamps the line to the peek cap', () => {
    const parsed = parsePeek(JSON.stringify({ line: 'a'.repeat(200) }))
    expect(parsed).not.toBeNull()
    expect(parsed!.line.length).toBeLessThanOrEqual(PEEK_MAX_CHARS)
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
  it('cuts at the last clause and never ends on a dangling function word (real Haiku replies, 2026-11-21)', () => {
    expect(clampReason('A red umbrella with a black handle and blue rain streaks is clearly drawn, though the puddle and ground are simple.')).toBe('A red umbrella with a black handle and blue rain streaks is clearly drawn…')
    const out = clampReason('A red umbrella with a black handle and blue rain streaks is clearly drawn with a puddle or ground lines below it')
    expect(out.length).toBeLessThanOrEqual(max)
    expect(out).not.toMatch(/\b(with|a|or|and|the)…$/)
    expect(out.endsWith('…')).toBe(true)
  })
  it('never exceeds the limit, even for a single huge word', () => {
    const out = clampReason('W'.repeat(400))
    expect(out).toHaveLength(max)
    expect(out.endsWith('…')).toBe(true)
  })
})
