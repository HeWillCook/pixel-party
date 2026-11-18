import { P } from '../palette'
import { defineSprite, drawSprite } from '../sprite'

const colours = { d: P.stone[0], m: P.stone[2], h: P.stone[4], t: P.wood[3], o: P.flame[1], f: P.flame[3], c: P.flame[4] }
const body = ['..ddd..', '.dmhmd.', 'dmhmhmd', 'dmmmmmd', 'dtttttd', '.dmmmd.', '.ddddd.']
const flames = [
  ['..ofo..', '..fcf..', '...c...', '...f...', '...o...', '.......'],
  ['..ofo..', '..fcf..', '..fc...', '...c...', '...f...', '...o...'],
  ['..ofo..', '..fcf..', '...cf..', '...c...', '..f....', '.......'],
]

export const boosterFrames = flames.map(flame => defineSprite([...body, ...flame], colours))

export function drawBooster(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number): void {
  drawSprite(ctx, boosterFrames[Math.floor(frame / 3) % boosterFrames.length], x, y)
}
