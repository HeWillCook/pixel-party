import { integerScale, sceneSize, type Camera, type Composition, type Rect } from '../camera'
import { REST_CAMERA } from '../zoom'

/**
 * The gallery wall: the house's outer wall carries on to the left of the porch, off-screen at the rest pose (the scene's centred
 * block is always at least as wide as the viewport). Scene x grows to the right, so the wall is the half-line x < 0. The wall is
 * exactly one camera view wide and never grows: paintings hang a page at a time (a grid that fits the view), newest first, and the
 * pages turn like a looping rail. Everything here is in scene units.
 */

/** Scene x that the viewport's right edge sits on at the gallery pose (a hand's breadth of the porch's siding). */
export const WALL_VIEW_RIGHT = 6
/** The siding tile repeats every `WALL_TILE` units. */
export const WALL_TILE = 52

/** The arrow signs either side of the rail, the gap that keeps them clear of it, and the page plank under it. */
export const WALL_ARROW = { w: 13, h: 16, gap: 3 }
export const WALL_PLANK = { w: 30, h: 9 }

const ROOF_RAIL: Record<Composition, number> = { landscape: 21, portrait: 21 }
const FLOOR: Record<Composition, number> = { landscape: 154, portrait: 232 }
const MAX_ROWS: Record<Composition, number> = { landscape: 2, portrait: 3 }
const MAX_COLS = 6
const MARGIN = 2
const ROW_GAP = 4
const COL_GAP_MIN = 6
const COL_GAP_MAX = 12
/** Frame sizes tried, largest first: the layout that hangs the most paintings per page wins, then the larger frame. */
const FRAME_SIZES = [40, 38, 36, 34, 32, 30, 28]

/** The nav's full height in px (its CSS steps at 768) and the gallery plaque under it: fixed, so a nav that retracts never shifts the wall. */
const navPx = (viewportW: number) => (viewportW >= 768 ? 112 : 76)
const HUD_PX = 64
/** A medal pinned to a frame's corner hangs this far above it. */
const MEDAL_RISE = 4

/** The caption type in scene units: `3` and `2.6` units, never below 11px and 10px (the px floors, as units at this scale). */
export function captionType(scale: number): { prompt: number; meta: number } {
  return { prompt: Math.max(3, scale ? 11 / scale : 3), meta: Math.max(2.6, scale ? 10 / scale : 2.6) }
}

/** The tallest a caption card can be: border and padding, the longest real prompt on two lines, and a date and grade that wrap onto two more at worst. The grid reserves this; a page's cards shrink to its own tallest caption (see `GalleryWall`). */
export function captionHeight(scale: number): number {
  const type = captionType(scale)
  return Math.ceil(3.4 + 2 * type.prompt * 1.05 + 2 * type.meta * 1.1)
}

export interface WallPageLayout {
  cols: number
  rows: number
  perPage: number
  frame: number
  card: number
  gap: number
  /** The grid's left edge and the top of the band the rows are centred in, and that band's height. */
  left: number
  top: number
  band: number
  /** Scene rects: the window the paintings slide in (between the arrows), the arrows, the page plank. */
  rail: Rect
  arrowLeft: Rect
  arrowRight: Rect
  plank: Rect
}

/**
 * The page grid for a viewport. A page is as many frames as fit the wall's view below the nav and plaque and above the deck, in
 * whole rows and columns between the two arrow signs; `count` only decides how many of those rows a gallery with few paintings
 * actually uses (so one painting hangs centred, not in a corner).
 */
