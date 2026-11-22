import { describe, expect, it } from 'vitest'
import response from './__fixtures__/anthropic-response.json'
import { JUDGE } from './config'
import { buildJudgeBody, extractText, JUDGE_SYSTEM, JUDGE_USER_TEXT, parseJudgeText } from './judge'
import { WORDS } from './words'

describe('buildJudgeBody', () => {
  it('builds the prescribed image and prompt request without target words', () => {
    const body = buildJudgeBody('image-data')
    expect(body).toEqual({
      model: JUDGE.model,
      max_tokens: JUDGE.maxTokens,
      temperature: 0,
      system: JUDGE_SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'image-data' } },
        { type: 'text', text: JUDGE_USER_TEXT },
      ] }],
    })
    expect(JUDGE_SYSTEM).toBe(body.system)
    expect(JUDGE_USER_TEXT).toBe(body.messages[0].content[1].text)
    const withoutData = JSON.stringify(body, (key, value: unknown) => key === 'data' ? undefined : value)
    for (const entry of WORDS) {
      for (const target of [entry.word, ...entry.synonyms]) {
        const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        expect(withoutData).not.toMatch(new RegExp(`\\b${escaped}\\b`, 'i'))
      }
    }
  })
})

describe('extractText', () => {
  it('reads the real integration response and joins text blocks', () => {
    expect(extractText(response)).toBe('ok')
    expect(extractText({ data: { content: [{ type: 'text', text: 'one' }, { type: 'image' }, { type: 'text', text: 'two' }] } })).toBe('one\ntwo')
  })
  it('rejects missing or malformed content', () => {
    for (const value of [null, {}, { content: [] }, { data: { content: [] } }, { data: { content: [{ type: 'text' }] } }]) {
      expect(extractText(value)).toBeNull()
    }
  })
})

describe('parseJudgeText', () => {
  it('parses raw, fenced, and surrounded JSON', () => {
    const json = '{"guesses":["cat","dog","bird"],"confidence":0.7}'
    const result = { guesses: ['cat', 'dog', 'bird'], confidence: 0.7, text: false }
    for (const text of [json, `\`\`\`json\n${json}\n\`\`\``, `Here: ${json} done.`]) expect(parseJudgeText(text)).toEqual(result)
  })
  it('truncates guesses and coerces or clamps confidence', () => {
    expect(parseJudgeText('{"guesses":["a","b","c","d"],"confidence":"0.7"}')).toEqual({ guesses: ['a', 'b', 'c'], confidence: 0.7, text: false })
    expect(parseJudgeText('{"guesses":["a"],"confidence":2}')).toEqual({ guesses: ['a'], confidence: 1, text: false })
    expect(parseJudgeText('{"guesses":["a"],"confidence":-1}')).toEqual({ guesses: ['a'], confidence: 0, text: false })
  })
  it('reads the spelling flag, and treats a missing or malformed flag as drawn art', () => {
    expect(parseJudgeText('{"guesses":["sun"],"confidence":1,"text":true}')).toMatchObject({ text: true })
    expect(parseJudgeText('{"guesses":["sun"],"confidence":1,"text":false}')).toMatchObject({ text: false })
    for (const flag of ['"true"', '1', 'null', '{}', '"yes"']) {
      expect(parseJudgeText(`{"guesses":["sun"],"confidence":1,"text":${flag}}`)).toMatchObject({ text: false })
    }
  })
  it('rejects malformed or empty results', () => {
    for (const text of ["I can't tell", '{}', '{"guesses": []}', '{"guesses": [], "confidence": 0}', '{"guesses":["cat"],"confidence":"bad"}', '{"guesses":[null],"confidence":0.5}']) expect(parseJudgeText(text)).toBeNull()
  })
})
