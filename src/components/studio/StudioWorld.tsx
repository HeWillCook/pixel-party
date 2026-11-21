import { createContext, useContext, type RefObject } from 'react'
import type { Composition, Rect } from '../../scene/camera'

export type RoomPhase = 'entering' | 'active' | 'leaving'

/** What the easel's frame shows about the open room (its HUD and word line). Changes rarely, unlike the board. */
export interface RoomSummary {
  players: number
  roundState: string | undefined
  word: string | undefined
}

/**
 * What the basement studio's scene offers a room: the stage the camera lives in, the easel board the room's
 * board grows out of, and the way back out. The room is a foreground of the studio scene, not a page of its own.
 */
export interface StudioWorldValue {
  /** The element containing the studio `PixelScene`; registered close-ups read the live camera through it. */
  hostRef: RefObject<HTMLElement | null>
  /** The magic easel's board in scene units: where a room's board sits while the camera is away from it. */
  focus: (composition: Composition) => Rect
  /** The room reports where its board settles (page coordinates) so the camera can land exactly on it. */
  setBoardRect: (rect: Rect | null) => void
  /** The room reports its headline facts for the easel's HUD (the board itself is the room's own HTML). */
  setSummary: (summary: RoomSummary | null) => void
  /** The smallest board (px) the room must use so the studio scene covers the screen behind it (null: unknown). */
  minBoardPx: number | null
  /** How far the room slides (px) so its board stays on the easel while the scene still covers the screen. */
  roomShift: { x: number; y: number }
  phase: RoomPhase
  /** The sign-in slip: in the studio it is pinned to the room-tickets corkboard, in a room to the room's ticket. */
  signInOpen: boolean
  setSignInOpen: (open: boolean) => void
  /** Zooms back out of the easel, then lands on `path` (the studio). */
  leave: (path?: string, beforeFinish?: () => void) => void
}

export const StudioWorldContext = createContext<StudioWorldValue | null>(null)

export function useStudioWorld(): StudioWorldValue {
  const world = useContext(StudioWorldContext)
  if (!world) throw new Error('useStudioWorld must be used inside the studio layout')
  return world
}