export function wallPageLayout(composition: Composition, viewport: { w: number; h: number }, scale: number, count: number): WallPageLayout {
  const sceneH = sceneSize(composition).h
  const floor = FLOOR[composition]
  const oy = scale ? (viewport.h - sceneH * scale) / 2 : 0
  const unitsW = scale ? viewport.w / scale : sceneSize(composition).w
  const top = Math.floor(Math.max(ROOF_RAIL[composition] + 10, scale ? (navPx(viewport.w) + HUD_PX - oy) / scale + MEDAL_RISE : 0))
  const bottom = Math.floor(Math.min(floor - 12, scale ? (viewport.h - oy) / scale - 6 : floor - 12))
  const band = Math.max(0, bottom - top)
  const card = captionHeight(scale)
  const left0 = WALL_VIEW_RIGHT - unitsW + MARGIN
  const usable = unitsW - WALL_VIEW_RIGHT - 2 * MARGIN
  const reserved = 2 * (WALL_ARROW.w + WALL_ARROW.gap)
  let best = { frame: FRAME_SIZES[FRAME_SIZES.length - 1], cols: 1, rows: 1, score: -1 }
  for (const frame of FRAME_SIZES) {
    const cols = Math.min(MAX_COLS, Math.floor((usable - reserved + COL_GAP_MIN) / (frame + COL_GAP_MIN)))
    const rowH = frame + 1 + card
    const rows = Math.min(MAX_ROWS[composition], Math.floor((band + ROW_GAP) / (rowH + ROW_GAP)))
    if (cols < 1 || rows < 1) continue
    const score = cols * rows * 100 + frame
    if (score > best.score) best = { frame, cols, rows, score }
  }
  const { frame, cols } = best
  const rowH = frame + 1 + card
  const gap = cols > 1 ? Math.max(COL_GAP_MIN, Math.min(COL_GAP_MAX, Math.floor((usable - reserved - cols * frame) / (cols - 1)))) : 0
  const gridW = cols * frame + (cols - 1) * gap
  const start = Math.floor(left0 + (usable - (gridW + reserved)) / 2)
  const gridLeft = start + WALL_ARROW.w + WALL_ARROW.gap
  const rows = Math.max(1, Math.min(best.rows, Math.ceil(count / cols)))
  const blockH = rows * rowH + (rows - 1) * ROW_GAP
  const y0 = top + Math.max(0, Math.floor((band - blockH) / 2))
  const midY = y0 + Math.floor(blockH / 2)
  return {
    cols, rows: best.rows, perPage: cols * best.rows, frame, card, gap, left: gridLeft, top: y0, band,
    rail: { x: gridLeft - 2, y: top - 6, w: gridW + 4, h: band + 8 },
    arrowLeft: { x: start, y: midY - WALL_ARROW.h / 2, w: WALL_ARROW.w, h: WALL_ARROW.h },
    arrowRight: { x: gridLeft + gridW + WALL_ARROW.gap, y: midY - WALL_ARROW.h / 2, w: WALL_ARROW.w, h: WALL_ARROW.h },
    plank: { x: gridLeft + Math.floor((gridW - WALL_PLANK.w) / 2), y: floor - WALL_PLANK.h - 1, w: WALL_PLANK.w, h: WALL_PLANK.h },
  }
}

/**
 * Where painting `index` of a page (0 = first, of `onPage` on it) hangs: its frame and the card under it, relative to the rail's top-left.
 * A partial page balances its rows instead of leaving one frame alone (7 on a six-column page hang as 4 + 3), and each row is centred.
 */
export function wallSlot(layout: WallPageLayout, index: number, onPage: number): { frame: Rect; card: Rect } {
  const rows = Math.max(1, Math.ceil(onPage / layout.cols))
  const perRow = Math.ceil(onPage / rows)
  const row = Math.floor(index / perRow), column = index % perRow
  const inRow = Math.min(perRow, onPage - row * perRow)
  const pitch = layout.frame + layout.gap
  const x = layout.left - layout.rail.x + column * pitch + Math.floor(((layout.cols - inRow) * pitch) / 2)
  const y = layout.top - layout.rail.y + row * (layout.frame + 1 + layout.card + ROW_GAP)
  return {
    frame: { x, y, w: layout.frame, h: layout.frame },
    card: { x, y: y + layout.frame + 1, w: layout.frame, h: layout.card },
  }
}

export const wallPageCount = (count: number, perPage: number) => (count > 0 ? Math.ceil(count / perPage) : 0)

/** The camera on the wall: the same zoom as the rest pose, panned along the porch until its right edge is at `WALL_VIEW_RIGHT`. */
export function wallTargetCamera(viewport: { w: number; h: number }, composition: Composition): Camera {
  if (!viewport.w || !viewport.h) return { ...REST_CAMERA }
  const size = sceneSize(composition)
  const scale = integerScale(viewport.w, viewport.h, composition)
  const ox = (viewport.w - size.w * scale) / 2
  return { x: viewport.w - ox - WALL_VIEW_RIGHT * scale, y: 0, zoom: 1 }
}
