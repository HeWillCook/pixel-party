import { useLayoutEffect, useState, type RefObject } from 'react'
import { compositionFor, integerScale, type Composition } from './camera'
import { wallPageLayout } from './porch/wallLayout'

/** The integer pixel scale (what `--px` is set to) and size of the `PixelScene` an element sits in, kept current on resize. */
export function useSceneScale(ref: RefObject<HTMLElement | null>): { scale: number; w: number; h: number } {
  const [box, setBox] = useState({ scale: 0, w: 0, h: 0 })
  useLayoutEffect(() => {
    const scene = ref.current?.closest<HTMLElement>('.pixel-scene')
    if (!scene) return
    const measure = () => {
      // From the size, with the scene's own formula: reading `--px` here would race the scene's re-render after a resize.
      const w = scene.clientWidth, h = scene.clientHeight
      const scale = w && h ? integerScale(w, h, compositionFor(w, h)) : 0
      setBox((cur) => cur.scale === scale && cur.w === w && cur.h === h ? cur : { scale, w, h })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scene)
    return () => observer.disconnect()
  }, [ref])
  return box
}

/** The wall's page grid for the scene an element sits in, plus that scene's scale and size. `count` is the gallery's painting count. */
export function useWallPageLayout(ref: RefObject<HTMLElement | null>, composition: Composition, count: number) {
  const { scale, w, h } = useSceneScale(ref)
  return { scale, w, h, layout: wallPageLayout(composition, { w, h }, scale, count) }
}
