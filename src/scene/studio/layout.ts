import type { Composition, Rect } from '../camera'

export type StudioLayout = {
  windows: Rect[]
  lamps: { x: number; y: number }[]
  upstairs: Rect
  joinBooth: Rect
  joinCard: Rect
  publicBoardArt: Rect
  publicBoardPlaque: Rect
  easels: Rect[]
  moreEasels: Rect
  workbench: Rect
  workbenchBoard: Rect
  plant: { x: number; y: number }
}

export const studioLayout: Record<Composition, StudioLayout> = {
  landscape: {
    windows: [
      { x: 92, y: 28, w: 46, h: 17 },
      { x: 152, y: 28, w: 46, h: 17 },
    ],
    lamps: [
      { x: 139, y: 24 },
      { x: 202, y: 24 },
    ],
    upstairs: { x: 20, y: 40, w: 46, h: 58 },
    joinBooth: { x: 18, y: 103, w: 66, h: 65 },
    joinCard: { x: 21, y: 123, w: 60, h: 36 },
    publicBoardArt: { x: 112, y: 49, w: 72, h: 26 },
    publicBoardPlaque: { x: 108, y: 78, w: 80, h: 12 },
    easels: [
      { x: 88, y: 94, w: 42, h: 72 },
      { x: 132, y: 94, w: 42, h: 72 },
      { x: 176, y: 94, w: 42, h: 72 },
    ],
    moreEasels: { x: 88, y: 166, w: 130, h: 11 },
    workbench: { x: 224, y: 26, w: 78, h: 142 },
    workbenchBoard: { x: 226, y: 47, w: 74, h: 65 },
    plant: { x: 288, y: 151 },
  },
  portrait: {
    windows: [
      { x: 34, y: 48, w: 50, h: 18 },
      { x: 96, y: 48, w: 50, h: 18 },
    ],
    lamps: [
      { x: 85, y: 45 },
    ],
    upstairs: { x: 30, y: 71, w: 34, h: 52 },
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
    plant: { x: 32, y: 142 },
  },
}
