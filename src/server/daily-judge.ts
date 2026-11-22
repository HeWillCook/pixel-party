import type { Env } from '../../worker.js'
import { DAILY } from '../game/config'
import { cellsHash } from '../game/daily/attempt'
import { buildBlindBody, buildPeekBody, buildScoreBody, clampReason, parseBlind, parsePeek, parseScore, type DailyJudgeBody, type ScoreKind } from '../game/daily/judge'
import { decodeCells, type Grid } from '../game/grid'
import { extractText } from '../game/judge'
import { renderZonePng, toBase64 } from '../game/png'
import { withTimeout } from './room-time'
import { createServerTools } from './server-tools'

declare const __DAILY_JUDGE__: 'fake' | 'local' | 'real' | undefined

export function configuredJudgeMode(): 'fake' | 'local' | 'real' {
  return typeof __DAILY_JUDGE__ !== 'undefined' ? __DAILY_JUDGE__ : 'fake'
}

export interface ScoredGrade { match: number; recognition: number; quality: number; reason: string }
export interface DailyJudge {
  blind(png: string): Promise<{ guess: string; text: boolean } | null>
  score(png: string, prompt: string, subject: string, guess: string, kind?: ScoreKind): Promise<ScoredGrade | null>
  /** A silent, non-scoring look: one playful line, never a score. */
  peek?(png: string, prompt: string): Promise<{ line: string } | null>
}

const CANNED_GUESSES = [
  'a lighthouse',
  'a cat',
  'a sailboat',
  'a mushroom',
  'a robot',
  'a turtle',
  'a penguin',
  'a frog',
  'a rocket',
  'a cactus',
  'a castle',
  'a dragon',
  'a crown',
  'a volcano',
  'a teapot',
  'a snowman',
] as const

const CANNED_PEEKS = [
  'Ooh, that is coming along nicely.',
  'I am squinting. In a supportive way.',
  'Do not look now, but I think it is working.',
  'A bold choice. I respect it.',
] as const

const LOCAL_JUDGE_URL = 'http://127.0.0.1:8789/judge'
const REAL_TIMEOUT_MS = 20_000
const LOCAL_TIMEOUT_MS = 60_000

export function fakeDailyJudge(): DailyJudge {
  return {
    async blind(png: string) {
      const hash = parseInt(cellsHash(png), 16)
      // The fake judge never reads letters: every fake drawing is art, so spelling tests drive the rule directly.
      return { guess: CANNED_GUESSES[hash % CANNED_GUESSES.length], text: false }
    },
    async score(png: string, _prompt: string, subject: string, guess: string) {
      const hash = parseInt(cellsHash(png), 16)
      const subjectLower = subject.trim().toLowerCase()
      const guessLower = guess.trim().toLowerCase()
      const recognized = subjectLower.length > 0 && guessLower.includes(subjectLower)
      // A wrong guess must never look like a good drawing: recognition 0, a low prompt match, and
      // craft that cannot rescue it (the score formula caps the prompt part for unrecognized art).
      const match = recognized ? 55 + ((hash >>> 8) % 46) : 10 + ((hash >>> 8) % 30)
      const quality = 40 + ((hash >>> 16) % 61)
      const recognition = recognized ? 100 : 0
      const reason = clampReason(`Fake judge saw "${guess}" for ${subject}.`)
      return { match, recognition, quality, reason }
    },
    async peek(png: string, _prompt: string) {
      const hash = parseInt(cellsHash(png), 16)
      return { line: CANNED_PEEKS[hash % CANNED_PEEKS.length] }
    },
  }
}

async function callReal(env: Env, body: DailyJudgeBody): Promise<string | null> {
  try {
    return await withTimeout((async () => {
      const result = await createServerTools(env).integration('anthropic/chat-completion', body)
      return result.success ? extractText(result) : null
    })(), REAL_TIMEOUT_MS, null)
  } catch {
    return null
  }
}

async function callLocal(body: DailyJudgeBody): Promise<string | null> {
  try {
    return await withTimeout((async () => {
      const system = body.system
      const png = body.messages[0].content[0].source.data
      const user = body.messages[0].content[1].text
      const response = await fetch(LOCAL_JUDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, user, png }),
      })
      if (!response.ok) return null
      const data = await response.json() as { text?: unknown } | null
      return typeof data?.text === 'string' ? data.text : null
    })(), LOCAL_TIMEOUT_MS, null)
  } catch {
    return null
  }
}

function modeJudge(call: (body: DailyJudgeBody) => Promise<string | null>, peeks: boolean): DailyJudge {
  return {
    async blind(png: string) {
      const text = await call(buildBlindBody(png))
      return text ? parseBlind(text) : null
    },
    async score(png: string, prompt: string, subject: string, guess: string, kind: ScoreKind = 'halfway') {
      const text = await call(buildScoreBody(png, prompt, subject, guess, kind))
      return text ? parseScore(text) : null
    },
    ...(peeks
      ? {
          async peek(png: string, prompt: string) {
            const text = await call(buildPeekBody(png, prompt))
            return text ? parsePeek(text) : null
          },
        }
      : {}),
  }
}

export function createDailyJudge(
  env: Env,
  mode: 'fake' | 'local' | 'real' = configuredJudgeMode(),
): DailyJudge {
  if (mode === 'local') return modeJudge(callLocal, true)
  if (mode === 'real') return modeJudge(body => callReal(env, body), true)
  return fakeDailyJudge()
}

export async function renderCellsPng(cells: string): Promise<string> {
  const decoded = decodeCells(cells, 32 * 32)
  const grid: Grid = {
    width: 32,
    height: 32,
    cells: decoded,
    placedBy: [],
  }
  const png = await renderZonePng(grid, { id: 'all', x: 0, y: 0, w: 32, h: 32 }, DAILY.renderPx)
  return toBase64(png)
}
