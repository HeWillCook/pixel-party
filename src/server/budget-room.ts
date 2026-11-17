import { BaseRoom } from 'deepspace/worker'
import type { Env } from '../../worker.js'
import { BUDGET } from '../game/config'

export class BudgetRoom extends BaseRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    this.sql.exec('CREATE TABLE IF NOT EXISTS budget (day TEXT PRIMARY KEY, used INTEGER NOT NULL)')
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/reserve') return new Response('Not found', { status: 404 })
    const day = new Date().toISOString().slice(0, 10)
    const result = this.state.storage.transactionSync(() => {
      const used = this.sql.exec<{ used: number }>('SELECT used FROM budget WHERE day = ?', day).toArray()[0]?.used ?? 0
      if (used >= BUDGET.dailyCalls) return { ok: false, used, cap: BUDGET.dailyCalls }
      this.sql.exec('INSERT INTO budget (day, used) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET used = excluded.used', day, used + 1)
      return { ok: true, used: used + 1, cap: BUDGET.dailyCalls }
    })
    return Response.json(result)
  }

  protected onMessage(): void {}
}
