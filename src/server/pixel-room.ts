import { BaseRoom } from 'deepspace/worker'
import type { UserAttachment } from 'deepspace/worker'
import type { Env } from '../../worker.js'

/** One server-authoritative game room per room id. Game protocol is added in later tasks. */
export class PixelRoom extends BaseRoom<Env> {
  protected onMessage(
    _ws: WebSocket,
    _user: UserAttachment,
    _message: { type: string; [key: string]: unknown },
  ): void {
    // Ignore messages until game commands and their authorization rules are implemented.
  }
}
