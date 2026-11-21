import { DETAIL } from '../detail'
import { P } from '../palette'
import { COAT, PixelBuf, WHITE, boxOf, capsule, catPose, ellipse, paintBeret, paintChain, paintHeadMarks, paintMuzzle, paintShape, paintSleeper, triangle, union } from './catArt'

export type HaikuState =
  | 'idle'
  | 'thinking'
  | 'guess'
  | 'correct'
  | 'resting'
  | 'sleeping'
  /** Awake and sad: droopy ears, teary eyes, the beret askew. Only the 404 shows him like this. */
  | 'sad'

export const HAIKU_WIDTH = 28
export const HAIKU_HEIGHT = 26

/** Detail-grid size of the canvas: the same 28x26 footprint at DETAIL times the resolution. */
const W = HAIKU_WIDTH * DETAIL
const H = HAIKU_HEIGHT * DETAIL
const FLOOR = 50

const LASH = P.fur[0]

function paintEye(buf: PixelBuf, x: number, y: number, look: 'ahead' | 'up' | 'wide' | 'blink' | 'happy' | 'sad', side: -1 | 1 = 1, frame = 0): void {
  if (look === 'happy') {
    buf.rect(x, y + 4, 2, 1, LASH); buf.rect(x + 1, y + 3, 2, 1, LASH); buf.rect(x + 2, y + 2, 2, 1, LASH)
    buf.rect(x + 3, y + 2, 2, 1, LASH); buf.rect(x + 4, y + 3, 2, 1, LASH); buf.rect(x + 5, y + 4, 1, 1, LASH)
    buf.rect(x + 2, y + 3, 2, 1, P.fur[3])
    return
  }
  if (look === 'blink') {
    buf.rect(x, y + 3, 6, 1, LASH); buf.set(x - 1, y + 2, LASH); buf.rect(x + 1, y + 4, 4, 1, P.fur[2])
    return
  }
  if (look === 'sad') {
    // Big wet eyes under heavy lids that slope down toward the outside; a tear on the cheek and one about to fall.
    buf.rect(x + 1, y, 4, 1, LASH); buf.rect(x, y + 1, 6, 4, LASH); buf.rect(x + 1, y + 5, 4, 1, LASH)
    buf.rect(x + 1, y + 1, 4, 1, P.sun[2]); buf.rect(x + 1, y + 2, 4, 2, P.sun[3]); buf.rect(x + 1, y + 4, 4, 1, P.sun[4])
    buf.rect(x + 1, y + 1, 4, 4, LASH); buf.rect(x + 1, y + 2, 2, 2, P.paper[4]); buf.rect(x + 3, y + 4, 2, 1, P.paper[3]); buf.set(x + 4, y + 2, P.paper[4])
    for (let i = 0; i < 6; i++) { const lid = 3 - Math.round((side < 0 ? 5 - i : i) * 0.45); buf.rect(x + i, y - 1, 1, lid, i === 0 || i === 5 ? LASH : P.fur[4]); buf.set(x + i, y - 1 + lid, LASH) }
    buf.rect(x, y + 6, 6, 1, P.sea[4]); buf.rect(x + 1, y + 7, 4, 1, P.sea[3])
    const fall = frame % 8
    buf.rect(x + 2, y + 8, 2, 4, P.sea[4]); buf.rect(x + 2, y + 8, 1, 4, P.paper[4]); buf.rect(x + 2, y + 12 + (fall >> 1), 2, 2, P.sea[3]); buf.set(x + 2, y + 12 + (fall >> 1), P.paper[4])
    return
  }
  // Dark rounded socket, amber iris with a warm gradient, a slit pupil, and two glints.
  buf.rect(x + 1, y, 4, 1, LASH); buf.rect(x, y + 1, 6, 4, LASH); buf.rect(x + 1, y + 5, 4, 1, LASH)
  buf.rect(x + 1, y + 1, 4, 1, P.sun[2]); buf.rect(x + 1, y + 2, 4, 2, P.sun[3]); buf.rect(x + 1, y + 4, 4, 1, P.sun[4])
  if (look === 'wide') buf.rect(x + 2, y + 1, 3, 4, LASH)
  else if (look === 'up') buf.rect(x + 3, y + 1, 2, 3, LASH)
  else buf.rect(x + 2, y + 1, 2, 4, LASH)
  buf.rect(x + 1, y + 1, 2, 2, P.paper[4]); buf.set(x + 4, y + 4, P.paper[4])
  buf.set(x + 1, y, P.fur[2])
}

