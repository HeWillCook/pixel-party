import { describe, expect, it, vi } from 'vitest'
import { MODES } from './config'
import { runJudge } from './judge-flow'
import { newRoomState, shouldJudge } from './room-logic'

function setup() {
  const state = newRoomState({ roomId: 'r', mode: 'coop', isDefaultBoard: false }, 0, () => 0)
  state.version = 1
  let now = 15000
  const deps = { now: () => now, reserve: vi.fn(async () => ({ ok: true })), render: vi.fn(async () => 'png'), callJudge: vi.fn(async (): Promise<string | null> => '{"guesses":["home"],"confidence":0.8}'), getState: () => state }
  return { state, deps, setNow: (value: number) => { now = value } }
}
const zone = MODES.coop.zones[0]

describe('runJudge', () => {
  it('guards concurrent requests and judges successfully', async () => {
    const { state, deps } = setup()
    let release!: (result: { ok: boolean }) => void
    deps.reserve.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const first = runJudge(deps, state, 'tick', 1, zone)
    expect(await runJudge(deps, state, 'ask', 1, zone)).toEqual({ kind: 'skipped', why: 'in_flight' })
    release({ ok: true })
    expect(await first).toMatchObject({ kind: 'judged', zone: 'all', matched: true })
    expect(state.lastJudgedVersion).toBe(1)
    expect(state.judgeInFlight).toBe(false)
  })
  it('does not invoke the judge when budget is refused', async () => {
    const { state, deps } = setup(); deps.reserve.mockResolvedValueOnce({ ok: false })
    expect(await runJudge(deps, state, 'tick', 1, zone)).toEqual({ kind: 'resting' })
    expect(deps.callJudge).not.toHaveBeenCalled()
    expect(state.judgeCalls).toEqual([])
  })
  it.each(['error', 'invalid'])('allows retry on unchanged grid after %s', async failure => {
    const { state, deps, setNow } = setup()
    if (failure === 'error') deps.callJudge.mockRejectedValueOnce(new Error('offline'))
    else deps.callJudge.mockResolvedValueOnce('not json')
    expect(await runJudge(deps, state, 'tick', 1, zone)).toEqual({ kind: 'failed' })
    expect(state.lastJudgedVersion).toBe(0)
    setNow(30000)
    expect(shouldJudge(state, 30000, 1, 'tick')).toEqual({ ok: true })
  })
  it('discards results when the round ends during a call', async () => {
    const { state, deps } = setup()
    deps.callJudge.mockImplementationOnce(async () => { state.status = 'intermission'; state.round.state = 'intermission'; return '{"guesses":["home"],"confidence":1}' })
    expect(await runJudge(deps, state, 'tick', 1, zone)).toEqual({ kind: 'stale' })
    expect(state.lastJudgedVersion).toBe(0)
  })
  it('marks only the rendered version as judged when the grid changes mid-call', async () => {
    const { state, deps } = setup()
    deps.callJudge.mockImplementationOnce(async () => { state.version = 2; return '{"guesses":["tree"],"confidence":1}' })
    expect(await runJudge(deps, state, 'tick', 1, zone)).toMatchObject({ kind: 'judged', matched: false })
    expect(state.lastJudgedVersion).toBe(1)
    expect(shouldJudge(state, 30000, 1, 'tick')).toEqual({ ok: true })
  })
})
