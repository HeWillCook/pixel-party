import type { Composition, Rect } from '../camera'

export type PorchObject = 'easel' | 'chalkboard' | 'steps' | 'lighthouse' | 'mailbox' | 'door' | 'radio' | 'note' | 'lantern' | 'cat' | 'plant'
export const porchLayout: Record<Composition, Record<PorchObject, Rect>> = {
  landscape: {
    easel: { x: 119, y: 35, w: 68, h: 116 }, chalkboard: { x: 16, y: 66, w: 61, h: 77 },
    steps: { x: 230, y: 149, w: 51, h: 31 }, lighthouse: { x: 82, y: 72, w: 14, h: 29 },
    mailbox: { x: 218, y: 121, w: 26, h: 26 }, door: { x: 276, y: 28, w: 27, h: 122 },
    radio: { x: 190, y: 120, w: 32, h: 25 }, note: { x: 18, y: 38, w: 15, h: 22 },
    lantern: { x: 199, y: 23, w: 20, h: 28 }, cat: { x: 191, y: 150, w: 29, h: 15 },
    plant: { x: 248, y: 123, w: 26, h: 27 },
  },
  portrait: {
    easel: { x: 56, y: 67, w: 68, h: 116 }, chalkboard: { x: 29, y: 190, w: 59, h: 70 },
    steps: { x: 94, y: 247, w: 51, h: 29 }, lighthouse: { x: 30, y: 111, w: 14, h: 29 },
    mailbox: { x: 94, y: 217, w: 26, h: 26 }, door: { x: 122, y: 62, w: 27, h: 122 },
    radio: { x: 116, y: 187, w: 32, h: 25 }, note: { x: 29, y: 52, w: 15, h: 22 },
    lantern: { x: 101, y: 43, w: 20, h: 28 }, cat: { x: 67, y: 256, w: 29, h: 15 },
    plant: { x: 121, y: 216, w: 26, h: 27 },
  },
}