function paintPaw(buf: PixelBuf, cx: number, cy: number, rx = 4, ry = 2.7): void {
  paintShape(buf, ellipse(cx, cy, rx, ry), boxOf(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1), WHITE)
  buf.rect(cx - 1, cy, 1, 2, P.paper[2]); buf.rect(cx + 1, cy, 1, 2, P.paper[2])
}

function paintSmock(buf: PixelBuf, ox: number, oy: number): void {
  paintShape(buf, union(ellipse(ox + 26, oy + 40.5, 11.2, 7.8), triangle(ox + 14, oy + 44, ox + 12, oy + 49, ox + 18, oy + 46), triangle(ox + 38, oy + 44, ox + 40, oy + 49, ox + 34, oy + 46)), boxOf(ox + 10, oy + 31, ox + 42, oy + 51), WHITE)
  // Folds, buttons, and the day's paint: a smear of orange, a blue thumbprint, and a dab of yellow.
  buf.rect(ox + 22, oy + 40, 1, 6, P.paper[2]); buf.rect(ox + 30, oy + 41, 1, 5, P.paper[2]); buf.rect(ox + 26, oy + 38, 1, 8, P.paper[2])
  buf.rect(ox + 25, oy + 39, 3, 1, P.wood[3]); buf.set(ox + 26, oy + 43, P.wood[2]); buf.set(ox + 26, oy + 46, P.wood[2])
  buf.rect(ox + 30, oy + 36, 3, 2, P.flame[1]); buf.set(ox + 31, oy + 35, P.flame[2]); buf.rect(ox + 19, oy + 43, 3, 2, P.sea[3]); buf.set(ox + 33, oy + 42, P.sun[3])
}

