import { JUDGE, type Zone, type ZoneId } from './config'
import { parseJudgeText, type JudgeResult } from './judge'
import { shouldJudge, type RoomState } from './room-logic'
import { matchGuess } from './words'

export type JudgeDeps = {
  now(): number
  reserve(): Promise<{ ok: boolean }>
  render(s: RoomState, zone: Zone): Promise<string>
  callJudge(pngBase64: string): Promise<string | null>
  getState(): RoomState
}

export type JudgeOutcome =
  | { kind: 'skipped'; why: string }
  | { kind: 'resting' }
  | { kind: 'failed' }
  | { kind: 'stale' }
  | { kind: 'judged'; zone: ZoneId; result: JudgeResult; matched: boolean }

export async function runJudge(deps: JudgeDeps, s: RoomState, reason: 'tick' | 'ask', signedInConnected: number, zone: Zone): Promise<JudgeOutcome> {
  if (s.judgeInFlight) return { kind: 'skipped', why: 'in_flight' }
  const eligible = shouldJudge(s, deps.now(), signedInConnected, reason)
  if (!eligible.ok) return { kind: 'skipped', why: eligible.why }
  s.judgeInFlight = true
  const roundId = s.round.id
  try {
    const reservation = await deps.reserve()
    if (!reservation.ok) return { kind: 'resting' }
    const current = deps.getState()
    if (current.round.id !== roundId || current.status !== 'playing' || current.round.state !== 'playing') return { kind: 'stale' }
    const now = deps.now()
    current.judgeCalls = [...current.judgeCalls.filter(time => time > now - 60000), now]
    current.lastJudgedAt = now
    current.round = { ...current.round, askAvailableAt: now + JUDGE.askMinMs }
    const version = current.version
    const png = await deps.render(current, zone)
    const text = await deps.callJudge(png)
    const after = deps.getState()
    if (after.round.id !== roundId || after.status !== 'playing' || after.round.state !== 'playing') return { kind: 'stale' }
    const result = text === null ? null : parseJudgeText(text)
    if (!result) return { kind: 'failed' }
    after.lastJudgedVersion = version
    return { kind: 'judged', zone: zone.id, result, matched: matchGuess(result.guesses[0], after.wordEntry) }
  } catch {
    const current = deps.getState()
    if (current.round.id !== roundId || current.status !== 'playing' || current.round.state !== 'playing') return { kind: 'stale' }
    return { kind: 'failed' }
  } finally {
    s.judgeInFlight = false
    deps.getState().judgeInFlight = false
  }
}
