import { afterEach, expect, it, vi } from 'vitest'

const hook = vi.hoisted(() => ({ effect: null as null | (() => () => void), setFrame: vi.fn() }))
vi.mock('react', () => ({
  useState: () => [0, hook.setFrame],
  useEffect: (effect: () => () => void) => { hook.effect = effect },
}))

import { useSceneClock } from './useSceneClock'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('freezes for reduced motion and pauses while hidden', () => {
  let motionListener = () => {}
  let visibilityListener = () => {}
  const motion = { matches: true, addEventListener: (_event: string, listener: () => void) => { motionListener = listener }, removeEventListener: vi.fn() }
  const documentMock = { hidden: false, addEventListener: (_event: string, listener: () => void) => { visibilityListener = listener }, removeEventListener: vi.fn() }
  const request = vi.fn(() => 1)
  const cancel = vi.fn()
  vi.stubGlobal('window', { matchMedia: () => motion, requestAnimationFrame: request, cancelAnimationFrame: cancel })
  vi.stubGlobal('document', documentMock)

  useSceneClock()
  const cleanup = hook.effect!()
  expect(hook.setFrame).toHaveBeenCalledWith(0)
  expect(request).not.toHaveBeenCalled()
  motion.matches = false
  motionListener()
  expect(request).toHaveBeenCalledOnce()
  documentMock.hidden = true
  visibilityListener()
  expect(cancel).toHaveBeenCalledWith(1)
  expect(request).toHaveBeenCalledOnce()
  documentMock.hidden = false
  visibilityListener()
  expect(request).toHaveBeenCalledTimes(2)
  cleanup()
})
