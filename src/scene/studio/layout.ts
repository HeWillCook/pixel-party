import type { Composition, Rect } from '../camera'

export type StudioLayout = {
  windows: Rect[]
  /** The stair that drops from the porch hatch (it sits directly under `porchHatch.opening`) down to the floor. */
  stairs: Rect
  /** The "Upstairs" sign standing at the foot of the stair. */
  upstairs: Rect
  corkboard: Rect
  joinBooth: Rect
  workbench: Rect
  workbenchBoard: Rect
  magicEasel: Rect
  /** Where the sign-in slip lands: exactly over the neighbouring cards it covers (so none is ever half covered). */
  signIn: Rect
  shelf: Rect
  plant: { x: number; y: number }
}

export const studioLayout: Record<Composition, StudioLayout> = {
  landscape: {
    windows: [
      { x: 20, y: 24, w: 72, h: 42 },
      { x: 96, y: 24, w: 72, h: 42 },
      { x: 172, y: 24, w: 72, h: 42 },
    ],
    stairs: { x: 252, y: 0, w: 40, h: 100 },
    upstairs: { x: 250, y: 104, w: 50, h: 18 },
    corkboard: { x: 18, y: 80, w: 58, h: 84 },
    joinBooth: { x: 80, y: 68, w: 84, h: 42 },
    workbench: { x: 80, y: 78, w: 84, h: 86 },
    workbenchBoard: { x: 100, y: 116, w: 56, h: 45 },
    magicEasel: { x: 168, y: 38, w: 80, h: 126 },
    signIn: { x: 80, y: 68, w: 84, h: 96 },
    shelf: { x: 30, y: 74, w: 18, h: 3 },
    plant: { x: 34, y: 65 },
  },
  portrait: {
    windows: [
      { x: 30, y: 56, w: 34, h: 22 },
      { x: 68, y: 56, w: 34, h: 22 },
    ],
    stairs: { x: 108, y: 0, w: 40, h: 98 },
    upstairs: { x: 98, y: 102, w: 52, h: 18 },
    corkboard: { x: 30, y: 84, w: 74, h: 38 },
    joinBooth: { x: 30, y: 240, w: 120, h: 24 },
    workbench: { x: 30, y: 240, w: 120, h: 24 },
    workbenchBoard: { x: 30, y: 240, w: 120, h: 24 },
    magicEasel: { x: 34, y: 126, w: 112, h: 136 },
    signIn: { x: 34, y: 126, w: 112, h: 136 },
    shelf: { x: 32, y: 108, w: 24, h: 3 },
    plant: { x: 34, y: 99 },
  },
}
