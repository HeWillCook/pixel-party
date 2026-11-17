import { isAnonymousUserId } from 'deepspace'
import { BaseRoom } from 'deepspace/worker'
import type { UserAttachment } from 'deepspace/worker'
import { z } from 'zod'
import type { Env } from '../../worker.js'
import { JUDGE, MODES, PALETTE, type Mode } from '../game/config'
import { encodeCells } from '../game/grid'
import { buildJudgeBody, extractText } from '../game/judge'
import { runJudge } from '../game/judge-flow'
import { renderZonePng, toBase64 } from '../game/png'
import { parseClientMsg, type ServerMsg } from '../game/protocol'
import {
  advance, applyJudgeOutcome, applyPlacements, countPlayers, deserializeRoomState,
  newRoomState, nextAlarmAt, serializeRoomState, startNextRound,
  type RoomState, type RoomTransition, type RoundEndedEvent, type RoomStatusEvent,
} from '../game/room-logic'
import { cooldownMs } from '../game/rules'
import { reserveBudget } from './budget'
import { configuredJudgeMode } from './daily-judge'
import { createServerTools } from './server-tools'
import { utcDay, withTimeout } from './room-time'
import type { RoomData } from './rooms'

type RoomInit = Pick<RoomState, 'roomId' | 'mode' | 'isDefaultBoard'>
type SavedRoom = { room_id: string; mode: string; is_default: number; state: string; resting_day: string | null; host_id: string }
const finite = z.number().finite()
const roomStateSchema = z.object({
  roomId: z.string().min(1), isDefaultBoard: z.boolean(), mode: z.enum(['coop', 'team']),
  grid: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), cells: z.instanceof(Uint8Array), placedBy: z.array(z.string()) }),
  version: finite.int().nonnegative(), lastJudgedVersion: finite.int().nonnegative(),
  round: z.object({
    id: z.string().min(1), word: z.string(), state: z.enum(['lobby', 'playing', 'intermission', 'paused']),
    startedAt: finite, endsAt: finite.nullable(), askAvailableAt: finite, endedAt: finite.optional(),
    result: z.object({ outcome: z.enum(['won', 'timeout', 'teamWin']), score: finite.optional(), contributorCount: finite.int().nonnegative().optional(), winningTeam: z.enum(['red', 'blue', 'draw']).optional() }).optional(),
  }),
  wordEntry: z.object({ word: z.string().min(1), synonyms: z.array(z.string()), tier: z.enum(['easy', 'medium']) }),
  recentWords: z.array(z.string()), lastGuesses: z.array(z.string()), roundCounter: finite.int().nonnegative(),
  lastPlacedAt: z.record(z.string(), finite), soloBuckets: z.record(z.string(), z.object({ tokens: finite.nonnegative(), updatedAt: finite })), judgeCalls: z.array(finite), lastJudgedAt: finite,
  judgeInFlight: z.boolean(), emptySince: finite.nullable(), intermissionEndsAt: finite.nullable(),
  pausedAt: finite.nullable(), pausedFrom: z.enum(['playing', 'intermission']).nullable(),
  status: z.enum(['lobby', 'playing', 'intermission', 'paused', 'closed']),
})

function signedInId(userId: string | null | undefined): string | null {
  return userId && !isAnonymousUserId(userId) ? userId : null
}

function logAlarmError(): void {
  console.warn('[PixelRoom] Alarm scheduling failed')
}

export function restorePixelState(json: string, init: RoomInit, now: number, rng: () => number): RoomState {
  try {
    const decoded = deserializeRoomState(json)
    const defaults = newRoomState(init, now, rng)
    const restored = roomStateSchema.parse({ ...defaults, ...decoded, ...init, recentWords: decoded.recentWords ?? [decoded.wordEntry.word], judgeInFlight: false })
    const config = MODES[restored.mode]
    const validDimensions = restored.grid.width === config.width && restored.grid.height === config.height
    const validAttributions = restored.grid.placedBy.length === restored.grid.cells.length
    const validColors = restored.grid.cells.every(color => color < PALETTE.length)
    const validWord = restored.status === 'lobby' ? restored.round.word === '' : restored.wordEntry.word === restored.round.word
    if (!validDimensions || !validAttributions || !validColors || !validWord) {
      throw new Error('Invalid saved grid or word')
    }
    return restored
  } catch {
    console.warn('[PixelRoom] Invalid saved state; starting a fresh round')
    return newRoomState(init, now, rng)
  }
}

