import type { Composition, Rect } from '../camera'

export type PorchObject = 'easel' | 'chalkboard' | 'steps' | 'lighthouse' | 'mailbox' | 'gallery' | 'radio' | 'note' | 'lantern' | 'cat' | 'plant' | 'more'
export const porchLayout: Record<Composition, Record<PorchObject, Rect>> = {
  landscape: {
    easel: { x: 138, y: 35, w: 68, h: 116 }, chalkboard: { x: 92, y: 101, w: 44, h: 48 },
    steps: { x: 246, y: 148, w: 51, h: 32 }, lighthouse: { x: 75, y: 72, w: 14, h: 29 },
    mailbox: { x: 215, y: 115, w: 28, h: 34 }, gallery: { x: 18, y: 119, w: 25, h: 30 },
    radio: { x: 72, y: 123, w: 18, h: 20 }, note: { x: 53, y: 38, w: 15, h: 22 },
    lantern: { x: 54, y: 22, w: 20, h: 22 }, cat: { x: 43, y: 125, w: 29, h: 15 },
    plant: { x: 16, y: 129, w: 15, h: 20 }, more: { x: 0, y: 0, w: 0, h: 0 },
  },
  portrait: {
    easel: { x: 56, y: 65, w: 68, h: 116 }, chalkboard: { x: 54, y: 199, w: 36, h: 43 },
    steps: { x: 104, y: 250, w: 48, h: 18 }, lighthouse: { x: 44, y: 111, w: 14, h: 29 },
    mailbox: { x: 94, y: 224, w: 28, h: 38 }, gallery: { x: 29, y: 234, w: 23, h: 30 },
    radio: { x: 30, y: 242, w: 16, h: 18 }, note: { x: 35, y: 54, w: 15, h: 22 },
    lantern: { x: 49, y: 49, w: 20, h: 22 }, cat: { x: 36, y: 250, w: 29, h: 15 },
    plant: { x: 30, y: 245, w: 13, h: 18 }, more: { x: 66, y: 260, w: 27, h: 16 },
  },
}
