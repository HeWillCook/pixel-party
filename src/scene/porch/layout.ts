import type { Composition, Rect } from '../camera'

export type PorchObject = 'easel' | 'chalkboard' | 'basement' | 'lighthouse' | 'mailbox' | 'gallery' | 'radio' | 'note' | 'lantern' | 'cat' | 'plant' | 'more'
export const porchLayout: Record<Composition, Record<PorchObject, Rect>> = {
  landscape: {
    // The chalkboard hovers just above the deck at the right; the hatch sits in front of it on the deck's front edge.
    easel: { x: 138, y: 40, w: 68, h: 116 }, chalkboard: { x: 214, y: 91, w: 62, h: 56 },
    // `basement` is the hatch assembly: the sign beside the opening, the opening, and the raised lid. The
    // basement stair hangs directly under `porchHatch.opening`, so the floor pan is a straight drop.
    basement: { x: 216, y: 147, w: 76, h: 30 }, lighthouse: { x: 75, y: 72, w: 14, h: 29 },
    mailbox: { x: 17, y: 75, w: 28, h: 24 }, gallery: { x: 18, y: 103, w: 30, h: 13 },
    // The radio stands on a little side table on the deck, left of the easel. `gallery` is the plank sign on the house wall
    // that points left, along the wall, to the gallery (the wall itself is off-screen at rest).
    radio: { x: 94, y: 129, w: 18, h: 9 }, note: { x: 46, y: 45, w: 15, h: 22 },
    lantern: { x: 282, y: 26, w: 20, h: 22 }, cat: { x: 43, y: 130, w: 29, h: 15 },
    plant: { x: 16, y: 129, w: 15, h: 20 }, more: { x: 0, y: 0, w: 0, h: 0 },
  },
  portrait: {
    // A 375x812 screen shows only scene columns ~28-152 and rows ~25-295, and the bottom dock covers everything below ~272.
    // So the deck starts at row 232, the easel and the chalkboard stand side by side on its first rows (the board is a
    // little narrower than on landscape), and the hatch sits just below them.
    easel: { x: 30, y: 131, w: 68, h: 116 }, chalkboard: { x: 100, y: 198, w: 52, h: 48 },
    basement: { x: 70, y: 247, w: 78, h: 27 }, lighthouse: { x: 44, y: 111, w: 14, h: 29 },
    mailbox: { x: 29, y: 83, w: 28, h: 24 }, gallery: { x: 29, y: 109, w: 30, h: 13 },
    radio: { x: 30, y: 242, w: 16, h: 18 }, note: { x: 29, y: 124, w: 15, h: 22 },
    lantern: { x: 126, y: 52, w: 20, h: 22 }, cat: { x: 36, y: 250, w: 29, h: 15 },
    plant: { x: 30, y: 245, w: 13, h: 18 }, more: { x: 40, y: 262, w: 27, h: 16 },
  },
}

/** The deck hatch: the opening in the boards (its lid is raised behind it) and the board of the sign beside it (its posts reach 9 rows lower). */
export const porchHatch: Record<Composition, { opening: Rect; sign: Rect }> = {
  landscape: { opening: { x: 252, y: 158, w: 40, h: 14 }, sign: { x: 217, y: 157, w: 30, h: 10 } },
  portrait: { opening: { x: 108, y: 259, w: 40, h: 13 }, sign: { x: 72, y: 258, w: 30, h: 10 } },
}

/** Slate inset inside the chalkboard's timber frame — shared by the canvas art and the scores camera. */
export const PORCH_CHALKBOARD_SLATE = { x: 6, y: 5, w: 12, h: 21 }

/**
 * The chalkboard's dark slate only (no timber frame), sized to the wide landscape shape the
 * `/scores` board uses so the porch zoom never morphs a tall board into a wide one.
 */
export function porchChalkboardRect(composition: Composition): Rect {
  const board = porchLayout[composition].chalkboard
  return {
    x: board.x + PORCH_CHALKBOARD_SLATE.x,
    y: board.y + PORCH_CHALKBOARD_SLATE.y,
    w: board.w - PORCH_CHALKBOARD_SLATE.w,
    h: board.h - PORCH_CHALKBOARD_SLATE.h,
  }
}

export const PORCH_EASEL_FRAME: Rect = { x: 15, y: 22, w: 38, h: 38 }
export const PORCH_EASEL_CANVAS: Rect = { x: 17, y: 24, w: 34, h: 34 }
export const PORCH_EASEL_ART: Rect = { x: 18, y: 25, w: 32, h: 32 }

export function porchEaselBoardRect(composition: Composition): Rect {
  const easel = porchLayout[composition].easel
  return {
    x: easel.x + PORCH_EASEL_ART.x,
    y: easel.y + PORCH_EASEL_ART.y,
    w: PORCH_EASEL_ART.w,
    h: PORCH_EASEL_ART.h,
  }
}

/** The little table the radio stands on (landscape only): its top plank, `width` wide, sits right under the radio. */
export function porchRadioTable(): { x: number; y: number; w: number } {
  const radio = porchLayout.landscape.radio
  return { x: radio.x - 4, y: radio.y + radio.h, w: radio.w + 8 }
}

/**
 * Haiku's spot, for the 404: the top-left of his sitting sprite (28x26 units) and the rects the close-up frames. Landscape: he sits on
 * the chair cushion where the napper lies. Portrait has no chair: he sits on the deck, left of the hatch. `fit` is what the camera
 * frames (him, the spill and the speech bubble), `bubble` is where the speech bubble stands (beside him, or above him on a phone).
 */
export const porchHaiku: Record<Composition, { sit: { x: number; y: number }; fit: Rect; bubble: Rect; spill: Rect }> = {
  landscape: { sit: { x: 41, y: 113 }, fit: { x: 14, y: 78, w: 146, h: 102 }, bubble: { x: 76, y: 106, w: 42, h: 22 }, spill: { x: 30, y: 142, w: 80, h: 30 } },
  portrait: { sit: { x: 42, y: 236 }, fit: { x: 30, y: 206, w: 64, h: 68 }, bubble: { x: 32, y: 208, w: 58, h: 22 }, spill: { x: 28, y: 256, w: 80, h: 20 } },
}
