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
      { x: 82, y: 24, w: 66, h: 42 },
      { x: 152, y: 24, w: 66, h: 42 },
      { x: 222, y: 24, w: 72, h: 42 },
    ],
    upstairs: { x: 26, y: 44, w: 46, h: 34 },
    corkboard: { x: 24, y: 80, w: 74, h: 84 },
    joinBooth: { x: 102, y: 68, w: 94, h: 42 },
    workbench: { x: 102, y: 78, w: 94, h: 86 },
    workbenchBoard: { x: 128, y: 116, w: 60, h: 45 },
    magicEasel: { x: 202, y: 38, w: 94, h: 126 },
    shelf: { x: 184, y: 74, w: 18, h: 3 },
    plant: { x: 188, y: 65 },
  },
  portrait: {
    windows: [
      { x: 68, y: 56, w: 40, h: 22 },
      { x: 112, y: 56, w: 40, h: 22 },
    ],
    upstairs: { x: 28, y: 58, w: 34, h: 26 },
    corkboard: { x: 30, y: 84, w: 120, h: 38 },
    joinBooth: { x: 30, y: 240, w: 120, h: 24 },
    workbench: { x: 30, y: 240, w: 120, h: 24 },
    workbenchBoard: { x: 30, y: 240, w: 120, h: 24 },
    magicEasel: { x: 34, y: 126, w: 112, h: 136 },
    shelf: { x: 32, y: 108, w: 24, h: 3 },
    plant: { x: 34, y: 99 },
  },
}
