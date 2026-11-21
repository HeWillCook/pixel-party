import { cameraFor, projectRect, type Camera, type Composition, type Rect } from '../camera'
import { porchChalkboardRect, porchLayout } from './layout'

export interface ScoresSlateTarget {
  /** Expected on-screen rect of the `.scores-chalkboard` slate (CSS px, relative to the viewport). */
  slate: Rect
  /** The board's laid-out width (px) so CSS and camera agree 1:1. */
  stageMaxWidth: number
  /** Matching `.scores-chalkboard` height (px): the porch chalkboard's slate, scaled by the camera. */
  slateMinHeight: number
}

const DEFAULT_NAV_HEIGHT = 72
const MOBILE_BREAKPOINT = 640
/** Scene rows below the board's timber that still belong to it: the thrusters' flames and the shadow they throw. */
const BOARD_FIT_BELOW = 8

/** The whole chalkboard as the close-up frames it: timber, slate, thrusters and their flames. */
export function chalkboardFitRect(composition: Composition): Rect {
  const board = porchLayout[composition].chalkboard
  return { x: board.x, y: board.y, w: board.w, h: board.h + BOARD_FIT_BELOW }
}

/**
 * Camera that fits the whole chalkboard, thrusters included, in the viewport below the nav, centred. The porch
 * stays visible around and under it at exactly the scale the board is drawn at, so nothing is covered by a backdrop.
 */
export function scoresTargetCamera(
  viewport: { w: number; h: number },
  composition: Composition,
  navHeight = DEFAULT_NAV_HEIGHT,
): Camera {
  if (!viewport.w || !viewport.h) return { x: 0, y: 0, zoom: 1 }
  const gutter = viewport.w <= MOBILE_BREAKPOINT ? 8 : 24
  const target: Rect = {
    x: gutter,
    y: navHeight,
    w: Math.max(1, viewport.w - gutter * 2),
    h: Math.max(1, viewport.h - navHeight - gutter),
  }
  return cameraFor(chalkboardFitRect(composition), target, viewport, composition)
}

/**
 * Where the porch chalkboard's slate lands for the framing camera: the `/scores` board is laid out on exactly this
 * rect, so the HTML board replaces the canvas slate at identical geometry.
 */
export function scoresTargetLayout(
  viewport: { w: number; h: number },
  composition: Composition,
  navHeight = DEFAULT_NAV_HEIGHT,
): ScoresSlateTarget {
  const slate = projectChalkboardRect(scoresTargetCamera(viewport, composition, navHeight), viewport, composition)
  return { slate, stageMaxWidth: slate.w, slateMinHeight: slate.h }
}

/**
 * Where the porch chalkboard's slate actually lands on screen for the given camera. Used by
 * `/scores` to keep its HTML board glued to the canvas board while the zoom is still running.
 */
export function projectChalkboardRect(
  camera: Camera,
  viewport: { w: number; h: number },
  composition: Composition,
): Rect {
  return projectRect(porchChalkboardRect(composition), camera, viewport, composition)
}
