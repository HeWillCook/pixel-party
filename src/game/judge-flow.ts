import { JUDGE, type Zone, type ZoneId } from './config'
import { parseJudgeText, type JudgeResult } from './judge'
import { shouldJudge, type RoomState } from './room-logic'
import { matchGuess } from './words'

export type JudgeDeps = {
  now(): number
  reserve(): Promise<{ ok: boolean }>
  persist(): Promise<void>
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
    let reservation: { ok: boolean }
    try {
      reservation = await deps.reserve()
    } catch {
      const current = deps.getState()
      if (current.round.id !== roundId || current.status !== 'playing' || current.round.state !== 'playing') return { kind: 'stale' }
      const now = deps.now()
      current.lastJudgedAt = now
      current.round = { ...current.round, askAvailableAt: now + JUDGE.askMinMs }
      return { kind: 'failed' }
    }
    const current = deps.getState()
    if (current.round.id !== roundId || current.status !== 'playing' || current.round.state !== 'playing') return { kind: 'stale' }
    const now = deps.now()
    current.lastJudgedAt = now
    current.round = { ...current.round, askAvailableAt: now + JUDGE.askMinMs }
    if (!reservation.ok) return { kind: 'resting' }
    current.judgeCalls = [...current.judgeCalls.filter(time => time > now - 60000), now]
    const version = current.version
    await deps.persist()
    const png = await deps.render(current, zone)
    const rendered = deps.getState()
    if (rendered.round.id !== roundId || rendered.status !== 'playing' || rendered.round.state !== 'playing') return { kind: 'stale' }
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
