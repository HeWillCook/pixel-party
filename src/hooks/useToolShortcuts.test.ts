import { describe, expect, it } from 'vitest'
import { DAILY_TOOLS, PARTY_TOOLS } from '../game/tools'
import { resolveShortcutAction } from './useToolShortcuts'

const event = (overrides: Partial<Parameters<typeof resolveShortcutAction>[0]> = {}) => ({
  key: '',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  isEditableTarget: false,
  ...overrides,
})

describe('resolveShortcutAction', () => {
  it('maps B, E, F, I to tools allowed in the current mode', () => {
    expect(resolveShortcutAction(event({ key: 'b' }), DAILY_TOOLS)).toEqual({ type: 'select', tool: 'paint' })
    expect(resolveShortcutAction(event({ key: 'E' }), DAILY_TOOLS)).toEqual({ type: 'select', tool: 'erase' })
    expect(resolveShortcutAction(event({ key: 'f' }), DAILY_TOOLS)).toEqual({ type: 'select', tool: 'fill' })
    expect(resolveShortcutAction(event({ key: 'i' }), DAILY_TOOLS)).toEqual({ type: 'select', tool: 'pick' })
    expect(resolveShortcutAction(event({ key: 'f' }), PARTY_TOOLS)).toBeNull()
  })

  it('maps Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z to undo and redo', () => {
    expect(resolveShortcutAction(event({ key: 'z', metaKey: true }), DAILY_TOOLS)).toEqual({ type: 'undo' })
    expect(resolveShortcutAction(event({ key: 'z', ctrlKey: true }), DAILY_TOOLS)).toEqual({ type: 'undo' })
    expect(resolveShortcutAction(event({ key: 'Z', metaKey: true, shiftKey: true }), DAILY_TOOLS)).toEqual({ type: 'redo' })
    expect(resolveShortcutAction(event({ key: 'z', ctrlKey: true, shiftKey: true }), DAILY_TOOLS)).toEqual({ type: 'redo' })
  })

  it('ignores editable targets and modified letter keys', () => {
    expect(resolveShortcutAction(event({ key: 'b', isEditableTarget: true }), DAILY_TOOLS)).toBeNull()
    expect(resolveShortcutAction(event({ key: 'z', metaKey: true, isEditableTarget: true }), DAILY_TOOLS)).toBeNull()
    expect(resolveShortcutAction(event({ key: 'f', metaKey: true }), DAILY_TOOLS)).toBeNull()
    expect(resolveShortcutAction(event({ key: 'b', altKey: true }), DAILY_TOOLS)).toBeNull()
    expect(resolveShortcutAction(event({ key: 'b', defaultPrevented: true }), DAILY_TOOLS)).toBeNull()
  })
})
