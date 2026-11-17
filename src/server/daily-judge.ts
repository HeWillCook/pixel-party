import type { Env } from '../../worker.js'
import { DAILY } from '../game/config'
import { cellsHash } from '../game/daily/attempt'
import { buildBlindBody, buildScoreBody, parseBlind, parseScore, type DailyJudgeBody } from '../game/daily/judge'
import { decodeCells, type Grid } from '../game/grid'
import { extractText } from '../game/judge'
import { renderZonePng, toBase64 } from '../game/png'
import { withTimeout } from './room-time'
import { createServerTools } from './server-tools'

declare const __DAILY_JUDGE__: 'fake' | 'local' | 'real' | undefined

export function configuredJudgeMode(): 'fake' | 'local' | 'real' {
  return typeof __DAILY_JUDGE__ !== 'undefined' ? __DAILY_JUDGE__ : 'fake'
}

export interface DailyJudge {
  blind(png: string): Promise<{ guess: string } | null>
  score(png: string, prompt: string, subject: string, guess: string): Promise<{ fit: number; recognition: number; reason: string } | null>
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

const LOCAL_JUDGE_URL = 'http://127.0.0.1:8789/judge'
const REAL_TIMEOUT_MS = 20_000
const LOCAL_TIMEOUT_MS = 60_000

export function fakeDailyJudge(): DailyJudge {
  return {
    async blind(png: string) {
      const hash = parseInt(cellsHash(png), 16)
      return { guess: CANNED_GUESSES[hash % CANNED_GUESSES.length] }
    },
    async score(png: string, _prompt: string, subject: string, guess: string) {
      const hash = parseInt(cellsHash(png), 16)
      const fit = (hash >>> 8) % 101
      const subjectLower = subject.trim().toLowerCase()
      const guessLower = guess.trim().toLowerCase()
      const recognition = subjectLower.length > 0 && guessLower.includes(subjectLower)
        ? 100
        : (hash >>> 16) % 101
      const reason = `Fake judge saw "${guess}" for ${subject}.`.slice(0, 140)
      return { fit, recognition, reason }
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

export function createDailyJudge(
  env: Env,
  mode: 'fake' | 'local' | 'real' = configuredJudgeMode(),
): DailyJudge {
  if (mode === 'local') {
    return {
      async blind(png: string) {
        const text = await callLocal(buildBlindBody(png))
        return text ? parseBlind(text) : null
      },
      async score(png: string, prompt: string, subject: string, guess: string) {
        const text = await callLocal(buildScoreBody(png, prompt, subject, guess))
        return text ? parseScore(text) : null
      },
    }
  }
  if (mode === 'real') {
    return {
      async blind(png: string) {
        const text = await callReal(env, buildBlindBody(png))
        return text ? parseBlind(text) : null
      },
      async score(png: string, prompt: string, subject: string, guess: string) {
        const text = await callReal(env, buildScoreBody(png, prompt, subject, guess))
        return text ? parseScore(text) : null
      },
    }
  }
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
