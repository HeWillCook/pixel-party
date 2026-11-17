import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createRoom, deleteRoom, joinRoom } from './rooms'
import { createServerTools } from '../server/server-tools'

export const actions: Record<string, ActionHandler<Env>> = {
  createRoom: ({ env, userId, params }) => createRoom(createServerTools(env), userId, params),
  deleteRoom: ({ env, userId, params }) => deleteRoom(createServerTools(env), userId, params, async room => {
    const namespace = env.PIXEL_ROOMS
    const response = await namespace.get(namespace.idFromName(room.recordId)).fetch(new Request('https://pixel/close', {
      method: 'POST', headers: {
        'X-Room-Id': room.recordId, 'X-Room-Mode': room.data.mode,
        'X-Room-Default': 'false', 'X-Room-Host': userId,
      },
    }))
    if (!response.ok) throw new Error('Room shutdown failed')
  }),
  joinRoom: ({ env, userId, params }) => joinRoom(createServerTools(env), userId, params),
}
