import type { Composition, Rect } from '../camera'

export type PorchObject = 'easel' | 'chalkboard' | 'steps' | 'lighthouse' | 'mailbox' | 'door' | 'radio' | 'note' | 'lantern' | 'cat' | 'plant'
export const porchLayout: Record<Composition, Record<PorchObject, Rect>> = {
  landscape: {
    easel: { x: 119, y: 35, w: 68, h: 116 }, chalkboard: { x: 16, y: 66, w: 61, h: 77 },
    steps: { x: 230, y: 149, w: 51, h: 31 }, lighthouse: { x: 82, y: 72, w: 14, h: 29 },
    mailbox: { x: 91, y: 118, w: 22, h: 27 }, door: { x: 288, y: 28, w: 27, h: 122 },
    radio: { x: 201, y: 127, w: 24, h: 18 }, note: { x: 4, y: 38, w: 15, h: 22 },
    lantern: { x: 276, y: 39, w: 11, h: 22 }, cat: { x: 195, y: 150, w: 29, h: 15 },
    plant: { x: 263, y: 119, w: 23, h: 31 },
  },
  portrait: {
    easel: { x: 56, y: 80, w: 68, h: 116 }, chalkboard: { x: 7, y: 210, w: 61, h: 77 },
    steps: { x: 119, y: 288, w: 51, h: 32 }, lighthouse: { x: 24, y: 111, w: 14, h: 29 },
    mailbox: { x: 8, y: 167, w: 22, h: 27 }, door: { x: 147, y: 62, w: 27, h: 122 },
    radio: { x: 129, y: 215, w: 24, h: 18 }, note: { x: 3, y: 52, w: 15, h: 22 },
    lantern: { x: 134, y: 54, w: 11, h: 22 }, cat: { x: 78, y: 275, w: 29, h: 15 },
    plant: { x: 150, y: 237, w: 23, h: 31 },
  },
}
