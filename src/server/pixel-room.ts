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
  advance, applyJudgeOutcome, applyPlacement, countPlayers, deserializeRoomState,
  newRoomState, nextAlarmAt, serializeRoomState, startNextRound,
  type RoomState, type RoomTransition, type RoundEndedEvent, type RoomStatusEvent,
} from '../game/room-logic'
import { cooldownMs } from '../game/rules'
import { createServerTools } from './server-tools'

type RoomInit = Pick<RoomState, 'roomId' | 'mode' | 'isDefaultBoard'>
type SavedRoom = { room_id: string; mode: string; is_default: number; state: string; resting_day: string | null }
const finite = z.number().finite()
const roomStateSchema = z.object({
  roomId: z.string().min(1), isDefaultBoard: z.boolean(), mode: z.enum(['coop', 'team']),
  grid: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), cells: z.instanceof(Uint8Array), placedBy: z.array(z.string()) }),
  version: finite.int().nonnegative(), lastJudgedVersion: finite.int().nonnegative(),
  round: z.object({
    id: z.string().min(1), word: z.string().min(1), state: z.enum(['playing', 'intermission', 'paused']),
    startedAt: finite, endsAt: finite.nullable(), askAvailableAt: finite, endedAt: finite.optional(),
    result: z.object({ outcome: z.enum(['won', 'timeout', 'teamWin']), score: finite.optional(), winningTeam: z.enum(['red', 'blue', 'draw']).optional() }).optional(),
  }),
  wordEntry: z.object({ word: z.string().min(1), synonyms: z.array(z.string()), tier: z.enum(['easy', 'medium']) }),
  recentWords: z.array(z.string()), lastGuesses: z.array(z.string()), roundCounter: finite.int().nonnegative(),
  lastPlacedAt: z.record(z.string(), finite), judgeCalls: z.array(finite), lastJudgedAt: finite,
  judgeInFlight: z.boolean(), emptySince: finite.nullable(), intermissionEndsAt: finite.nullable(),
  pausedAt: finite.nullable(), pausedFrom: z.enum(['playing', 'intermission']).nullable(),
  status: z.enum(['playing', 'intermission', 'paused', 'closed']),
})

function signedInId(userId: string | null | undefined): string | null {
  return userId && !isAnonymousUserId(userId) ? userId : null
}