function paintSittingHaiku(buf: PixelBuf, state: 'idle' | 'thinking' | 'guess' | 'correct' | 'sad', frame: number, beret: boolean): void {
  const sad = state === 'sad'
  const step = frame % 24
  const ox = state === 'guess' ? 2 : 0
  const jump = state === 'correct' ? -(frame === 0 ? 6 : [0, 3, 6, 5, 2, 3][frame % 6]) : 0
  const oy = jump
  const E = (cx: number, cy: number, rx: number, ry: number) => ellipse(ox + cx, oy + cy, rx, ry)
  const earLift = state === 'thinking' ? -2 : 0

  // Ground shadow stays on the floor.
  for (let x = 12; x <= 41; x++) buf.set(x + ox, FLOOR - 1, P.wood[0])
  for (let x = 17; x <= 36; x++) buf.set(x + ox, FLOOR, P.wood[0])

  // Ringed tail: out from the haunch and up, wagging fast on a guess, flicking now and then when idle.
  const lifted = sad ? 0 : state === 'guess' || state === 'correct' ? (frame % 4 < 2 ? 5 : 0) : step >= 17 && step <= 20 ? 4 : step === 16 || step === 21 ? 2 : 0
  const tail: Array<[number, number, number]> = []
  for (let i = 0; i <= 34; i++) {
    const t = i / 34, u = 1 - t
    const x = u ** 3 * 36 + 3 * u * u * t * 50 + 3 * u * t * t * 53 + t ** 3 * (48 + lifted * 0.3)
    const y = u ** 3 * 46 + 3 * u * u * t * 50 + 3 * u * t * t * 36 + t ** 3 * (28 - lifted)
    tail.push([ox + x, oy + y, 3.3 - t * 1.1])
  }
  paintChain(buf, tail, COAT, 8, 5)

  // Haunches either side, then front legs and socks.
  paintShape(buf, union(E(17.5, 44.5, 6.4, 5.4), E(34.5, 44.5, 6.4, 5.4)), boxOf(ox + 10, oy + 38, ox + 43, oy + 51), COAT, { fur: true })
  paintShape(buf, union(capsule(ox + 21, oy + 41, ox + 21, oy + 47, 3, 3), capsule(ox + 31, oy + 41, ox + 31, oy + 47, 3, 3)), boxOf(ox + 17, oy + 38, ox + 36, oy + 50), COAT)
  if (state !== 'correct') { paintPaw(buf, ox + 21, oy + 47, 4.2, 2.7); if (state !== 'thinking') paintPaw(buf, ox + 31, oy + 47, 4.2, 2.7) }
  else { paintPaw(buf, ox + 21, oy + 47, 4.2, 2.7); paintPaw(buf, ox + 31, oy + 47, 4.2, 2.7) }
  if (sad) { buf.rect(ox + 19, oy + 46, 3, 2, P.flame[1]); buf.set(ox + 20, oy + 46, P.flame[3]); buf.rect(ox + 30, oy + 47, 3, 2, P.sea[3]); buf.rect(ox + 22, oy + 49, 2, 1, P.sun[3]) } // paint on his paws
  paintSmock(buf, ox, oy)

  // Ears (outer in cream, inner pink with a tuft), then the head with its tufted cheeks.
  // Sad ears flop outward and down instead of standing up.
  const earL = sad ? triangle(ox + 14, oy + 31, ox + 3, oy + 30, ox + 22, oy + 22) : triangle(ox + 12, oy + 29, ox + 10, oy + 14 + earLift, ox + 22, oy + 23)
  const earR = sad ? triangle(ox + 38, oy + 31, ox + 49, oy + 30, ox + 30, oy + 22) : triangle(ox + 40, oy + 29, ox + 42, oy + 14 + earLift, ox + 30, oy + 23)
  paintShape(buf, earL, boxOf(ox + 8, oy + 10, ox + 24, oy + 30), COAT)
  paintShape(buf, earR, boxOf(ox + 28, oy + 10, ox + 44, oy + 30), COAT)
  if (sad) {
    buf.rect(ox + 7, oy + 28, 6, 2, P.ui[3]); buf.rect(ox + 10, oy + 26, 5, 2, P.ui[3]); buf.set(ox + 5, oy + 29, P.fur[1])
    buf.rect(ox + 39, oy + 28, 6, 2, P.ui[3]); buf.rect(ox + 37, oy + 26, 5, 2, P.ui[3]); buf.set(ox + 47, oy + 29, P.fur[1])
  } else {
    buf.rect(ox + 13, oy + 20 + earLift, 2, 6, P.ui[3]); buf.rect(ox + 14, oy + 19 + earLift, 2, 5, P.ui[3]); buf.set(ox + 14, oy + 19 + earLift, P.fur[3])
    buf.rect(ox + 38, oy + 20 + earLift, 2, 6, P.ui[3]); buf.rect(ox + 36, oy + 19 + earLift, 2, 5, P.ui[3]); buf.set(ox + 37, oy + 19 + earLift, P.fur[3])
    buf.set(ox + 11, oy + 14 + earLift, P.fur[1]); buf.set(ox + 41, oy + 14 + earLift, P.fur[1])
  }
  const head = union(E(26, 29.5, 14.2, 9.3), triangle(ox + 12.5, oy + 31, ox + 7.5, oy + 37, ox + 15, oy + 37), triangle(ox + 39.5, oy + 31, ox + 44.5, oy + 37, ox + 37, oy + 37), triangle(ox + 14, oy + 36, ox + 12, oy + 40, ox + 18, oy + 38), triangle(ox + 38, oy + 36, ox + 40, oy + 40, ox + 34, oy + 38))
  paintShape(buf, head, boxOf(ox + 6, oy + 18, ox + 46, oy + 42), COAT, { fur: true })
  paintHeadMarks(buf, ox + 26, oy + 23, ox + 13, ox + 39, oy + 31)

  // Face
  const blinking = state === 'idle' && step >= 10 && step <= 12
  const look = sad ? 'sad' : state === 'correct' ? 'happy' : blinking ? 'blink' : state === 'thinking' ? 'up' : state === 'guess' ? 'wide' : 'ahead'
  paintEye(buf, ox + 17, oy + 26, look, -1, frame); paintEye(buf, ox + 29, oy + 26, look, 1, frame + 3)
  paintMuzzle(buf, ox + 26, oy + 32, sad ? 'frown' : state === 'guess' ? 'open' : state === 'correct' ? 'smile' : 'closed')
  buf.rect(ox + 14, oy + 35, 3, 1, P.ui[3]); buf.rect(ox + 36, oy + 35, 3, 1, P.ui[3])
  for (const [dy, len] of [[32, 6], [34, 7], [36, 6]] as const) {
    buf.rect(ox + 12 - len + 1, oy + dy, len, 1, P.paper[3]); buf.rect(ox + 40, oy + dy, len, 1, P.paper[3])
  }

  // Arms: a paw raised to the chin while thinking, both flung up when it is right.
  if (state === 'thinking') {
    paintShape(buf, capsule(ox + 35, oy + 41, ox + 31, oy + 37, 3, 2.8), boxOf(ox + 26, oy + 33, ox + 40, oy + 45), COAT)
    paintPaw(buf, ox + 30, oy + 36, 3.6, 3)
  } else if (state === 'correct') {
    for (const side of [-1, 1]) {
      const sx = ox + 26 + side * 11
      const ax = ox + 26 + side * 14.5
      paintShape(buf, capsule(sx, oy + 40, ax, oy + 31, 3.8, 3.4), boxOf(Math.min(sx, ax) - 6, oy + 24, Math.max(sx, ax) + 6, oy + 44), COAT)
      paintPaw(buf, ax + side * 1.5, oy + 29, 3.8, 3.3)
    }
  }

  // The beret rides above the ears; it tosses higher during the celebration jump.
  if (beret) {
    const fly = state === 'correct' ? (jump < -2 ? -4 : -2) : 0
    // Sad: it has slipped to one side and hangs over the ear.
    if (sad) paintBeret(buf, ox + 33, oy + 21.5, 10.5, 4.6, 5)
    else paintBeret(buf, ox + 27, oy + 19.5 + fly, 11.5, 5)
  }

  // Confetti
  if (state === 'correct') {
    const bits = [
      { x: 4, y: 7, c: P.sun[4] }, { x: 48, y: 9, c: P.flame[1] }, { x: 8, y: 24, c: P.sea[3] },
      { x: 46, y: 22, c: P.sky[4] }, { x: 28, y: 3, c: P.sun[3] },
    ]
    bits.forEach((bit, i) => {
      const drift = frame === 0 ? 0 : ((Math.floor(frame / 2) + i) % 3 - 1) * 2
      buf.rect(bit.x, Math.max(0, bit.y + drift), 3, 3, bit.c); buf.set(bit.x + 1, Math.max(0, bit.y + drift), P.paper[4])
    })
  }
}

