import { describe, expect, it } from 'vitest'
import { parseClientMsg } from './protocol'

describe('parseClientMsg', () => {
  it('accepts the supported messages', () => {
    for (const msg of [{ t: 'place', x: 1, y: 2, c: 3 }, { t: 'ask' }, { t: 'next' }, { t: 'team', team: 'red' }]) {
      expect(parseClientMsg(JSON.stringify(msg))).toEqual(msg)
    }
  })
  it('rejects malformed, oversized and unknown messages', () => {
    for (const raw of ['no', 'x'.repeat(300), '{"t":"nuke"}', '{"t":"place","x":"1","y":2,"c":3}', '{"t":"team","team":"green"}', 'null', '[]']) {
      expect(parseClientMsg(raw)).toBeNull()
    }
  })
})
