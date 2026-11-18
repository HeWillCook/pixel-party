import type { Composition, Rect } from '../camera'

export type StudioLayout = {
  windows: Rect[]
  lamps: { x: number; y: number }[]
  upstairs: Rect
  joinBooth: Rect
  publicBoardArt: Rect
  publicBoardPlaque: Rect
  easels: Rect[]
  moreEasels: Rect
  workbench: Rect
  plant: { x: number; y: number }
}

export const studioLayout: Record<Composition, StudioLayout> = {
  landscape: {
    windows: [
      { x: 76, y: 15, w: 48, h: 20 },
      { x: 136, y: 15, w: 48, h: 20 },
      { x: 196, y: 15, w: 48, h: 20 },
    ],
    lamps: [
      { x: 127, y: 12 },
      { x: 187, y: 12 },
    ],
    upstairs: { x: 20, y: 38, w: 48, h: 68 },
    joinBooth: { x: 19, y: 109, w: 72, h: 52 },
    publicBoardArt: { x: 102, y: 40, w: 98, h: 35 },
    publicBoardPlaque: { x: 100, y: 76, w: 102, h: 15 },
    easels: [
      { x: 95, y: 94, w: 39, h: 66 },
      { x: 137, y: 96, w: 39, h: 66 },
      { x: 179, y: 94, w: 39, h: 66 },
    ],
    moreEasels: { x: 96, y: 161, w: 120, h: 8 },
    workbench: { x: 222, y: 40, w: 79, h: 122 },
    plant: { x: 80, y: 83 },
  },
  portrait: {
    windows: [
      { x: 34, y: 40, w: 52, h: 22 },
      { x: 94, y: 40, w: 52, h: 22 },
    ],
    lamps: [
      { x: 87, y: 38 },
    ],
    upstairs: { x: 30, y: 68, w: 34, h: 62 },
    joinBooth: { x: 30, y: 256, w: 120, h: 28 },
    publicBoardArt: { x: 68, y: 68, w: 80, h: 40 },
    publicBoardPlaque: { x: 68, y: 110, w: 80, h: 20 },
    easels: [
      { x: 33, y: 140, w: 55, h: 84 },
      { x: 92, y: 140, w: 55, h: 84 },
    ],
    moreEasels: { x: 32, y: 228, w: 116, h: 12 },
    workbench: { x: 30, y: 256, w: 120, h: 28 },
    plant: { x: 34, y: 120 },
  },
}
