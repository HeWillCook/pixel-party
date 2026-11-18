import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { APP_NAME } from '../constants'
import { P } from '../scene/palette'
import { PixelScene } from '../scene/PixelScene'
import { drawSea, drawSun, drawSunsetSky, mulberry32 } from '../scene/procedural'
import { defineSprite, drawSprite } from '../scene/sprite'

const beachSign = defineSprite(
  [
    '..dddddddddddddd..',
    '.dhhhhhhhhhhhhhhd.',
    'dhwwwwwwwwwwwwwwhd',
    'dhwwddddddddddwwhd',
    'dhwwwwwwwwwwwwwwhd',
    '.dhhhhhhhhhhhhhhd.',
    '..ddddddwwdddddd..',
    '.......dwwd.......',
    '.......dwwd.......',
    '.......dwwd.......',
    '.......dwwd.......',
    '.......dwwd.......',
    '.......dwwd.......',
    '.......dwwd.......',
    '......ddwwdd......',
  ],
  { d: P.wood[0], w: P.wood[2], h: P.wood[4] },
)

function drawEmptyBeachDusk(ctx: CanvasRenderingContext2D, frame: number) {
  const { width, height } = ctx.canvas
  const portrait = height > width
  const horizon = portrait ? 132 : 84
  const shore = portrait ? 212 : 124
  const sunX = portrait ? 124 : 228
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, h)
  }

  ctx.imageSmoothingEnabled = false
  drawSunsetSky(ctx, width, horizon, frame)

  // Ordered dither seams across dusk sky bands
  for (let band = 1; band < 6; band++) {
    const y = Math.floor((horizon * band) / 6)
    for (let row = -2; row < 2; row++) {
      for (let x = row & 1; x < width; x += 2) {
        rect(x, y + row, 1, 1, P.sky[band])
      }
    }
  }

  // Faint twilight stars high in the upper sky
  const stars = portrait
    ? [[28, 18], [72, 12], [148, 22], [108, 32], [44, 38]]
    : [[32, 12], [88, 16], [146, 10], [204, 18], [278, 12], [62, 26], [254, 24]]
  for (const [sx, sy] of stars) {
    rect(sx, sy, 1, 1, (sx + sy) % 2 === 0 ? P.sun[4] : P.paper[4])
  }

  // Low setting sun and calm dusk sea
  drawSun(ctx, sunX, horizon + 1, portrait ? 18 : 22, horizon)
  drawSea(ctx, width, horizon, shore - horizon, sunX, frame, mulberry32(404))

  // Empty sandy beach shore with wet tide edge & animated sea foam
  rect(0, shore, width, height - shore, P.paper[4])
  rect(0, shore, width, 6, P.paper[3])
  for (let row = 4; row < 7; row++) {
    for (let x = row % 2; x < width; x += 2) {
      rect(x, shore + row, 1, 1, P.paper[4])
    }
  }
  for (let x = 0; x < width; x += 11) {
    const foamX = (x + Math.floor(frame / 10) * 2) % width
    rect(foamX, shore - 1, 8, 1, P.sea[4])
    rect(foamX + 1, shore + (x % 2), 6, 1, P.paper[4])
  }

  // Subtle sand pebbles & footprints leading onto the empty beach
  for (let x = 18; x < width; x += 37) {
    const y = shore + 12 + ((x * 5) % Math.max(12, height - shore - 18))
    rect(x, y, 2, 1, P.paper[2])
    rect(x + 7, y + 3, 1, 1, P.stone[2])
  }
  for (let step = 0; step < 5; step++) {
    const fx = (portrait ? 24 : 46) + step * 11
    const fy = height - 18 - step * 3 + (step % 2 === 0 ? 2 : -1)
    rect(fx, fy, 3, 1, P.paper[2])
  }

  // Sparse dune grass tufts at the outer edges
  const tufts = portrait ? [14, 24, width - 22, width - 12] : [20, 32, 46, width - 38, width - 24]
  for (const gx of tufts) {
    const gy = shore + 8 + (gx % 6)
    rect(gx, gy, 1, 7, P.foliage[1])
    rect(gx - 2, gy + 2, 1, 5, P.foliage[2])
    rect(gx + 2, gy + 3, 1, 4, P.foliage[2])
  }

  // Lone wooden trail sign planted in the dusk sand
  const signX = portrait ? width - 30 : Math.floor(width * 0.78)
  const signY = shore + 6
  drawSprite(ctx, beachSign, signX, signY)
}

export default function NotFound() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    drawEmptyBeachDusk(ctx, frame)
  }, [])

  return (
    <div
      data-testid="not-found-page"
      className="relative flex min-h-screen flex-col items-center justify-end px-4 pb-10 pt-24 text-center sm:justify-center sm:pb-8 sm:pt-8"
    >
      <title>{`Not found · ${APP_NAME}`}</title>
      <meta name="robots" content="noindex" />

      <div className="fixed inset-0 z-0 pointer-events-none">
        <PixelScene draw={draw} className="h-full w-full" />
      </div>

      <div className="pp-wood-panel relative z-10 flex w-full max-w-md flex-col items-center p-6 sm:p-8">
        <span className="pp-chip mb-3 px-3 py-0.5 text-base uppercase tracking-widest">
          404 · Dusk Beach
        </span>
        <h1 className="pp-word text-3xl uppercase leading-tight sm:text-4xl">
          You wandered off the porch
        </h1>
        <p className="mt-2 mb-6 text-lg text-muted-foreground">
          Just an empty patch of beach at dusk out here.
        </p>
        <Link
          to="/home"
          data-testid="not-found-home"
          className="pp-btn inline-flex min-h-[44px] items-center justify-center px-6 py-2 text-lg uppercase tracking-wider"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
