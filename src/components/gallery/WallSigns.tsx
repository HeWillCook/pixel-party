import type { CSSProperties, MouseEvent } from 'react'
import { PixelIconCanvas } from '../daily/PixelMedals'
import { P } from '../../scene/palette'
import { DetailGrid } from '../../scene/detail'
import { defineSprite } from '../../scene/sprite'
import { WALL_ARROW, WALL_PLANK } from '../../scene/porch/wallLayout'
import type { Rect } from '../../scene/camera'

const unit = (n: number) => `calc(var(--px) * ${n})`
const place = (rect: Rect): CSSProperties => ({ left: unit(rect.x), top: unit(rect.y), width: unit(rect.w), height: unit(rect.h) })
const stop = (event: MouseEvent) => event.stopPropagation()

/** A wooden arrow sign on two nails, pointing right, on the porch's 2x detail grid (26x32 art pixels = 13x16 scene units). */
function makeArrowSprite() {
  const g = new DetailGrid(26, 32)
  const filled = (x: number, y: number) => {
    if (x >= 1 && x <= 16) return y >= 12 && y <= 25
    if (x >= 17 && x <= 25) { const half = 9 - (x - 17); return y >= 18 - half && y <= 19 + half }
    return false
  }
  for (let y = 0; y < 32; y++) for (let x = 0; x < 26; x++) {
    if (!filled(x, y)) continue
    const edge = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1)
    g.px(x, y, edge ? 'o' : !filled(x, y - 2) ? 'h' : !filled(x, y + 2) ? 's' : 'f')
  }
  for (const x of [7, 16]) { g.rect(x, 3, 1, 9, 'r'); g.px(x, 2, 'n'); g.px(x, 3, 'n') }
  g.rect(5, 17, 9, 3, 'o')
  for (let d = 0; d < 5; d++) g.rect(14 + d, 13 + d, 1, 11 - 2 * d, 'o')
  return defineSprite(g.lines(), { o: P.wood[0], f: P.wood[3], h: P.wood[4], s: P.wood[2], r: P.wood[1], n: P.paper[4] })
}
const arrowSprite = makeArrowSprite()

/** An arrow sign on the wall: a real button, hung on the siding at `rect`. `dir` is the way it points (left = newer, right = older). */
export function WallArrow({ dir, rect, onTurn }: { dir: 'left' | 'right'; rect: Rect; onTurn: () => void }) {
  return (
    <button
      type="button"
      className={`wall-arrow wall-arrow--${dir}`}
      data-testid={dir === 'left' ? 'gallery-prev' : 'gallery-next'}
      aria-label={dir === 'left' ? 'Previous page: newer paintings' : 'Next page: older paintings'}
      style={place({ x: rect.x, y: rect.y, w: WALL_ARROW.w, h: WALL_ARROW.h })}
      onClick={(event) => { stop(event); onTurn() }}
      onPointerDown={stop}
    >
      <PixelIconCanvas sprite={arrowSprite} scale="scene" className="wall-arrow__art" />
    </button>
  )
}

/** The plank under the rail that says which page the wall is on, "3 / 12". */
export function WallPlank({ rect, page, pages }: { rect: Rect; page: number; pages: number }) {
  return (
    <p className="wall-plank" data-testid="gallery-plank" role="status" aria-label={`Page ${page} of ${pages}`} style={place({ x: rect.x, y: rect.y, w: WALL_PLANK.w, h: WALL_PLANK.h })} onClick={stop}>
      {page} / {pages}
    </p>
  )
}
