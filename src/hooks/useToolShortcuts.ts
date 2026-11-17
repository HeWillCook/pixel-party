import { useEffect, useRef } from 'react'
import type { Tool } from '../game/tools'

export type ShortcutAction =
  | { type: 'select'; tool: Tool }
  | { type: 'undo' }
  | { type: 'redo' }

export interface ShortcutKeyInput {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  defaultPrevented: boolean
  isEditableTarget: boolean
}

const KEY_TO_TOOL: Record<string, Tool> = {
  b: 'paint',
  e: 'erase',
  f: 'fill',
  i: 'pick',
}

export function resolveShortcutAction(
  input: ShortcutKeyInput,
  tools: readonly Tool[],
): ShortcutAction | null {
  if (input.defaultPrevented || input.isEditableTarget || input.altKey) return null
  const key = input.key.toLowerCase()
  const mod = input.metaKey || input.ctrlKey

  if (mod) {
    if (key === 'z') {
      return input.shiftKey ? { type: 'redo' } : { type: 'undo' }
    }
    return null
  }

  const tool = KEY_TO_TOOL[key]
  if (tool && tools.includes(tool)) {
    return { type: 'select', tool }
  }
  return null
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as { tagName?: unknown; isContentEditable?: unknown }
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return el.isContentEditable === true
}

export interface UseToolShortcutsOptions {
  tools: readonly Tool[]
  onSelect: (tool: Tool) => void
  onUndo?: () => void
  onRedo?: () => void
  enabled: boolean
}

export function useToolShortcuts({
  tools,
  onSelect,
  onUndo,
  onRedo,
  enabled,
}: UseToolShortcutsOptions): void {
  const latestRef = useRef({ tools, onSelect, onUndo, onRedo })
  latestRef.current = { tools, onSelect, onUndo, onRedo }

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const onKeyDown = (e: KeyboardEvent) => {
      const { tools: allowed, onSelect: select, onUndo: undo, onRedo: redo } = latestRef.current
      const action = resolveShortcutAction(
        {
          key: e.key,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          defaultPrevented: e.defaultPrevented,
          isEditableTarget: isEditableElement(e.target),
        },
        allowed,
      )
      if (!action) return
      if (action.type === 'select') {
        e.preventDefault()
        select(action.tool)
      } else if (action.type === 'undo' && undo) {
        e.preventDefault()
        undo()
      } else if (action.type === 'redo' && redo) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
