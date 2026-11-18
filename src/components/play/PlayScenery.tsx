import { useEffect, useRef, useState } from 'react'
import { P } from '../../scene/palette'
import { drawPorchRoof } from '../../scene/porch/drawPorch'
import { sprites } from '../../scene/porch/sprites'
import { drawSea, drawSun, drawSunsetSky, mulberry32 } from '../../scene/procedural'
import { drawSprite } from '../../scene/sprite'
import { useSceneClock } from '../../scene/useSceneClock'

export function PlayScenery() {
  const ref = useRef<HTMLCanvasElement>(null)
  const frame = useSceneClock(6)
  const [size, setSize] = useState({ width: 0, height: 0, pixel: 3 })

  useEffect(() => {
    const canvas = ref.current
    const container = canvas?.parentElement
    if (!canvas || !container) return
    const measure = () => {
      const bounds = container.getBoundingClientRect()
      const pixel = Math.max(2, Math.round(parseFloat(getComputedStyle(canvas).getPropertyValue('--px')) || 3))
      const width = Math.max(1, Math.ceil(bounds.width / pixel))
      const height = Math.max(1, Math.ceil(bounds.height / pixel))
      setSize(prev => (prev.width === width && prev.height === height && prev.pixel === pixel ? prev : { width, height, pixel }))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    measure()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || size.width <= 0 || size.height <= 0) return
    const { width, height, pixel } = size
    canvas.width = width
    canvas.height = height
    canvas.style.width = `${width * pixel}px`
    canvas.style.height = `${height * pixel}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    const rect = (color: string, x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = color
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    }

    const narrow = width < 240
    const horizon = Math.round(height * (narrow ? 0.52 : 0.56))
    const floor = Math.round(height * (narrow ? 0.9 : 0.89))
    const shore = floor - (narrow ? 34 : 42)
    const sunX = Math.round(width * (narrow ? 0.78 : 0.8))
    const sunR = narrow ? 16 : 22

    // Sunset sky with ordered dithering between bands
    drawSunsetSky(ctx, width, horizon, frame)
    for (let band = 1; band < P.sky.length; band++) {
      const y = Math.floor((horizon * band) / P.sky.length)
      for (let row = -2; row < 2; row++) {
        for (let x = row & 1; x < width; x += 2) {
          rect(P.sky[band], x, y + row, 1, 1)
        }
      }
    }

    // Subtle twilight stars in upper purple sky
    for (const [sx, sy] of [
      [Math.round(width * 0.24), Math.max(22, Math.round(horizon * 0.24))],
      [Math.round(width * 0.64), Math.max(20, Math.round(horizon * 0.2))],
      [Math.round(width * 0.91), Math.max(25, Math.round(horizon * 0.31))],
    ]) {
      rect(P.sun[4], sx, sy, 1, 1)
    }

    // Sun glow + round sunset disc
    for (let offset = -(sunR + 5); offset <= sunR + 5; offset++) {
      const y = horizon + 1 + offset
      if (y >= horizon) break
      const half = Math.floor(Math.sqrt((sunR + 5) * (sunR + 5) - offset * offset))
      for (let x = sunX - half; x <= sunX + half; x++) {
        if ((x + y) % 2 === 0) rect(P.sun[2], x, y, 1, 1)
      }
    }
    drawSun(ctx, sunX, horizon + 1, sunR, horizon)

    // Layered pixel clouds flanking the canvas
    const clouds = narrow
      ? [
          [16, Math.round(horizon * 0.38), 38],
          [width - 62, Math.round(horizon * 0.48), 44],
        ]
      : [
          [Math.round(width * 0.14), Math.round(horizon * 0.34), 62],
          [Math.round(width * 0.72), Math.round(horizon * 0.28), 70],
          [Math.round(width * 0.81), Math.round(horizon * 0.52), 54],
          [Math.round(width * 0.21), Math.round(horizon * 0.62), 48],
        ]
    for (const [cx, cy, cw] of clouds) {
      rect(P.sky[4], cx + 6, cy, cw - 12, 1)
      rect(P.sky[4], cx, cy + 1, cw, 2)
      rect(P.sky[3], cx + 10, cy + 3, cw - 20, 1)
    }

    // Distant island + lighthouse visible to the left of the easel on desktop
    if (!narrow) {
      const islandX = Math.round(width * 0.17)
      for (let x = 0; x < 44; x++) {
        const rise = Math.round(Math.sin((x / 44) * Math.PI) * 5)
        rect(P.sky[2], islandX + x, horizon - rise, 1, rise + 1)
      }
      drawSprite(ctx, sprites.lighthouse, islandX + 14, horizon - sprites.lighthouse.h)
    }

    // Sea with broken water streaks & narrowing sun reflection
    drawSea(ctx, width, horizon, shore - horizon, sunX, frame, mulberry32(417))
    rect(P.sea[0], 0, horizon, width, 2)
    for (let y = horizon + 3; y < shore - 2; y += 3) {
      const spread = Math.max(2, Math.floor((y - horizon) * 0.6))
      const phase = Math.floor(frame / 2)
      for (let index = 0; index < 3; index++) {
        const x = sunX - spread + ((y * (index + 3) + index * 19 + phase) % (spread * 2))
        rect(index === 1 ? P.sun[3] : P.sun[2], x, y, 3 + ((index + y) % 4), 1)
      }
    }

    // Beach strip & seafoam
    rect(P.paper[3], 0, shore, width, floor - shore)
    rect(P.paper[4], 0, shore + 5, width, Math.max(1, floor - shore - 5))
    for (let row = 3; row < 5; row++) {
      for (let x = row % 2; x < width; x += 2) rect(P.paper[4], x, shore + row, 1, 1)
    }
    for (let x = 0; x < width; x += 10) {
      const offset = (x + Math.floor(frame / 3) * 2) % width
      rect(P.sea[4], offset, shore - 1, 7, 1)
      rect(P.paper[4], offset + 1, shore + (x % 3 === 0 ? 0 : 1), 5, 1)
    }

    // Beach grass tufts & small driftwood
    for (const gx of [Math.round(width * 0.16), Math.round(width * 0.24), Math.round(width * 0.88), Math.round(width * 0.94)]) {
      const gy = shore + 3
      rect(P.foliage[2], gx, gy, 1, 6)
      rect(P.foliage[3], gx - 2, gy + 2, 1, 4)
      rect(P.foliage[2], gx + 2, gy + 3, 1, 3)
    }
    if (!narrow) {
      const dx = Math.round(width * 0.72)
      rect(P.wood[2], dx, shore + 5, 9, 1)
      rect(P.wood[3], dx + 2, shore + 4, 4, 1)
      rect(P.wood[1], dx + 6, shore + 6, 4, 1)
    }

    // Porch railing & floorboards
    const railTop = floor - (narrow ? 22 : 28)
    rect(P.wood[0], 0, railTop, width, 5)
    rect(P.wood[2], 0, railTop + 1, width, 3)
    rect(P.wood[4], 0, railTop + 1, width, 1)
    for (let x = 14; x < width - 8; x += 12) {
      rect(P.wood[0], x, railTop + 5, 4, floor - railTop - 5)
      rect(P.wood[1], x + 1, railTop + 5, 2, floor - railTop - 5)
      rect(P.wood[3], x + 2, railTop + 5, 1, floor - railTop - 5)
    }
    rect(P.wood[1], 0, floor - 3, width, 3)
    rect(P.wood[2], 0, floor, width, height - floor)
    for (let y = floor; y < height; y += 7) {
      rect(P.wood[0], 0, y, width, 1)
      rect(P.wood[3], 0, y + 1, width, 1)
      for (let x = (y * 7) % 45; x < width; x += 53) {
        rect(P.wood[1], x, y + 3, 15, 1)
        rect(P.wood[3], x + 18, y + 5, 7, 1)
      }
    }

    // Hint of house wall & corner porch post on far left, plus right porch post on desktop
    if (!narrow) {
      const wallWidth = Math.min(28, Math.round(width * 0.065))
      rect(P.wood[2], 0, 14, wallWidth, floor - 14)
      for (let y = 16; y < floor; y += 7) {
        rect(P.wood[1], 0, y, wallWidth, 1)
        rect(P.wood[3], 0, y + 1, wallWidth, 1)
      }
      const postX = wallWidth - 2
      rect(P.wood[0], postX, 14, 11, floor - 14)
      rect(P.wood[2], postX + 2, 14, 6, floor - 14)
      rect(P.wood[4], postX + 8, 14, 1, floor - 14)
      for (let y = 24; y < floor; y += 22) rect(P.wood[1], postX + 4, y, 1, 8)

      const rightPostX = width - 8
      rect(P.wood[0], rightPostX, 14, 8, floor - 14)
      rect(P.wood[2], rightPostX + 2, 14, 4, floor - 14)
      rect(P.wood[4], rightPostX + 2, 14, 1, floor - 14)
    }

    // Roof fascia beam across the top
    drawPorchRoof(ctx, 0)
  }, [size, frame])

  return <canvas className="play-scenery" ref={ref} aria-hidden="true" />
}
