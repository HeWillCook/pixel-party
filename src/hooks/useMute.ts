import { useSyncExternalStore } from 'react'
import { MUTE_KEY } from '../lib/sfx'

const changeEvent = 'pixle:mute-change'
let fallback = false

function readMute() {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem(MUTE_KEY) === '1' } catch { return fallback }
}

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener)
  window.addEventListener(changeEvent, listener)
  return () => {
    window.removeEventListener('storage', listener)
    window.removeEventListener(changeEvent, listener)
  }
}

function toggle() {
  fallback = !readMute()
  try { window.localStorage.setItem(MUTE_KEY, fallback ? '1' : '0') } catch { }
  window.dispatchEvent(new Event(changeEvent))
}

export function useMute(): { muted: boolean; toggle: () => void } {
  const muted = useSyncExternalStore(subscribe, readMute, () => false)
  return { muted, toggle }
}
