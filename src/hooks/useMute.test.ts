import { expect, it, vi } from 'vitest'

const subscriptions = vi.hoisted(() => [] as Array<() => boolean>)
const listeners = vi.hoisted(() => [] as Array<ReturnType<typeof vi.fn>>)
vi.mock('react', () => ({
  useSyncExternalStore: (subscribe: (listener: () => void) => void, getSnapshot: () => boolean) => {
    const listener = vi.fn()
    listeners.push(listener)
    subscribe(listener)
    subscriptions.push(getSnapshot)
    return getSnapshot()
  },
}))

import { useMute } from './useMute'

it('syncs two hook instances and storage events', () => {
  const events = new EventTarget()
  const values = new Map<string, string>()
  vi.stubGlobal('window', Object.assign(events, { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } }))
  const first = useMute()
  useMute()
  first.toggle()
  expect(subscriptions.map(read => read())).toEqual([true, true])
  expect(listeners.map(listener => listener.mock.calls.length)).toEqual([1, 1])
  values.set('pixel-party:muted', '0')
  events.dispatchEvent(new Event('storage'))
  expect(subscriptions.map(read => read())).toEqual([false, false])
  expect(listeners.map(listener => listener.mock.calls.length)).toEqual([2, 2])
  vi.unstubAllGlobals()
})
