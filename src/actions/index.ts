import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createRoom, joinRoom } from './rooms'
import { createServerTools } from '../server/server-tools'

export const actions: Record<string, ActionHandler<Env>> = {
  createRoom: ({ env, userId, params }) => createRoom(createServerTools(env), userId, params),
  joinRoom: ({ env, userId, params }) => joinRoom(createServerTools(env), userId, params),
}
