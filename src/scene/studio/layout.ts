import type { Composition, Rect } from '../camera'

export type StudioLayout = {
  windows: Rect[]
  upstairs: Rect
  corkboard: Rect
  joinBooth: Rect
  workbench: Rect
  workbenchBoard: Rect
  magicEasel: Rect
  shelf: Rect
  plant: { x: number; y: number }
}

export const studioLayout: Record<Composition, StudioLayout> = {
  landscape: {
    windows: [
      { x: 70, y: 32, w: 68, h: 40 },
      { x: 146, y: 32, w: 68, h: 40 },
      { x: 222, y: 32, w: 72, h: 40 },
    ],
    upstairs: { x: 24, y: 30, w: 42, h: 48 },
    corkboard: { x: 24, y: 80, w: 78, h: 84 },
    joinBooth: { x: 106, y: 76, w: 76, h: 36 },
    workbench: { x: 106, y: 78, w: 76, h: 86 },
    workbenchBoard: { x: 106, y: 114, w: 76, h: 50 },
    magicEasel: { x: 204, y: 54, w: 92, h: 110 },
    shelf: { x: 184, y: 80, w: 20, h: 3 },
    plant: { x: 189, y: 71 },
  },
  portrait: {
    windows: [
      { x: 68, y: 54, w: 40, h: 36 },
      { x: 112, y: 54, w: 40, h: 36 },
    ],
    upstairs: { x: 28, y: 54, w: 36, h: 50 },
    corkboard: { x: 30, y: 240, w: 120, h: 24 },
    joinBooth: { x: 30, y: 240, w: 120, h: 24 },
    workbench: { x: 30, y: 240, w: 120, h: 24 },
    workbenchBoard: { x: 30, y: 240, w: 120, h: 24 },
    magicEasel: { x: 34, y: 112, w: 112, h: 132 },
    shelf: { x: 32, y: 108, w: 24, h: 3 },
    plant: { x: 34, y: 99 },
  },
}