export function nextCommandRejection(state: RoomState, userId: string | null, hostUserId: string | null = null): 'not_signed_in' | 'not_host' | null {
  const verifiedId = signedInId(userId)
  if (!verifiedId) return 'not_signed_in'
  return !state.isDefaultBoard && hostUserId === verifiedId ? null : 'not_host'
}

export class PixelRoom extends BaseRoom<Env> {
  private game: RoomState | null = null
  private restingDay: string | null = null
  private hostUserId = ''

  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    this.sql.exec('CREATE TABLE IF NOT EXISTS pixel_state (id INTEGER PRIMARY KEY CHECK (id = 1), room_id TEXT NOT NULL, mode TEXT NOT NULL, is_default INTEGER NOT NULL, state TEXT NOT NULL, resting_day TEXT)')
    const columns = this.sql.exec<{ name: string }>('PRAGMA table_info(pixel_state)').toArray()
    if (!columns.some(column => column.name === 'host_id')) this.sql.exec("ALTER TABLE pixel_state ADD COLUMN host_id TEXT NOT NULL DEFAULT ''")
    const saved = this.sql.exec<SavedRoom>('SELECT room_id, mode, is_default, state, resting_day, host_id FROM pixel_state WHERE id = 1').toArray()[0]
    if (saved) {
      this.game = restorePixelState(saved.state, { roomId: saved.room_id, mode: saved.mode === 'team' ? 'team' : 'coop', isDefaultBoard: saved.is_default === 1 }, Date.now(), Math.random)
      this.restingDay = saved.resting_day
      this.hostUserId = saved.host_id
      this.persist()
      void this.state.blockConcurrencyWhile(() => this.armAlarm().catch(logAlarmError))
    }
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket' && !this.game) {
      const roomId = request.headers.get('X-Room-Id')
      const mode = request.headers.get('X-Room-Mode')
      const isDefault = request.headers.get('X-Room-Default')
      const hostId = request.headers.get('X-Room-Host')
      if (!roomId || hostId === null || (mode !== 'coop' && mode !== 'team') || (isDefault !== 'true' && isDefault !== 'false')) return new Response('Missing room configuration', { status: 400 })
      this.hostUserId = isDefault === 'true' ? '' : hostId
      this.game = newRoomState({ roomId, mode: mode as Mode, isDefaultBoard: isDefault === 'true', startsInLobby: request.headers.get('X-Room-Lobby') === 'true' }, Date.now(), Math.random)
      this.persist()
    }
    if (request.headers.get('Upgrade') === 'websocket' && this.game?.status === 'closed') return new Response('Room closed', { status: 410 })
    return super.fetch(request)
  }

  override async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (typeof message !== 'string' || !parseClientMsg(message)) return
    await super.webSocketMessage(ws, message)
  }

  protected override async onConnect(ws: WebSocket, user: UserAttachment): Promise<void> {
    try {
      ws.serializeAttachment(user)
      await this.transition(this.withRoomStatus(advance(this.game!, Date.now(), this.playerCount(), Math.random), this.playerCount()), undefined, ws)
      this.broadcastGame({ t: 'players', count: this.playerCount(), roster: this.playerRoster() })
    } finally {
      await this.armAlarm().catch(logAlarmError)
    }
  }

  protected override async onMessage(ws: WebSocket, user: UserAttachment, message: { type: string; [key: string]: unknown }): Promise<void> {
    try {
      const command = parseClientMsg(JSON.stringify(message))
      if (!command || !this.game) return
      const userId = signedInId(user.userId)
      await this.transition(advance(this.game, Date.now(), this.playerCount(), Math.random))
      if (command.t !== 'place' && !userId) {
        this.sendGame(ws, { t: 'reject', reason: 'not_signed_in' })
      } else if (command.t === 'place') {
        await this.transition(applyPlacements(this.game, 'cells' in command ? command.cells : [command], userId, Date.now(), this.playerCount()), ws)
      } else if (command.t === 'ask') {
        await this.judge('ask', ws)
      } else if (command.t === 'next') {
        const reason = nextCommandRejection(this.game, userId, this.hostUserId)
        if (reason) this.sendGame(ws, { t: 'reject', reason })
        else await this.transition(startNextRound(this.game, Date.now(), Math.random))
      }
    } finally {
      await this.armAlarm().catch(logAlarmError)
    }
  }

  protected override async onDisconnect(ws: WebSocket): Promise<void> {
    try {
      try { ws.close(1000, 'Disconnected') } catch {}
      if (!this.game) return
      await this.transition(this.withRoomStatus(advance(this.game, Date.now(), this.playerCount(ws), Math.random), this.playerCount(ws)))
      this.broadcastGame({ t: 'players', count: this.playerCount(ws), roster: this.playerRoster(ws) })
    } finally {
      await this.armAlarm().catch(logAlarmError)
    }
  }

  protected override async onAlarm(): Promise<void> {
    try {
      if (!this.game) return
      await this.transition(advance(this.game, Date.now(), this.playerCount(), Math.random))
      await this.judge('tick')
    } finally {
      await this.armAlarm().catch(logAlarmError)
    }
  }

  protected async onRoundEnded(result: RoundEndedEvent): Promise<void> {
    const tools = createServerTools(this.env)
    const room = await tools.get<RoomData>('rooms', result.roomId)
    if (!room.success) throw new Error('Room lookup failed')
    const { hostId, memberIds, visibility } = room.data.record.data
    const round = await tools.create('rounds', { ...result, score: result.score ?? 0, winningTeam: result.winningTeam ?? null, snapshotFileIds: [], hostId, memberIds, visibility }, `${result.roomId}:${result.roundId}`)
    if (!round.success) throw new Error('Round write failed')
    if (result.outcome !== 'won') return
    for (const userId of new Set(result.contributorIds)) {
      if (!signedInId(userId)) continue
      const existing = await tools.get<{ totalPoints: number; roundsWon: number }>('scores', userId)
      if (!existing.success && existing.error !== 'Record not found') throw new Error('Score lookup failed')
      const previous = existing.success ? existing.data.record.data : { totalPoints: 0, roundsWon: 0 }
      const score = await tools.create('scores', { userId, totalPoints: previous.totalPoints + (result.score ?? 0), roundsWon: previous.roundsWon + 1 }, userId)
      if (!score.success) throw new Error('Score write failed')
    }
  }

  protected async onRoomStatus(status: RoomStatusEvent): Promise<void> {
    const { roomId, ...data } = status
    const result = await createServerTools(this.env).update('rooms', roomId, data)
    if (!result.success) throw new Error('Room status write failed')
  }

  private withRoomStatus(transition: RoomTransition, playerCount: number): RoomTransition {
    if (!transition.events.some(event => event.type === 'roomStatus')) {
      const state = transition.state
      transition.events.push({ type: 'roomStatus', event: { roomId: state.roomId, status: state.status, playerCount, lastActiveAt: Date.now(), currentRoundId: state.round.id } })
    }
    return transition
  }

  private liveSockets(exclude?: WebSocket): WebSocket[] {
    return this.getWebSockets().filter(ws => ws !== exclude && ws.readyState === WebSocket.OPEN)
  }

  private playerCount(exclude?: WebSocket): number {
    return countPlayers(this.liveSockets(exclude).map(ws => ({ userId: signedInId(this.getAttachment(ws)?.userId) })))
  }

  private playerRoster(exclude?: WebSocket): { userId: string; name: string }[] {
    const players = new Map<string, { userId: string; name: string }>()
    for (const ws of this.liveSockets(exclude)) {
      const user = this.getAttachment(ws)
      const userId = signedInId(user?.userId)
      if (userId) players.set(userId, { userId, name: user?.userName || 'Painter' })
    }
    return [...players.values()]
  }

  private sendGame(ws: WebSocket, message: ServerMsg): void {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
    } catch {}
  }

  private broadcastGame(message: ServerMsg): void {
    for (const ws of this.liveSockets()) this.sendGame(ws, message)
  }

  private snapshot(ws: WebSocket): void {
    const state = this.game!
    const userId = signedInId(this.getAttachment(ws)?.userId)
    const placedAt = userId === null ? undefined : state.lastPlacedAt[userId]
    const players = this.playerCount()
    this.sendGame(ws, {
      t: 'snapshot', mode: state.mode, width: state.grid.width, height: state.grid.height,
      cells: encodeCells(state.grid.cells), round: state.round, players, roster: this.playerRoster(),
      you: { userId, cooldownUntil: placedAt === undefined ? 0 : placedAt + cooldownMs(players) },
      aiResting: this.restingDay === utcDay(Date.now()),
    })
  }

  private persist(): void {
    if (!this.game) return
    this.sql.exec('INSERT OR REPLACE INTO pixel_state (id, room_id, mode, is_default, state, resting_day, host_id) VALUES (1, ?, ?, ?, ?, ?, ?)', this.game.roomId, this.game.mode, Number(this.game.isDefaultBoard), serializeRoomState(this.game), this.restingDay, this.hostUserId)
  }

  private async armAlarm(): Promise<void> {
    const at = this.game ? nextAlarmAt(this.game, Date.now()) : null
    if (at === null) await this.state.storage.deleteAlarm()
    else await this.state.storage.setAlarm(at)
  }

  private async transition(transition: RoomTransition, sender?: WebSocket, snapshotFirst?: WebSocket): Promise<void> {
    const stateChanged = transition.state !== this.game
    const previousRound = this.game?.round
    if (this.game && (this.game.status !== transition.state.status || previousRound?.id !== transition.state.round.id)) this.withRoomStatus(transition, this.playerCount())
    this.game = transition.state
    if (stateChanged || transition.events.some(event => event.type !== 'reject')) this.persist()
    if (snapshotFirst) this.snapshot(snapshotFirst)
    for (const event of transition.events) {
      switch (event.type) {
        case 'cleared':
          for (const ws of this.liveSockets()) this.snapshot(ws)
          break
        case 'roundEnded':
          try { await this.onRoundEnded(event.event) } catch { console.warn('[PixelRoom] Round-ended hook failed') }
          break
        case 'roomStatus':
          try { await this.onRoomStatus(event.event) } catch { console.warn('[PixelRoom] Room-status hook failed') }
          break
        case 'reject': if (sender) this.sendGame(sender, { t: 'reject', reason: event.reason, x: event.x, y: event.y, ...(event.retryAt === undefined ? {} : { retryAt: event.retryAt }) }); break
        default: {
          const { type, ...payload } = event
          this.broadcastGame({ t: type, ...payload } as ServerMsg)
        }
      }
    }
    if (previousRound !== this.game.round && !transition.events.some(event => event.type === 'round' || event.type === 'cleared')) {
      this.broadcastGame({ t: 'round', round: this.game.round })
    }
  }

  private async reserveBudget(): Promise<{ ok: boolean }> {
    try {
      const ok = await reserveBudget(this.env)
      if (ok && this.restingDay !== null) {
        this.restingDay = null
        this.persist()
      }
      return { ok }
    } catch {
      return { ok: false }
    }
  }

  private async judge(reason: 'tick' | 'ask', requester?: WebSocket): Promise<void> {
    if (!this.game) return
    const previousRound = this.game.round
    const outcome = await runJudge({
      now: Date.now,
      reserve: () => this.reserveBudget(),
      persist: async () => { this.persist() },
      render: async (state, zone) => toBase64(await renderZonePng(state.grid, zone, JUDGE.renderPx)),
      callJudge: async (png) => {
        if (configuredJudgeMode() !== 'real') return '{"guesses":["sun"],"confidence":0.5}'
        try {
          return await withTimeout((async () => {
            const result = await createServerTools(this.env).integration('anthropic/chat-completion', buildJudgeBody(png))
            return result.success ? extractText(result) : null
          })(), 20000, null)
        } catch {
          return null
        }
      },
      getState: () => this.game!,
    }, this.game, reason, this.playerCount(), MODES[this.game.mode].zones[0])
    if (outcome.kind === 'resting') this.restingDay = utcDay(Date.now())
    if (outcome.kind === 'failed') console.warn('[PixelRoom] Judge attempt failed; retrying on the next eligible tick')
    const transition = applyJudgeOutcome(this.game, outcome, Date.now())
    if (previousRound.askAvailableAt !== transition.state.round.askAvailableAt && !transition.events.some(event => event.type === 'round' || event.type === 'cleared')) {
      transition.events.push({ type: 'round', round: transition.state.round })
    }
    await this.transition(transition)
    if (requester && outcome.kind === 'skipped') {
      if (outcome.why === 'unchanged') this.sendGame(requester, { t: 'reject', reason: 'canvas_unchanged' })
      else if (['too_soon', 'rate_cap', 'in_flight'].includes(outcome.why)) {
        const calls = this.game.judgeCalls.filter(time => time > Date.now() - 60000).sort((left, right) => left - right)
        const rateReady = calls.length >= JUDGE.maxPerMinute ? calls[calls.length - JUDGE.maxPerMinute] + 60000 : 0
        this.sendGame(requester, { t: 'reject', reason: 'ask_too_soon', retryAt: Math.max(this.game.round.askAvailableAt, rateReady) })
      } else this.sendGame(requester, { t: 'reject', reason: 'round_inactive' })
    }
  }
}
