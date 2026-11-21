import { useLayoutEffect, useEffect, useState } from 'react'
import { settledNavHeight } from './navMetrics'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export interface StageMeasure { viewport: { w: number; h: number }; navHeight: number }

const read = (): StageMeasure => ({ viewport: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }, navHeight: settledNavHeight() })

/** The window's size and the nav's settled height, which every close-up frames its camera from: only a real window resize changes it (a scrollbar appearing mid-zoom does not, nor does the nav's own compact <-> full transition). */
export function useStageMeasure(): StageMeasure {
  const [measure, setMeasure] = useState<StageMeasure>(() => typeof window === 'undefined' ? { viewport: { w: 0, h: 0 }, navHeight: 72 } : read())
  useIsomorphicLayoutEffect(() => {
    const sync = () => {
      const next = read()
      setMeasure((cur) => cur.viewport.w === next.viewport.w && cur.viewport.h === next.viewport.h && cur.navHeight === next.navHeight ? cur : next)
    }
    window.addEventListener('resize', sync)
    // The bar's height settles after a transition (a Daily close-up hands over to Scores with the compact bar still on screen): re-read as it moves, and the settled value is what counts.
    const nav = document.querySelector('[data-testid="app-navigation"]')
    const observer = nav && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    if (nav) observer?.observe(nav)
    sync()
    return () => { window.removeEventListener('resize', sync); observer?.disconnect() }
  }, [])
  return measure
}