export function restorePixelState(json: string, init: RoomInit, now: number, rng: () => number): RoomState {
  try {
    const decoded = deserializeRoomState(json)
    const defaults = newRoomState(init, now, rng)
    const restored = roomStateSchema.parse({ ...defaults, ...decoded, ...init, recentWords: decoded.recentWords ?? [decoded.wordEntry.word], judgeInFlight: false })
    const config = MODES[restored.mode]
    if (restored.grid.width !== config.width || restored.grid.height !== config.height || restored.grid.placedBy.length !== restored.grid.cells.length || restored.grid.cells.some(color => color >= PALETTE.length) || restored.wordEntry.word !== restored.round.word) {
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
  return hostUserId === verifiedId || (!state.isDefaultBoard && hostUserId === null) ? null : 'not_host'
}

export class PixelRoom extends BaseRoom<Env> {
  private game: RoomState | null = null
  private restingDay: string | null = null

  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    this.sql.exec('CREATE TABLE IF NOT EXISTS pixel_state (id INTEGER PRIMARY KEY CHECK (id = 1), room_id TEXT NOT NULL, mode TEXT NOT NULL, is_default INTEGER NOT NULL, state TEXT NOT NULL, resting_day TEXT)')
    const saved = this.sql.exec<SavedRoom>('SELECT room_id, mode, is_default, state, resting_day FROM pixel_state WHERE id = 1').toArray()[0]
    if (saved) {
      this.game = restorePixelState(saved.state, { roomId: saved.room_id, mode: saved.mode === 'team' ? 'team' : 'coop', isDefaultBoard: saved.is_default === 1 }, Date.now(), Math.random)
      this.restingDay = saved.resting_day
      this.persist()
      void this.state.blockConcurrencyWhile(() => this.armAlarm())
    }
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket' && !this.game) {
      const roomId = request.headers.get('X-Room-Id')
      const mode = request.headers.get('X-Room-Mode')
      const isDefault = request.headers.get('X-Room-Default')
      if (!roomId || (mode !== 'coop' && mode !== 'team') || (isDefault !== 'true' && isDefault !== 'false')) return new Response('Missing room configuration', { status: 400 })
      this.game = newRoomState({ roomId, mode: mode as Mode, isDefaultBoard: isDefault === 'true' }, Date.now(), Math.random)
      this.persist()
    }
    return super.fetch(request)
  }

  override async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (typeof message !== 'string' || !parseClientMsg(message)) return
    await super.webSocketMessage(ws, message)
  }

  protected override async onConnect(ws: WebSocket, user: UserAttachment): Promise<void> {
    ws.serializeAttachment(user)
    await this.transition(advance(this.game!, Date.now(), this.playerCount(), Math.random))
    this.snapshot(ws)
    this.broadcastGame({ t: 'players', count: this.playerCount() })
    await this.armAlarm()
  }

  protected override async onMessage(ws: WebSocket, user: UserAttachment, message: { type: string; [key: string]: unknown }): Promise<void> {
    const command = parseClientMsg(JSON.stringify(message))
    if (!command || !this.game) return
    const userId = signedInId(user.userId)
    await this.transition(advance(this.game, Date.now(), this.playerCount(), Math.random))
    if (command.t !== 'place' && !userId) {
      this.sendGame(ws, { t: 'reject', reason: 'not_signed_in' })
    } else if (command.t === 'place') {
      await this.transition(applyPlacement(this.game, { ...command, userId }, Date.now(), this.playerCount()), ws)
    } else if (command.t === 'ask') {
      await this.judge('ask', ws)
    } else if (command.t === 'next') {
      const reason = nextCommandRejection(this.game, userId)
      if (reason) this.sendGame(ws, { t: 'reject', reason })
      else await this.transition(startNextRound(this.game, Date.now(), Math.random))
    }
    await this.armAlarm()
  }

  protected override async onDisconnect(ws: WebSocket): Promise<void> {
    ws.close(1000, 'Disconnected')
    if (!this.game) return
    await this.transition(advance(this.game, Date.now(), this.playerCount(ws), Math.random))
    this.broadcastGame({ t: 'players', count: this.playerCount(ws) })
    await this.armAlarm()
  }

  protected override async onAlarm(): Promise<void> {
    if (!this.game) return
    await this.transition(advance(this.game, Date.now(), this.playerCount(), Math.random))
    await this.judge('tick')
    await this.armAlarm()
  }

  protected async onRoundEnded(_result: RoundEndedEvent): Promise<void> {}

  protected async onRoomStatus(_status: RoomStatusEvent): Promise<void> {}

  private liveSockets(exclude?: WebSocket): WebSocket[] {
    return this.getWebSockets().filter(ws => ws !== exclude && ws.readyState === WebSocket.OPEN)
  }

  private playerCount(exclude?: WebSocket): number {
    return countPlayers(this.liveSockets(exclude).map(ws => ({ userId: signedInId(this.getAttachment(ws)?.userId) })))
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
      cells: encodeCells(state.grid.cells), round: state.round, players,
      you: { userId, cooldownUntil: placedAt === undefined ? 0 : placedAt + cooldownMs(players) },
      aiResting: this.restingDay === new Date().toISOString().slice(0, 10),
    })
  }

  private persist(): void {
    if (!this.game) return
    this.sql.exec('INSERT OR REPLACE INTO pixel_state (id, room_id, mode, is_default, state, resting_day) VALUES (1, ?, ?, ?, ?, ?)', this.game.roomId, this.game.mode, Number(this.game.isDefaultBoard), serializeRoomState(this.game), this.restingDay)
  }

  private async armAlarm(): Promise<void> {
    const at = this.game ? nextAlarmAt(this.game, Date.now()) : null
    if (at === null) await this.state.storage.deleteAlarm()
    else await this.state.storage.setAlarm(at)
  }

  private async transition(transition: RoomTransition, sender?: WebSocket): Promise<void> {
    const previousRound = this.game?.round
    this.game = transition.state
    this.persist()
    for (const event of transition.events) {
      switch (event.type) {
        case 'cleared':
          for (const ws of this.liveSockets()) this.snapshot(ws)
          break
        case 'roundEnded': await this.onRoundEnded(event.event); break
        case 'roomStatus': await this.onRoomStatus(event.event); break
        case 'reject': if (sender) this.sendGame(sender, { t: 'reject', reason: event.reason, ...(event.retryAt === undefined ? {} : { retryAt: event.retryAt }) }); break
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
      const namespace = this.env.BUDGET_ROOMS
      const response = await namespace.get(namespace.idFromName('global')).fetch(new Request('https://budget/reserve', { method: 'POST' }))
      if (!response.ok) return { ok: false }
      const result = await response.json() as { ok?: unknown }
      if (result.ok === true) this.restingDay = null
      return { ok: result.ok === true }
    } catch {
      return { ok: false }
    }
  }

  private async judge(reason: 'tick' | 'ask', requester?: WebSocket): Promise<void> {
    if (!this.game) return
    const outcome = await runJudge({
      now: Date.now,
      reserve: () => this.reserveBudget(),
      persist: async () => { this.persist() },
      render: async (state, zone) => toBase64(await renderZonePng(state.grid, zone, JUDGE.renderPx)),
      callJudge: async (png) => {
        const result = await createServerTools(this.env).integration('anthropic/chat-completion', buildJudgeBody(png))
        return result.success ? extractText(result) : null
      },
      getState: () => this.game!,
    }, this.game, reason, this.playerCount(), MODES[this.game.mode].zones[0])
    if (outcome.kind === 'resting') this.restingDay = new Date().toISOString().slice(0, 10)
    if (outcome.kind === 'failed') console.warn('[PixelRoom] Judge attempt failed; retrying on the next eligible tick')
    await this.transition(applyJudgeOutcome(this.game, outcome, Date.now()))
    if (requester && outcome.kind === 'skipped') {
      if (outcome.why === 'not_playing') this.sendGame(requester, { t: 'reject', reason: 'round_inactive' })
      else if (['too_soon', 'rate_cap', 'in_flight'].includes(outcome.why)) {
        const calls = this.game.judgeCalls.filter(time => time > Date.now() - 60000).sort((left, right) => left - right)
        const rateReady = calls.length >= JUDGE.maxPerMinute ? calls[calls.length - JUDGE.maxPerMinute] + 60000 : 0
        this.sendGame(requester, { t: 'reject', reason: 'ask_too_soon', retryAt: Math.max(this.game.round.askAvailableAt, rateReady) })
      }
    }
  }
}
