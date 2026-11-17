import { describe, expect, it } from 'vitest'
import { parseClientMsg, type ServerMsg } from './protocol'

describe('parseClientMsg', () => {
  it('types the unchanged-canvas rejection used to acknowledge ask commands', () => {
    const reply: ServerMsg = { t: 'reject', reason: 'canvas_unchanged' }
    expect(JSON.parse(JSON.stringify(reply))).toEqual({ t: 'reject', reason: 'canvas_unchanged' })
  })
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

it('accepts bounded placement batches and rejects malformed cells or excessive work', () => {
  const cells = Array.from({ length: 64 }, (_, x) => ({ x, y: 0, c: 4 }))
  expect(parseClientMsg(JSON.stringify({ t: 'place', cells }))).toEqual({ t: 'place', cells })
  for (const bad of [[], [...cells, cells[0]], [{ x: '1', y: 0, c: 4 }], [null]]) {
    expect(parseClientMsg(JSON.stringify({ t: 'place', cells: bad }))).toBeNull()
  }
  expect(parseClientMsg(' '.repeat(4097))).toBeNull()
})
