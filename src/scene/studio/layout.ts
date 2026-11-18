import type { Composition, Rect } from '../camera'

export type StudioLayout = {
  windows: Rect[]
  upstairs: Rect
  corkboard: Rect
  joinBooth: Rect
  joinCard: Rect
  publicBoardArt: Rect
  publicBoardPlaque: Rect
  easels: Rect[]
  moreEasels: Rect
  workbench: Rect
  workbenchBoard: Rect
  magicEasel: Rect
  shelf: Rect
  plant: { x: number; y: number }
}

export const studioLayout: Record<Composition, StudioLayout> = {
  landscape: {
    windows: [
      { x: 64, y: 32, w: 72, h: 42 },
      { x: 144, y: 32, w: 72, h: 42 },
      { x: 224, y: 32, w: 76, h: 42 },
    ],
    upstairs: { x: 12, y: 32, w: 46, h: 56 },
    corkboard: { x: 12, y: 80, w: 82, h: 82 },
    joinBooth: { x: 98, y: 78, w: 78, h: 36 },
    joinCard: { x: 98, y: 78, w: 78, h: 36 },
    publicBoardArt: { x: 112, y: 49, w: 72, h: 26 },
    publicBoardPlaque: { x: 108, y: 78, w: 80, h: 12 },
    easels: [
      { x: 88, y: 94, w: 42, h: 72 },
      { x: 132, y: 94, w: 42, h: 72 },
      { x: 176, y: 94, w: 42, h: 72 },
    ],
    moreEasels: { x: 88, y: 166, w: 130, h: 11 },
    workbench: { x: 98, y: 78, w: 78, h: 86 },
    workbenchBoard: { x: 98, y: 114, w: 78, h: 50 },
    magicEasel: { x: 186, y: 58, w: 120, h: 105 },
    shelf: { x: 182, y: 80, w: 28, h: 3 },
    plant: { x: 198, y: 71 },
  },
  portrait: {
    windows: [
      { x: 68, y: 54, w: 40, h: 36 },
      { x: 112, y: 54, w: 40, h: 36 },
    ],
    upstairs: { x: 28, y: 56, w: 36, h: 54 },
    corkboard: { x: 30, y: 240, w: 120, h: 24 },
    joinBooth: { x: 30, y: 240, w: 120, h: 24 },
    joinCard: { x: 30, y: 240, w: 120, h: 24 },
    publicBoardArt: { x: 76, y: 72, w: 66, h: 24 },
    publicBoardPlaque: { x: 74, y: 99, w: 70, h: 15 },
    easels: [
      { x: 34, y: 128, w: 52, h: 86 },
      { x: 94, y: 128, w: 52, h: 86 },
    ],
    moreEasels: { x: 34, y: 218, w: 112, h: 14 },
    workbench: { x: 30, y: 240, w: 120, h: 24 },
    workbenchBoard: { x: 30, y: 240, w: 120, h: 24 },
    magicEasel: { x: 34, y: 120, w: 112, h: 120 },
    shelf: { x: 32, y: 132, w: 24, h: 3 },
    plant: { x: 34, y: 123 },
  },
}
