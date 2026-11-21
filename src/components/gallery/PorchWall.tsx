import { useContext, useLayoutEffect, useRef, useState } from 'react'
import { SceneComposition } from '../../scene/PixelScene'
import { DETAIL } from '../../scene/detail'
import { sceneSize, type Composition } from '../../scene/camera'
import { paintWallTile } from '../../scene/porch/wallArt'
import { WALL_TILE, WALL_VIEW_RIGHT } from '../../scene/porch/wallLayout'
import { useSceneScale } from '../../scene/useSceneScale'
import './gallery.css'

const tiles = new Map<string, string>()

/** One tile of siding as an image URL (painted once per composition and roof height, then reused by every scene). */
function tileUrl(composition: Composition, roofTop: number): string | null {
  if (typeof document === 'undefined') return null
  const key = `${composition}|${roofTop}`
  const cached = tiles.get(key)
  if (cached) return cached
  const size = sceneSize(composition)
  const canvas = document.createElement('canvas')
  canvas.width = WALL_TILE * DETAIL
  canvas.height = size.h * DETAIL
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  ctx.scale(DETAIL, DETAIL)
  paintWallTile(ctx, composition, roofTop)
  const url = canvas.toDataURL('image/png')
  tiles.set(key, url)
  return url
}

/**
 * The house wall that carries on to the left of the porch (scene x < 0), as a child of any porch `PixelScene`: the siding is one
 * painted tile repeated, exactly one camera view long (it never grows with the paintings). It is in every porch scene a camera can
 * be mid-pan through on its way to or from the gallery, so both ends of a hand-off draw the same wall.
 */
export function PorchWall() {
  const composition = useContext(SceneComposition)
  const ref = useRef<HTMLDivElement>(null)
  const { scale, w, h } = useSceneScale(ref)
  const [url, setUrl] = useState<string | null>(null)
  const sceneH = sceneSize(composition).h
  const roofTop = scale && h ? Math.max(0, Math.floor((sceneH - h / scale) / 2)) : 0
  useLayoutEffect(() => { if (scale) setUrl(tileUrl(composition, roofTop)) }, [composition, roofTop, scale])
  const length = scale && w ? Math.ceil(w / scale) + WALL_VIEW_RIGHT + 8 : WALL_TILE
  return (
    <div
      ref={ref}
      className="porch-wall"
      data-testid="porch-wall"
      aria-hidden="true"
      style={{ width: `calc(var(--px) * ${length})`, backgroundImage: url ? `url(${url})` : undefined, backgroundSize: `calc(var(--px) * ${WALL_TILE}) 100%` }}
    />
  )
}
