import { useContext, useLayoutEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { PixelMedal } from '../daily/PixelMedals'
import { PixelThumb } from '../daily/PixelThumb'
import { SceneComposition } from '../../scene/PixelScene'
import { captionType, wallPageCount, wallSlot, type WallPageLayout } from '../../scene/porch/wallLayout'
import { useWallPageLayout } from '../../scene/useSceneScale'
import { SCENE_ZOOM_EASING, SCENE_ZOOM_MS } from '../../scene/zoom'
import type { Rect } from '../../scene/camera'
import { PorchWall } from './PorchWall'
import { WallArrow, WallPlank } from './WallSigns'
import type { WallTurn } from './useWallPager'
import type { WallItem } from './useGalleryItems'
import './gallery.css'

const unit = (n: number) => `calc(var(--px) * ${n})`
const place = (rect: Rect): CSSProperties => ({ left: unit(rect.x), top: unit(rect.y), width: unit(rect.w), height: unit(rect.h) })
const MEDALS = ['Gold', 'Silver', 'Bronze']
const stop = (event: MouseEvent) => event.stopPropagation()
/** A page turn takes about two thirds of a zoom: the same curve, a little quicker, so a wheel of pages never drags. */
const TURN_MS = Math.round(SCENE_ZOOM_MS * 0.65)

const formatDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** One page of paintings: a frame and a caption card each, hung on the page grid. */
function WallPage({ items, layout, border, mat, cell, refEl }: { items: WallItem[]; layout: WallPageLayout; border: number; mat: number; cell: number; refEl?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={refEl} className="wall-page">
      {items.map((item, index) => {
        const slot = wallSlot(layout, index, items.length)
        const medal = item.medal >= 1 && item.medal <= 3 ? (item.medal as 1 | 2 | 3) : 0
        return (
          <article key={item.day} className="wall-painting" data-testid={`gallery-frame-${item.day}`} data-frame-kind={medal ? 'gilt' : 'wood'} style={place({ x: slot.frame.x, y: slot.frame.y, w: layout.frame, h: layout.frame + 1 + layout.card })} onClick={stop}>
            <div className={`wall-frame wall-frame--${medal ? 'gilt' : 'wood'}`} style={{ left: 0, top: 0, width: '100%', height: unit(layout.frame), borderWidth: border, padding: mat }}>
              <PixelThumb cells={item.cells} size={cell * 32} className="wall-frame__thumb" />
            </div>
            {medal ? <PixelMedal medal={medal} scale="scene" label={`${MEDALS[medal - 1]} medal`} className="wall-card__medal" /> : null}
            <div className="wall-card" data-testid="gallery-caption" style={{ left: 0, top: unit(layout.frame + 1), width: '100%', height: unit(layout.card) }}>
              <h2 className="wall-card__prompt">{item.prompt}</h2>
              <p className="wall-card__meta">
                <span className="wall-card__date">{formatDay(item.day)}</span>
                <span className="wall-card__grade">{item.score} / 1000</span>
              </p>
            </div>
          </article>
        )
      })}
    </div>
  )
}

/**
 * The gallery wall with its paintings: the siding (`PorchWall`) and, as HTML in scene units, one page of framed paintings with
 * their captions between two arrow signs, a plank saying "3 / 12" under them. It is a child of a porch `PixelScene`, so it pans with
 * the camera exactly. A page turn slides the page off along the wall and the next one in from the other side, as if hung on a looping
 * rail: transforms only, at the zoom's curve, and only the page and the incoming page are in the DOM. With nothing painted yet there
 * is a single card, never empty frames. `inert` is the porch's own copy of the wall, in place for the pan to it (no pointer, no focus).
 */
export function GalleryWall({ items, page = 0, turn = null, onTurn, onGo, inert = false, empty, loading, failed }: {
  items: WallItem[]
  page?: number
  turn?: WallTurn | null
  onTurn?: () => void
  onGo?: (dir: 1 | -1) => void
  inert?: boolean
  empty?: ReactNode
  loading?: boolean
  failed?: boolean
}) {
  const composition = useContext(SceneComposition)
  const ref = useRef<HTMLDivElement>(null)
  const { scale, layout } = useWallPageLayout(ref, composition, items.length)
  // Whole-pixel painting cells: the frame's inner width, less its border and mat, in 32 whole cells.
  const border = Math.max(2, Math.round(scale * 2.2))
  const mat = Math.max(2, Math.round(scale * 1.4))
  const cell = scale ? Math.max(1, Math.floor((layout.frame * scale - 2 * (border + mat)) / 32)) : 1
  const pages = wallPageCount(items.length, layout.perPage)
  const type = captionType(scale)
  const slice = (index: number) => items.slice(index * layout.perPage, (index + 1) * layout.perPage)

  const outgoing = useRef<HTMLDivElement>(null)
  const incoming = useRef<HTMLDivElement>(null)
  const done = useRef(onTurn)
  done.current = onTurn
  const distance = useRef(0)
  distance.current = Math.round(layout.rail.w * scale)
  useLayoutEffect(() => {
    if (!turn) return
    const from = outgoing.current, to = incoming.current
    if (!from || !to || typeof from.animate !== 'function') { done.current?.(); return }
    const travel = turn.dir * distance.current
    const timing: KeyframeAnimationOptions = { duration: TURN_MS, easing: SCENE_ZOOM_EASING, fill: 'both' }
    const a = from.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${-travel}px)` }], timing)
    const b = to.animate([{ transform: `translateX(${travel}px)` }, { transform: 'translateX(0px)' }], timing)
    let live = true
    void Promise.all([a.finished, b.finished]).then(() => { if (live) { a.cancel(); b.cancel(); done.current?.() } }, () => undefined)
    return () => { live = false; a.cancel(); b.cancel() }
  }, [turn])

  const shown = turn ? turn.to : page
  const note = (body: ReactNode, testId: string, h: number) => {
    const w = Math.min(90, layout.rail.w - 4)
    const rect = { x: layout.rail.x + 2 + (layout.rail.w - 4 - w) / 2, y: layout.top + Math.floor((layout.band - h) / 2), w, h }
    return <article className="wall-note" data-testid={testId} style={place(rect)} onClick={stop}>{body}</article>
  }
  const showPage = !loading && !failed && items.length > 0
  const style = { '--wall-prompt': unit(type.prompt), '--wall-meta': unit(type.meta) } as CSSProperties
  return (
    <>
      <PorchWall />
      <div
        ref={ref}
        className="wall-paintings"
        style={style}
        aria-hidden={inert || undefined}
        inert={inert || undefined}
        data-testid="gallery-wall"
        data-page={showPage ? shown + 1 : 0}
        data-pages={showPage ? pages : 0}
        data-turning={turn ? 'true' : undefined}
        data-per-page={layout.perPage}
        data-cols={layout.cols}
        data-rows={layout.rows}
      >
        {inert && (loading || failed) ? null : loading ? note(<p role="status">Hanging paintings…</p>, 'gallery-loading', 14)
          : failed ? note(<p role="alert">Couldn&apos;t load the gallery. Try again soon.</p>, 'gallery-error', 18)
          : items.length === 0 ? note(empty, 'gallery-empty', 28)
          : (
            <>
              <div className="wall-rail" style={place(layout.rail)}>
                <WallPage key={page} refEl={outgoing} items={slice(page)} layout={layout} border={border} mat={mat} cell={cell} />
                {turn ? <WallPage key={turn.to} refEl={incoming} items={slice(turn.to)} layout={layout} border={border} mat={mat} cell={cell} /> : null}
              </div>
              {pages > 1 ? (
                <>
                  <WallArrow dir="left" rect={layout.arrowLeft} onTurn={() => onGo?.(-1)} />
                  <WallArrow dir="right" rect={layout.arrowRight} onTurn={() => onGo?.(1)} />
                  <WallPlank rect={layout.plank} page={shown + 1} pages={pages} />
                </>
              ) : null}
            </>
          )}
      </div>
    </>
  )
}
