import { useLayoutEffect, useEffect, useState } from 'react'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export interface StageMeasure { viewport: { w: number; h: number }; navHeight: number }

const read = (): StageMeasure => {
  const navHeight = document.querySelector('[data-testid="app-navigation"]')?.getBoundingClientRect().height || 72
  return { viewport: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }, navHeight }
}

/** The window's size and the nav's height, which every close-up frames its camera from: only a real window resize changes it (a scrollbar appearing mid-zoom does not). */
export function useStageMeasure(): StageMeasure {
  const [measure, setMeasure] = useState<StageMeasure>(() => typeof window === 'undefined' ? { viewport: { w: 0, h: 0 }, navHeight: 72 } : read())
  useIsomorphicLayoutEffect(() => {
    const sync = () => {
      const next = read()
      setMeasure((cur) => cur.viewport.w === next.viewport.w && cur.viewport.h === next.viewport.h && cur.navHeight === next.navHeight ? cur : next)
    }
    window.addEventListener('resize', sync)
    sync()
    return () => window.removeEventListener('resize', sync)
  }, [])
  return measure
}