function paintZ(buf: PixelBuf, x: number, y: number, colour: string): void {
  buf.rect(x, y, 6, 1, colour); buf.rect(x + 4, y + 1, 1, 1, colour); buf.rect(x + 3, y + 2, 1, 1, colour)
  buf.rect(x + 2, y + 3, 1, 1, colour); buf.rect(x + 1, y + 4, 1, 1, colour); buf.rect(x, y + 5, 6, 1, colour)
}

function paintSleepingHaiku(buf: PixelBuf, frame: number, beret: boolean): void {
  const { breath, flick } = catPose(frame)
  paintSleeper(buf, 1, 26, { breath, flick, beret })
  // Rising, fading z glyphs.
  if (frame === 0) {
    paintZ(buf, 36, 18, P.paper[4]); paintZ(buf, 45, 5, P.paper[2])
  } else {
    for (let i = 0; i < 2; i++) {
      const cycle = (Math.floor(frame / 3) + i * 7) % 14
      const zx = 34 + i * 9 + (cycle > 7 ? 1 : 0), zy = 24 - cycle * 1.5
      if (zy < 0) continue
      paintZ(buf, zx, Math.round(zy), cycle < 5 ? P.paper[4] : cycle < 10 ? P.paper[3] : P.paper[1])
    }
  }
}

/** Haiku in one pose, on its own detail-grid buffer (W x H). Exposed for the art tests. */
export function paintHaiku(state: HaikuState, frame: number, beret: boolean): PixelBuf {
  const buf = new PixelBuf(W, H)
  if (state === 'resting' || state === 'sleeping') paintSleepingHaiku(buf, frame, beret)
  else paintSittingHaiku(buf, state, frame, beret)
  return buf
}

