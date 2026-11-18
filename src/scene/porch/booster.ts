import { P } from '../palette'
import { defineSprite, drawSprite } from '../sprite'

export const BOOSTER_WIDTH = 9
export const BOOSTER_HEIGHT = 15

const colours = {
  d: P.stone[0],
  s: P.stone[1],
  m: P.stone[2],
  l: P.stone[3],
  h: P.stone[4],
  t: P.sea[2],
  T: P.sea[3],
  o: P.flame[1],
  f: P.flame[3],
  c: P.flame[4],
}

const body = [
  '..ddddd..',
  '..dhmsd..',
  '..dTttd..',
  '..dhmsd..',
  '.ddhmsdd.',
  'dldhmsdsd',
  'dd.ddd.dd',
  '..dhmmd..',
  '..dofod..',
]

const flames = [
  ['...ofo...', '...fcf...', '....c....', '....f....', '....o....', '.........'],
  ['..ofofo..', '...fcf...', '...fc....', '....c....', '...fo....', '....o....'],
  ['..ofofo..', '...fcf...', '...cf....', '....c....', '...f.....', '....o....'],
]

export const boosterFrames = flames.map(flame => defineSprite([...body, ...flame], colours))

export function drawBooster(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number): void {
  drawSprite(ctx, boosterFrames[Math.floor(frame / 3) % boosterFrames.length], x, y)
}
