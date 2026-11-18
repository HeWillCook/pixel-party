import type { Composition, Rect } from '../camera'

export type PorchObject = 'easel' | 'chalkboard' | 'hatch' | 'lighthouse' | 'mailbox' | 'gallery' | 'radio' | 'note' | 'lantern' | 'cat' | 'plant' | 'more'
export const porchLayout: Record<Composition, Record<PorchObject, Rect>> = {
  landscape: {
    easel: { x: 138, y: 40, w: 68, h: 116 }, chalkboard: { x: 241, y: 82, w: 46, h: 70 },
    hatch: { x: 85, y: 155, w: 35, h: 15 }, lighthouse: { x: 75, y: 72, w: 14, h: 29 },
    mailbox: { x: 17, y: 75, w: 28, h: 24 }, gallery: { x: 18, y: 124, w: 25, h: 30 },
    radio: { x: 72, y: 128, w: 18, h: 20 }, note: { x: 53, y: 38, w: 15, h: 22 },
    lantern: { x: 54, y: 22, w: 20, h: 22 }, cat: { x: 43, y: 130, w: 29, h: 15 },
    plant: { x: 16, y: 129, w: 15, h: 20 }, more: { x: 0, y: 0, w: 0, h: 0 },
  },
  portrait: {
    easel: { x: 56, y: 65, w: 68, h: 116 }, chalkboard: { x: 104, y: 184, w: 44, h: 48 },
    hatch: { x: 47, y: 265, w: 32, h: 14 }, lighthouse: { x: 44, y: 111, w: 14, h: 29 },
    mailbox: { x: 29, y: 83, w: 28, h: 24 }, gallery: { x: 29, y: 238, w: 23, h: 30 },
    radio: { x: 30, y: 242, w: 16, h: 18 }, note: { x: 35, y: 54, w: 15, h: 22 },
    lantern: { x: 49, y: 68, w: 20, h: 22 }, cat: { x: 36, y: 250, w: 29, h: 15 },
    plant: { x: 30, y: 245, w: 13, h: 18 }, more: { x: 66, y: 260, w: 27, h: 16 },
  },
}
