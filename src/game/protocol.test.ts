import { describe, expect, it } from 'vitest'
import { parseClientMsg, parseServerMsg, type ServerMsg } from './protocol'

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

describe('parseServerMsg', () => {
  it('parses noop messages keeping optional id and rejects malformed noop or unknown tags', () => {
    expect(parseServerMsg(JSON.stringify({ t: 'noop', x: 3, y: 4 }))).toEqual({ t: 'noop', x: 3, y: 4 })
    expect(parseServerMsg(JSON.stringify({ t: 'noop', x: 3, y: 4, id: 12, extra: 'ignored' }))).toEqual({ t: 'noop', x: 3, y: 4, id: 12 })
    for (const bad of [
      'not-json',
      'null',
      '{"t":"unknown"}',
      '{"t":"noop"}',
      '{"t":"noop","x":"3","y":4}',
      '{"t":"noop","x":3,"y":null}',
      '{"t":"noop","x":3,"y":4,"id":-1}',
      '{"t":"noop","x":3,"y":4,"id":"1"}',
    ]) {
      expect(parseServerMsg(bad)).toBeNull()
    }
  })
})

it('accepts bounded placement batches, keeps optional id while stripping unknown fields, and rejects malformed cells or excessive work', () => {
  const cells = Array.from({ length: 64 }, (_, x) => ({ x, y: 0, c: 4 }))
  expect(parseClientMsg(JSON.stringify({ t: 'place', cells }))).toEqual({ t: 'place', cells })
  expect(parseClientMsg(JSON.stringify({ t: 'place', cells: [{ x: 1, y: 2, c: 0, id: 7, extra: 'drop' }] }))).toEqual({
    t: 'place',
    cells: [{ x: 1, y: 2, c: 0, id: 7 }],
  })
  expect(parseClientMsg(JSON.stringify({ t: 'place', x: 1, y: 2, c: 0, id: 9, extra: 'drop' }))).toEqual({
    t: 'place',
    x: 1,
    y: 2,
    c: 0,
    id: 9,
  })
  for (const bad of [[], [...cells, cells[0]], [{ x: '1', y: 0, c: 4 }], [{ x: 1, y: 0, c: 0, id: -1 }], [{ x: 1, y: 0, c: 0, id: '7' }], [null]]) {
    expect(parseClientMsg(JSON.stringify({ t: 'place', cells: bad }))).toBeNull()
  }
  expect(parseClientMsg(JSON.stringify({ t: 'place', x: 1, y: 2, c: 0, id: 'bad' }))).toBeNull()
  expect(parseClientMsg(' '.repeat(4097))).toBeNull()
})
